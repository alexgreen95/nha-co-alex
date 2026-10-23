'use strict';

const {createHmac, timingSafeEqual} = require('node:crypto');

const SIGNED_PATH = '/api/content-push-fanout';
const MAX_CLOCK_SKEW_SECONDS = 90;
const HMAC_SECRET_RE = /^[a-f0-9]{64}$/;
const SIGNATURE_RE = /^[a-f0-9]{64}$/;
const TIMESTAMP_RE = /^\d{10,12}$/;

function isValidHmacSecret(secret) {
  return typeof secret === 'string' && HMAC_SECRET_RE.test(secret);
}

function constantTimeTextEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifyHmacRequest(req, secret, nowMs = Date.now()) {
  if (!isValidHmacSecret(secret)) return false;
  const timestamp = req.headers?.['x-nca-fanout-timestamp'];
  const signature = req.headers?.['x-nca-fanout-signature'];
  if (typeof timestamp !== 'string' || !TIMESTAMP_RE.test(timestamp) ||
      typeof signature !== 'string' || !SIGNATURE_RE.test(signature)) return false;

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(timestampSeconds) ||
      Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  const canonical = `${timestamp}\nGET\n${SIGNED_PATH}`;
  const expected = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(canonical, 'utf8')
    .digest('hex');
  return constantTimeTextEqual(signature, expected);
}

module.exports = {
  MAX_CLOCK_SKEW_SECONDS,
  SIGNED_PATH,
  isValidHmacSecret,
  verifyHmacRequest
};
