'use strict';

const {timingSafeEqual} = require('node:crypto');
const {isValidHmacSecret, hasUnambiguousAuthHeaders, verifyHmacRequest} = require('../server/content-push-fanout-auth.cjs');
const {databaseConfig, createDatabase} = require('../server/content-push-fanout-db.cjs');
const {runWorker} = require('../server/content-push-fanout-worker.cjs');

function createHandler({env = process.env, database = createDatabase, worker = runWorker} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ok: false}); }

    if (typeof env.CRON_SECRET !== 'string' ||
      env.CRON_SECRET.length < 32 || env.CRON_SECRET.length > 256 ||
      /[^A-Za-z0-9_-]/.test(env.CRON_SECRET)) return res.status(503).json({ok: false});
    if (env.NCA_CONTENT_PUSH_FANOUT_HMAC_SECRET !== undefined &&
      !isValidHmacSecret(env.NCA_CONTENT_PUSH_FANOUT_HMAC_SECRET)) return res.status(503).json({ok: false});

    // Vercel's parsed query and raw URL are both checked; no caller work inputs.
    if ((req.url && req.url.includes('?')) ||
      (req.query != null && (!req.query || typeof req.query !== 'object' || Array.isArray(req.query) || Object.keys(req.query).length)) ||
      (req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length))) {
      return res.status(400).json({ok: false});
    }

    if (!hasUnambiguousAuthHeaders(req)) return res.status(401).json({ok: false});
    const supplied = req.headers?.authorization;
    const expected = 'Bearer ' + env.CRON_SECRET;
    const bearerOk = typeof supplied === 'string' &&
      Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    const hmacOk = verifyHmacRequest(req, env.NCA_CONTENT_PUSH_FANOUT_HMAC_SECRET);
    if (!bearerOk && !hmacOk) return res.status(401).json({ok: false});

    if (env.NCA_CONTENT_PUSH_FANOUT_ENABLED !== 'true') return res.status(503).json({ok: false});

    let db;
    try {
      db = database(databaseConfig(env));
      const result = await worker({db});
      return res.status(result.errors ? 503 : 200).json({ok: result.errors === 0, result});
    } catch { return res.status(503).json({ok: false}); }
    finally { if (db) { try { await db.close(); } catch { /* No raw errors or retry. */ } } }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
