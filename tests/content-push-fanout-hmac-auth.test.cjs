'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {createHmac} = require('node:crypto');
const {
  MAX_CLOCK_SKEW_SECONDS,
  SIGNED_PATH,
  isValidHmacSecret,
  verifyHmacRequest
} = require('../server/content-push-fanout-auth.cjs');

const secret = 'ab'.repeat(32);
const nowMs = Date.UTC(2026, 9, 23, 13, 50, 0);
const timestamp = String(Math.floor(nowMs / 1000));

function signature(ts = timestamp, key = secret) {
  return createHmac('sha256', Buffer.from(key, 'hex'))
    .update(`${ts}\nGET\n${SIGNED_PATH}`, 'utf8')
    .digest('hex');
}
function request(headers = {}) { return {headers}; }

describe('content push fanout HMAC auth', () => {
  it('accepts an exact fresh signature', () => {
    assert.equal(verifyHmacRequest(request({
      'x-nca-fanout-timestamp': timestamp,
      'x-nca-fanout-signature': signature()
    }), secret, nowMs), true);
  });

  it('accepts the exact clock-skew boundary and rejects older/future requests', () => {
    for (const delta of [-MAX_CLOCK_SKEW_SECONDS, MAX_CLOCK_SKEW_SECONDS]) {
      const ts = String(Math.floor(nowMs / 1000) + delta);
      assert.equal(verifyHmacRequest(request({
        'x-nca-fanout-timestamp': ts,
        'x-nca-fanout-signature': signature(ts)
      }), secret, nowMs), true);
    }
    for (const delta of [-(MAX_CLOCK_SKEW_SECONDS + 1), MAX_CLOCK_SKEW_SECONDS + 1]) {
      const ts = String(Math.floor(nowMs / 1000) + delta);
      assert.equal(verifyHmacRequest(request({
        'x-nca-fanout-timestamp': ts,
        'x-nca-fanout-signature': signature(ts)
      }), secret, nowMs), false);
    }
  });

  it('rejects missing, malformed and mismatched headers', () => {
    assert.equal(verifyHmacRequest(request(), secret, nowMs), false);
    assert.equal(verifyHmacRequest(request({
      'x-nca-fanout-timestamp': timestamp,
      'x-nca-fanout-signature': '0'.repeat(64)
    }), secret, nowMs), false);
    assert.equal(verifyHmacRequest(request({
      'x-nca-fanout-timestamp': timestamp + 'x',
      'x-nca-fanout-signature': signature()
    }), secret, nowMs), false);
    assert.equal(verifyHmacRequest(request({
      'x-nca-fanout-timestamp': timestamp,
      'x-nca-fanout-signature': signature().toUpperCase()
    }), secret, nowMs), false);
  });

  it('requires an exact 32-byte lowercase-hex master secret', () => {
    assert.equal(isValidHmacSecret(secret), true);
    for (const value of [undefined, '', 'ab'.repeat(31), 'ab'.repeat(33), 'AB'.repeat(32), 'g'.repeat(64)]) {
      assert.equal(isValidHmacSecret(value), false);
      assert.equal(verifyHmacRequest(request({
        'x-nca-fanout-timestamp': timestamp,
        'x-nca-fanout-signature': signature()
      }), value, nowMs), false);
    }
  });
});
