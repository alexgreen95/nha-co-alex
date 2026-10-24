'use strict';

const {timingSafeEqual} = require('node:crypto');
const {SIGNED_PATH, TIMESTAMP_HEADER, isValidHmacSecret, hasUnambiguousAuthHeaders, verifyHmacRequest} = require('../server/personal-push-worker-auth.cjs');
const {databaseConfig, createDatabase} = require('../server/personal-push-db.cjs');
const {vapidConfig, createTransport} = require('../server/personal-push-transport.cjs');
const {runWorker} = require('../server/personal-push-worker.cjs');

function createHandler({env = process.env, database = createDatabase, transport = createTransport, worker = runWorker} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ok: false}); }
    const hmacSecret = env.NCA_PERSONAL_PUSH_WORKER_HMAC_SECRET;
    if (hmacSecret !== undefined && !isValidHmacSecret(hmacSecret)) return res.status(503).json({ok: false});
    if (!hasUnambiguousAuthHeaders(req)) return res.status(401).json({ok: false});
    const supplied = req.headers?.authorization;
    if (supplied === undefined && !Object.hasOwn(req.headers, TIMESTAMP_HEADER)) return res.status(401).json({ok: false});
    if (typeof env.NCA_PUSH_WORKER_SECRET !== 'string' ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(env.NCA_PUSH_WORKER_SECRET)) return res.status(503).json({ok: false});
    const expected = 'Bearer ' + env.NCA_PUSH_WORKER_SECRET;
    const bearerOk = typeof supplied === 'string' && Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    const hmacOk = verifyHmacRequest(req, hmacSecret);
    if (!bearerOk && !hmacOk) return res.status(401).json({ok: false});
    // Callers cannot supply endpoints, recipient IDs, outcomes, limits or tokens.
    if ((req.url != null && req.url !== SIGNED_PATH) ||
      (req.query != null && (typeof req.query !== 'object' || Array.isArray(req.query) || Object.keys(req.query).length)) ||
      (req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length))) {
      return res.status(400).json({ok: false});
    }
    if (env.NCA_PERSONAL_PUSH_WORKER_ENABLED !== 'true') return res.status(503).json({ok: false});
    let db;
    try {
      const config = databaseConfig(env), vapid = vapidConfig(env);
      const sender = transport(vapid);
      db = database(config);
      const result = await worker({db, transport: sender});
      return res.status(result.errors ? 503 : 200).json({ok: result.errors === 0, result});
    } catch { return res.status(503).json({ok: false}); }
    finally { if (db) await db.close().catch(() => {}); }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
