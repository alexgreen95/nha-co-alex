'use strict';

const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {createHmac} = require('node:crypto');
const net = require('node:net'), tls = require('node:tls');
const fs = require('node:fs'), vm = require('node:vm');
const {createRequire} = require('node:module');
const {createHandler} = require('../api/content-push-fanout.js');
const ca = require('./helpers/personal-push-test-ca.cjs');
const {
  MAX_CLOCK_SKEW_SECONDS,
  SIGNED_PATH,
  isValidHmacSecret,
  verifyHmacRequest
} = require('../server/content-push-fanout-auth.cjs');

const secret = 'ab'.repeat(32);
const nowMs = Date.UTC(2026, 9, 23, 13, 50, 0);
const timestamp = String(Math.floor(nowMs / 1000));

const originalConnect = net.Socket.prototype.connect, originalTLS = tls.connect;
let networkAttempts = 0;
before(() => {
  const forbidden = () => { networkAttempts++; throw Error('NETWORK_FORBIDDEN'); };
  net.Socket.prototype.connect = forbidden; tls.connect = forbidden;
});
after(() => {
  net.Socket.prototype.connect = originalConnect; tls.connect = originalTLS;
  assert.equal(networkAttempts, 0);
});

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

  it('matches an independently computed HMAC-SHA256 known answer', () => {
    // Public synthetic fixture; independently calculated with Python hashlib.
    assert.equal(timestamp, '1792763400');
    assert.equal(verifyHmacRequest(request({
      'x-nca-fanout-timestamp': timestamp,
      'x-nca-fanout-signature': '47bd2edf7861ce92d9f2547584e30716bad1aba3feddb3a7ff2ca69472948a9f'
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
    for (const value of [undefined, '', 'ab'.repeat(31), 'ab'.repeat(33), 'AB'.repeat(32), 'g'.repeat(64),
      ' ' + secret, secret + '\n', [secret], Buffer.from(secret)]) {
      assert.equal(isValidHmacSecret(value), false);
      assert.equal(verifyHmacRequest(request({
        'x-nca-fanout-timestamp': timestamp,
        'x-nca-fanout-signature': signature()
      }), value, nowMs), false);
    }
  });

  it('fails closed for an invalid clock', () => {
    for (const clock of [NaN, Infinity, -Infinity, 'invalid-clock']) {
      assert.equal(verifyHmacRequest(request({
        'x-nca-fanout-timestamp': timestamp, 'x-nca-fanout-signature': signature()
      }), secret, clock), false);
    }
  });

  it('allows replays only inside the documented timestamp window, not one-time use', () => {
    const req = request({'x-nca-fanout-timestamp': timestamp, 'x-nca-fanout-signature': signature()});
    assert.equal(verifyHmacRequest(req, secret, nowMs), true);
    assert.equal(verifyHmacRequest(req, secret, nowMs), true);
    assert.equal(verifyHmacRequest(req, secret, nowMs + 91000), false);
    assert.equal(verifyHmacRequest(req, secret, nowMs + 90999), true);
  });

  it('rejects signatures over another key, method, path, separator or timestamp', () => {
    for (const canonical of [`${timestamp}\nPOST\n${SIGNED_PATH}`, `${timestamp}\nGET\n/api/other`,
      `${timestamp}\r\nGET\r\n${SIGNED_PATH}`, `${timestamp}0\nGET\n${SIGNED_PATH}`]) {
      const bad = createHmac('sha256', Buffer.from(secret, 'hex')).update(canonical).digest('hex');
      assert.equal(verifyHmacRequest(request({
        'x-nca-fanout-timestamp': timestamp, 'x-nca-fanout-signature': bad
      }), secret, nowMs), false);
    }
    assert.equal(verifyHmacRequest(request({
      'x-nca-fanout-timestamp': timestamp, 'x-nca-fanout-signature': signature(timestamp, 'cd'.repeat(32))
    }), secret, nowMs), false);
  });

  it('uses timingSafeEqual only with equal-length MAC buffers', () => {
    const filename = require.resolve('../server/content-push-fanout-auth.cjs');
    const module = {exports: {}}, localRequire = createRequire(filename);
    let compared = 0;
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {module, Buffer,
      require: name => name === 'node:crypto' ? {createHmac, timingSafeEqual: (a, b) => {
        compared++; assert.equal(a.length, 64); assert.equal(b.length, 64);
        return require('node:crypto').timingSafeEqual(a, b);
      }} : localRequire(name)});
    const verify = module.exports.verifyHmacRequest;
    assert.equal(verify(request({'x-nca-fanout-timestamp': timestamp, 'x-nca-fanout-signature': signature()}), secret, nowMs), true);
    assert.equal(verify(request({'x-nca-fanout-timestamp': timestamp, 'x-nca-fanout-signature': '0'.repeat(64)}), secret, nowMs), false);
    assert.equal(verify(request({'x-nca-fanout-timestamp': timestamp, 'x-nca-fanout-signature': '0'.repeat(63)}), secret, nowMs), false);
    assert.equal(compared, 2);
  });
});

const env = {NCA_CONTENT_PUSH_FANOUT_ENABLED: 'true', CRON_SECRET: 'f'.repeat(48),
  NCA_CONTENT_PUSH_FANOUT_HMAC_SECRET: secret, NCA_PUSH_FANOUT_CA_CERT_B64: ca.base64,
  NCA_PUSH_FANOUT_DATABASE_URL: 'postgresql://nca_push_fanout_runner.cwwulyrutdvuekydydew:fixture-only@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres'};
function freshHeaders() {
  const ts = String(Math.floor(Date.now() / 1000));
  return {'x-nca-fanout-timestamp': ts, 'x-nca-fanout-signature': signature(ts)};
}
async function invoke(headers, environment = env, extra = {}, throwWorker = false) {
  let built = 0, worked = 0, closed = 0;
  const res = {headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.code = n; return this; }, json(b) { this.body = b; return this; }};
  await createHandler({env: environment,
    database: () => { built++; return {close: async () => { closed++; }}; },
    worker: async () => { worked++; if (throwWorker) throw Error('PRIVATE_FIXTURE_DETAIL'); return {errors: 0}; }
  })({method: 'GET', url: '/api/content-push-fanout', headers, ...extra}, res);
  return {res, built, worked, closed};
}

