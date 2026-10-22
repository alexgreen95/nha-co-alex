'use strict';

const {timingSafeEqual} = require('node:crypto');
const {databaseConfig, createDatabase} = require('../server/content-push-db.cjs');
const {vapidConfig, createTransport} = require('../server/personal-push-transport.cjs');
const {runWorker} = require('../server/content-push-worker.cjs');

function createHandler({env = process.env, database = createDatabase, transport = createTransport, worker = runWorker} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ok: false}); }
    if (env.NCA_CONTENT_PUSH_WORKER_ENABLED !== 'true' || typeof env.NCA_PUSH_WORKER_SECRET !== 'string' ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(env.NCA_PUSH_WORKER_SECRET)) return res.status(503).json({ok: false});
    const supplied = req.headers.authorization;
    const expected = 'Bearer ' + env.NCA_PUSH_WORKER_SECRET;
    if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return res.status(401).json({ok: false});
    // Callers cannot supply endpoints, recipient IDs, outcomes, limits or tokens.
    if (req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) {
      return res.status(400).json({ok: false});
    }
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
