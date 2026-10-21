'use strict';

const {createECDH, timingSafeEqual} = require('node:crypto');
const https = require('node:https');
const webPush = require('web-push');

function bytes(value, length) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('INVALID_PUSH_CONFIG');
  const b = Buffer.from(value, 'base64url');
  if (b.length !== length || b.toString('base64url') !== value) throw new Error('INVALID_PUSH_CONFIG');
  return b;
}

function vapidConfig(env) {
  const publicKey = env.NCA_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = env.NCA_PUSH_VAPID_PRIVATE_KEY;
  const subject = env.NCA_PUSH_VAPID_SUBJECT;
  const pub = bytes(publicKey, 65), priv = bytes(privateKey, 32);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(priv);
  if (!timingSafeEqual(pub, ecdh.getPublicKey())) throw new Error('INVALID_PUSH_CONFIG');
  if (typeof subject !== 'string' || subject.length > 256 || /[\r\n]/.test(subject)) throw new Error('INVALID_PUSH_CONFIG');
  const u = new URL(subject);
  if (!((u.protocol === 'mailto:' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.pathname)) ||
    (u.protocol === 'https:' && u.hostname && !u.username && !u.password))) throw new Error('INVALID_PUSH_CONFIG');
  return Object.freeze({subject, publicKey, privateKey});
}

// Convert a public point without generating or persisting any VAPID credentials.
function validateSubscription(subscription) {
  try {
    const u = new URL(subscription.endpoint);
    const hostOK = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(u.hostname) ||
      /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname);
    if (!hostOK || u.protocol !== 'https:' || u.username || u.password || u.hash || (u.port && u.port !== '443') ||
      subscription.endpoint.length > 2048) return false;
    const pub = bytes(subscription.keys.p256dh, 65);
    if (pub[0] !== 4) return false;
    require('node:crypto').ECDH.convertKey(pub, 'prime256v1');
    bytes(subscription.keys.auth, 16);
    return true;
  } catch { return false; }
}

function createTransport(vapid, {request = https.request, timeoutMs = 5000} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw new Error('INVALID_PUSH_CONFIG');
  return {
    send(subscription, payload, ttl) {
      if (!validateSubscription(subscription)) return Promise.resolve('malformed_subscription');
      let details;
      try {
        details = webPush.generateRequestDetails(subscription, JSON.stringify(payload), {
          vapidDetails: vapid, TTL: Math.max(0, Math.min(60, Math.floor(ttl))), contentEncoding: 'aes128gcm', urgency: 'normal'
        });
      } catch { return Promise.resolve('malformed_subscription'); }
      return new Promise(resolve => {
        let req, done = false;
        const finish = outcome => { if (!done) { done = true; clearTimeout(timer); resolve(outcome); } };
        // Absolute deadline includes DNS, TLS and body/response time; no redirects/retries.
        const timer = setTimeout(() => { finish('network'); req?.destroy(); }, timeoutMs);
        try {
          req = request(details.endpoint, {method: 'POST', headers: details.headers, agent: false}, res => {
            const status = res.statusCode;
            let received = 0;
            res.on('data', b => { received += b.length; if (received > 16384) { finish('network'); req.destroy(); } });
            res.on('error', () => finish('network'));
            res.on('end', () => finish(status >= 200 && status < 300 ? 'sent' :
              status === 404 || status === 410 ? 'invalid_subscription' :
              status === 400 || status === 413 ? 'malformed_subscription' : 'transient'));
            res.resume();
          });
          req.on('error', () => finish('network'));
          req.end(details.body);
        } catch { finish('network'); req?.destroy(); }
      });
    }
  };
}

module.exports = {vapidConfig, validateSubscription, createTransport};