describe('fanout HMAC endpoint integration and ambiguous-header rejection', () => {
  it('accepts HMAC without Bearer and retains the existing Bearer path', async () => {
    for (const headers of [freshHeaders(), {authorization: 'Bearer ' + env.CRON_SECRET},
      {...freshHeaders(), authorization: 'Bearer ' + env.CRON_SECRET}]) {
      const x = await invoke(headers);
      assert.equal(x.res.code, 200); assert.equal(x.built, 1); assert.equal(x.worked, 1); assert.equal(x.closed, 1);
      assert.equal(x.res.headers['Cache-Control'], 'no-store');
    }
    const y = await invoke({authorization: 'Bearer ' + env.CRON_SECRET}, {...env, NCA_CONTENT_PUSH_FANOUT_HMAC_SECRET: undefined});
    assert.equal(y.res.code, 200);
  });

  it('fails before DB/worker for every flag other than the exact string true', async () => {
    for (const flag of [undefined, 'false', false, true, 'TRUE', 'true ']) {
      for (const headers of [freshHeaders(), {authorization: 'Bearer ' + env.CRON_SECRET}]) {
        const x = await invoke(headers, {...env, NCA_CONTENT_PUSH_FANOUT_ENABLED: flag});
        assert.equal(x.res.code, 503); assert.deepEqual(x.res.body, {ok: false});
        assert.equal(x.built, 0); assert.equal(x.worked, 0); assert.equal(x.closed, 0);
      }
    }
  });

  it('keeps malformed configured secrets fail-closed even with the other valid proof', async () => {
    for (const environment of [{...env, CRON_SECRET: undefined}, {...env, CRON_SECRET: 'bad'},
      {...env, NCA_CONTENT_PUSH_FANOUT_HMAC_SECRET: ''}, {...env, NCA_CONTENT_PUSH_FANOUT_HMAC_SECRET: secret + '\n'}]) {
      const x = await invoke({...freshHeaders(), authorization: 'Bearer ' + env.CRON_SECRET}, environment);
      assert.equal(x.res.code, 503); assert.equal(x.built, 0); assert.equal(x.worked, 0);
    }
  });

  it('rejects missing/malformed/stale/future/wrong proofs without DB access', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    for (const headers of [{}, {'x-nca-fanout-timestamp': ts}, {'x-nca-fanout-signature': signature(ts)},
      {'x-nca-fanout-timestamp': [ts], 'x-nca-fanout-signature': signature(ts)},
      {'x-nca-fanout-timestamp': ts, 'x-nca-fanout-signature': [signature(ts)]},
      {'x-nca-fanout-timestamp': ts + '\n', 'x-nca-fanout-signature': signature(ts + '\n')},
      {'x-nca-fanout-timestamp': ts, 'x-nca-fanout-signature': signature(ts) + '\n'},
      {'x-nca-fanout-timestamp': ts, 'x-nca-fanout-signature': '0'.repeat(64)},
      ...[-1000, 1000].map(delta => {
        const t = String(Number(ts) + delta);
        return {'x-nca-fanout-timestamp': t, 'x-nca-fanout-signature': signature(t)};
      })]) {
      const x = await invoke(headers);
      assert.equal(x.res.code, 401); assert.equal(x.built, 0); assert.equal(x.worked, 0);
    }
  });

  it('rejects duplicate raw auth headers even if normalization kept one valid proof', async () => {
    const headers = {...freshHeaders(), authorization: 'Bearer ' + env.CRON_SECRET};
    const rawHeaders = Object.entries(headers).flat();
    const {hasUnambiguousAuthHeaders} = require('../server/content-push-fanout-auth.cjs');
    assert.equal(hasUnambiguousAuthHeaders({headers, rawHeaders}), true);
    const valid = await invoke(headers, env, {rawHeaders});
    assert.equal(valid.res.code, 200); assert.equal(valid.worked, 1);
    for (const name of Object.keys(headers)) {
      for (const second of [headers[name], 'invalid']) {
        const duplicate = [...rawHeaders, name.toUpperCase(), second];
        const x = await invoke(headers, env, {rawHeaders: duplicate});
        assert.equal(x.res.code, 401); assert.equal(x.built, 0); assert.equal(x.worked, 0);
        assert.equal(verifyHmacRequest({headers, rawHeaders: duplicate}, secret), false);
      }
    }
  });

  it('detects duplicates discarded by the actual Node IncomingMessage normalizer', async () => {
    const socket = new net.Socket();
    try {
      const req = new (require('node:http').IncomingMessage)(socket);
      const raw = ['Authorization', 'Bearer ' + env.CRON_SECRET, 'Authorization', 'invalid'];
      req._addHeaderLines(raw, raw.length); // The parser also records the header count.
      assert.ok(req.headers.authorization === 'Bearer ' + env.CRON_SECRET, 'Node keeps the first Authorization value');
      const x = await invoke(req.headers, env, {rawHeaders: req.rawHeaders});
      assert.equal(x.res.code, 401); assert.equal(x.built, 0); assert.equal(x.worked, 0);
    } finally { socket.destroy(); }
  });

  it('rejects malformed alternate credentials rather than silently falling back', async () => {
    const hmac = freshHeaders();
    for (const headers of [
      {...hmac, authorization: ['Bearer ' + env.CRON_SECRET]},
      {...hmac, authorization: 'Bearer ' + env.CRON_SECRET + ', invalid'},
      {...hmac, authorization: 'Basic invalid'},
      {...hmac, Authorization: 'Bearer ' + env.CRON_SECRET},
      {...hmac, 'x-nca-fanout-auth': 'unexpected'},
      {authorization: 'Bearer ' + env.CRON_SECRET, 'x-nca-fanout-timestamp': [hmac['x-nca-fanout-timestamp']]},
      {...hmac, authorization: 'Bearer ' + env.CRON_SECRET, 'x-nca-fanout-signature': hmac['x-nca-fanout-signature'] + ',invalid'}
    ]) {
      const x = await invoke(headers);
      assert.equal(x.res.code, 401); assert.equal(x.built, 0); assert.equal(x.worked, 0);
    }
  });

  it('rejects malformed raw metadata and raw/normalized discrepancies', async () => {
    const headers = freshHeaders(), raw = Object.entries(headers).flat();
    for (const rawHeaders of [null, {}, ['missing-value'], [false, 'value'],
      ['x-nca-fanout-timestamp', 'different'], raw.slice(0, 2), [...raw, 'x-nca-fanout-extra', 'unexpected']]) {
      const x = await invoke(headers, env, {rawHeaders});
      assert.equal(x.res.code, 401); assert.equal(x.built, 0); assert.equal(x.worked, 0);
    }
  });

  it('preserves method/query/body rejection on the HMAC path', async () => {
    for (const [extra, code] of [[{method: 'POST'}, 405], [{url: '/api/content-push-fanout?limit=1'}, 400],
      [{query: {event_id: '1'}}, 400], [{body: {lease_token: 'invalid'}}, 400]]) {
      const x = await invoke(freshHeaders(), env, extra);
      assert.equal(x.res.code, code); assert.equal(x.built, 0); assert.equal(x.worked, 0);
    }
  });

  it('returns only generic worker failures and closes without disclosing credentials', async () => {
    const x = await invoke(freshHeaders(), env, {}, true);
    assert.equal(x.res.code, 503); assert.deepEqual(x.res.body, {ok: false}); assert.equal(x.closed, 1);
    const output = JSON.stringify(x.res.body);
    for (const value of [secret, env.CRON_SECRET, ca.base64, 'fixture-only', 'PRIVATE_FIXTURE_DETAIL']) {
      assert.ok(!output.includes(value), 'response must not contain sensitive material');
    }
    for (const file of ['api/content-push-fanout.js', 'server/content-push-fanout-auth.cjs']) {
      const source = fs.readFileSync(file, 'utf8');
      assert.ok(!/console\.|process\.stdout|process\.stderr/.test(source), 'auth must not log');
      assert.ok(!source.includes(secret), 'public test key must not be a runtime credential');
    }
  });
});
