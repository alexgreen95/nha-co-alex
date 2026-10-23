'use strict';

const {createHmac, timingSafeEqual} = require('node:crypto');

const SIGNED_PATH = '/api/content-push-fanout';
const MAX_CLOCK_SKEW_SECONDS = 90;
const HMAC_SECRET_RE = /^[a-f0-9]{64}$/;
const SIGNATURE_RE = /^[a-f0-9]{64}$/;
const TIMESTAMP_RE = /^\d{10,12}$/;
const AUTH_HEADERS = new Set(['authorization', 'x-nca-fanout-timestamp', 'x-nca-fanout-signature']);

function isValidHmacSecret(secret) {
  return typeof secret === 'string' && HMAC_SECRET_RE.test(secret);
}

function hasUnambiguousAuthHeaders(req) {
  const headers = req?.headers;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return false;
  for (const name of Object.keys(headers)) {
    const lower = name.toLowerCase();
    if (lower.startsWith('x-nca-fanout-') && !AUTH_HEADERS.has(lower)) return false;
    if (AUTH_HEADERS.has(lower) && (name !== lower || typeof headers[name] !== 'string')) return false;
  }
  // Node can discard duplicate Authorization values in req.headers. Inspect
  // raw headers too, before accepting either credential; never trust only the
  // normalized first value. Framework test doubles may omit rawHeaders.
  if (req.rawHeaders !== undefined) {
    if (!Array.isArray(req.rawHeaders) || req.rawHeaders.length % 2) return false;
    const seen = new Set();
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i], value = req.rawHeaders[i + 1];
      if (typeof name !== 'string' || typeof value !== 'string') return false;
      const lower = name.toLowerCase();
      if (lower.startsWith('x-nca-fanout-') && !AUTH_HEADERS.has(lower)) return false;
      if (!AUTH_HEADERS.has(lower)) continue;
      if (seen.has(lower) || headers[lower] !== value) return false;
      seen.add(lower);
    }
    for (const name of AUTH_HEADERS) if (Object.hasOwn(headers, name) && !seen.has(name)) return false;
  }
  if (Object.hasOwn(headers, 'authorization') && !/^Bearer [A-Za-z0-9_-]{32,256}$/.test(headers.authorization)) return false;
  const hasTimestamp = Object.hasOwn(headers, 'x-nca-fanout-timestamp');
  const hasSignature = Object.hasOwn(headers, 'x-nca-fanout-signature');
  return hasTimestamp === hasSignature && (!hasTimestamp ||
    (TIMESTAMP_RE.test(headers['x-nca-fanout-timestamp']) && SIGNATURE_RE.test(headers['x-nca-fanout-signature'])));
}

function constantTimeTextEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifyHmacRequest(req, secret, nowMs = Date.now()) {
  if (!isValidHmacSecret(secret) || !hasUnambiguousAuthHeaders(req)) return false;
  const timestamp = req.headers?.['x-nca-fanout-timestamp'];
  const signature = req.headers?.['x-nca-fanout-signature'];
  if (typeof timestamp !== 'string' || !TIMESTAMP_RE.test(timestamp) ||
      typeof signature !== 'string' || !SIGNATURE_RE.test(signature)) return false;

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isFinite(nowMs) || !Number.isSafeInteger(nowSeconds) || !Number.isSafeInteger(timestampSeconds) ||
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
  hasUnambiguousAuthHeaders,
  isValidHmacSecret,
  verifyHmacRequest
};
