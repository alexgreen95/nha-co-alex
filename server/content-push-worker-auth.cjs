'use strict';

const {createHmac, timingSafeEqual} = require('node:crypto');

// Separate key, header namespace and fixed operation: never share fanout auth.
const SIGNED_METHOD = 'POST';
const SIGNED_PATH = '/api/content-push-worker';
const MAX_CLOCK_SKEW_SECONDS = 90;
const TIMESTAMP_HEADER = 'x-nca-content-push-timestamp';
const SIGNATURE_HEADER = 'x-nca-content-push-signature';
const HEX = /^[a-f0-9]{64}$/;
const TIMESTAMP = /^\d{10,12}$/;
const AUTH_HEADERS = new Set(['authorization', TIMESTAMP_HEADER, SIGNATURE_HEADER]);

function isValidHmacSecret(secret) {
  return typeof secret === 'string' && HEX.test(secret);
}

function hasUnambiguousAuthHeaders(req) {
  const headers = req?.headers;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return false;
  for (const name of Object.keys(headers)) {
    const lower = name.toLowerCase();
    if (lower.startsWith('x-nca-') && !AUTH_HEADERS.has(lower)) return false;
    if (AUTH_HEADERS.has(lower) && (name !== lower || typeof headers[name] !== 'string')) return false;
  }
  // IncomingMessage may discard duplicate Authorization values. Reject them
  // using rawHeaders as well, before accepting either credential.
  if (req.rawHeaders !== undefined) {
    if (!Array.isArray(req.rawHeaders) || req.rawHeaders.length % 2) return false;
    const seen = new Set();
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i], value = req.rawHeaders[i + 1];
      if (typeof name !== 'string' || typeof value !== 'string') return false;
      const lower = name.toLowerCase();
      if (lower.startsWith('x-nca-') && !AUTH_HEADERS.has(lower)) return false;
      if (!AUTH_HEADERS.has(lower)) continue;
      if (seen.has(lower) || headers[lower] !== value) return false;
      seen.add(lower);
    }
    for (const name of AUTH_HEADERS) if (Object.hasOwn(headers, name) && !seen.has(name)) return false;
  }
  if (Object.hasOwn(headers, 'authorization') && !/^Bearer [A-Za-z0-9_-]{32,256}$/.test(headers.authorization)) return false;
  const hasTimestamp = Object.hasOwn(headers, TIMESTAMP_HEADER);
  const hasSignature = Object.hasOwn(headers, SIGNATURE_HEADER);
  return hasTimestamp === hasSignature && (!hasTimestamp ||
    (TIMESTAMP.test(headers[TIMESTAMP_HEADER]) && HEX.test(headers[SIGNATURE_HEADER])));
}

function verifyHmacRequest(req, secret, nowMs = Date.now()) {
  if (!isValidHmacSecret(secret) || !Number.isFinite(nowMs) || !hasUnambiguousAuthHeaders(req) ||
    req.method !== SIGNED_METHOD || req.url !== SIGNED_PATH) return false;
  const timestamp = req.headers[TIMESTAMP_HEADER], signature = req.headers[SIGNATURE_HEADER];
  if (typeof timestamp !== 'string' || !TIMESTAMP.test(timestamp) ||
    typeof signature !== 'string' || !HEX.test(signature)) return false;
  const seconds = Number(timestamp), nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(seconds) || !Number.isSafeInteger(nowSeconds) ||
    Math.abs(nowSeconds - seconds) > MAX_CLOCK_SKEW_SECONDS) return false;
  const expected = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`${timestamp}\n${SIGNED_METHOD}\n${SIGNED_PATH}`, 'utf8').digest();
  // Strict hex validation makes both buffers exactly 32 bytes.
  return timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

module.exports = {SIGNED_METHOD, SIGNED_PATH, MAX_CLOCK_SKEW_SECONDS,
  TIMESTAMP_HEADER, SIGNATURE_HEADER, isValidHmacSecret, hasUnambiguousAuthHeaders, verifyHmacRequest};
