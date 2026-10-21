'use strict';
const {ECDH} = require('node:crypto');
function createHandler(env = process.env) {
  return function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ok:false, error:{code:'METHOD_NOT_ALLOWED'}});
    }
    try {
      // Read only public material. Never import sender credentials/configuration.
      const key = env.NCA_PUSH_VAPID_PUBLIC_KEY;
      if (typeof key !== 'string' || key.length !== 87 || !/^[A-Za-z0-9_-]+$/.test(key)) throw 0;
      const point = Buffer.from(key, 'base64url');
      if (point.length !== 65 || point[0] !== 4 || point.toString('base64url') !== key) throw 0;
      ECDH.convertKey(point, 'prime256v1');
      return res.status(200).json({ok:true, vapid_public_key:key});
    } catch { return res.status(503).json({ok:false, error:{code:'UNAVAILABLE'}}); }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
