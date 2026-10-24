'use strict';

const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs'), vm = require('node:vm');
const {createRequire} = require('node:module');
const net = require('node:net'), tls = require('node:tls');
const auth = require('../server/content-push-worker-auth.cjs');

// Public, deterministic test fixtures, not provisioned credentials.
const secret = 'ab'.repeat(32), bearer = 'f'.repeat(48);
const path = '/api/content-push-worker', timestampHeader = 'x-nca-content-push-timestamp';
const signatureHeader = 'x-nca-content-push-signature';
const nowMs = Date.UTC(2026, 9, 23, 13, 50), timestamp = String(Math.floor(nowMs / 1000));
const environment = {NCA_PUSH_WORKER_SECRET: bearer, NCA_CONTENT_PUSH_WORKER_HMAC_SECRET: secret,
  NCA_CONTENT_PUSH_WORKER_ENABLED: 'false'};
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

function sign(ts, {method = 'POST', url = path, key = secret, separator = '\n', asciiKey = false} = {}) {
  return crypto.createHmac('sha256', Buffer.from(key, asciiKey ? 'utf8' : 'hex'))
    .update(`${ts}${separator}${method}${separator}${url}`, 'utf8').digest('hex');
}
function hmacHeaders(ts = String(Math.floor(Date.now() / 1000)), options) {
  return {[timestampHeader]: ts, [signatureHeader]: sign(ts, options)};
}
function req(headers = hmacHeaders(), extra = {}) {
  return {method: 'POST', url: path, headers, ...extra};
}
function endpoint({env = environment, failure} = {}) {
  const calls = {databaseConfig: 0, vapidConfig: 0, database: 0, transport: 0, worker: 0, close: 0};
  const db = {close: async () => { calls.close++; }}, transport = {};
  const filename = require.resolve('../api/content-push-worker.js'), module = {exports: {}};
  const localRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {module, Buffer, process: {env: {}},
    require: name => {
      if (name === '../server/content-push-db.cjs') return {
        databaseConfig: () => { calls.databaseConfig++; return {}; },
        createDatabase: () => { calls.database++; return db; }
      };
      if (name === '../server/personal-push-transport.cjs') return {
        vapidConfig: () => { calls.vapidConfig++; return {}; },
        createTransport: () => { calls.transport++; return transport; }
      };
      if (name === '../server/content-push-worker.cjs') return {runWorker: async args => {
        calls.worker++;
        assert.equal(args.db, db); assert.equal(args.transport, transport);
        assert.deepEqual(Object.keys(args).sort(), ['db', 'transport']);
        if (failure) throw Error('PRIVATE_FIXTURE_DETAIL');
        return {claimed: 0, sent: 0, suppressed: 0, deferred: 0, failed: 0, errors: 0};
      }};
      return localRequire(name);
    }});
  return {calls, async invoke(request = req()) {
    const res = {headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(n) { this.code = n; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; }};
    await module.exports.createHandler({env})(request, res);
    return res;
  }};
}
function noWork(calls) {
  assert.ok(Object.values(calls).every(n => n === 0), 'authentication/disabled gates must precede all configuration and factories');
}

describe('content sender fixed-operation HMAC', () => {
  it('pins POST/path/headers and matches an independent HMAC known answer', () => {
    assert.equal(auth.SIGNED_METHOD, 'POST'); assert.equal(auth.SIGNED_PATH, path);
    assert.equal(auth.TIMESTAMP_HEADER, timestampHeader); assert.equal(auth.SIGNATURE_HEADER, signatureHeader);
    assert.equal(auth.MAX_CLOCK_SKEW_SECONDS, 90);
    assert.equal(auth.verifyHmacRequest(req(hmacHeaders(timestamp)), secret, nowMs), true);
    // Independently computed using Python hashlib, using decoded 32-byte key.
    assert.equal(sign(timestamp), 'e4e97d41da0e59e432fa5a71bd42a759221ab2fdf37564cac238cc29ed25b6af');
  });

  for (const [label, value] of [['missing', undefined], ['empty', ''], ['short', 'ab'.repeat(31)],
    ['long', 'ab'.repeat(33)], ['uppercase', secret.toUpperCase()], ['nonhex', 'g'.repeat(64)],
    ['space', ' ' + secret], ['newline', secret + '\n'], ['array', [secret]], ['buffer', Buffer.from(secret)]]) {
    it('rejects ' + label + ' HMAC secret', () => {
      assert.equal(auth.isValidHmacSecret(value), false);
      assert.equal(auth.verifyHmacRequest(req(hmacHeaders(timestamp)), value, nowMs), false);
    });
  }

  it('requires finite numeric clock values before doing timestamp arithmetic', () => {
    for (const clock of [NaN, Infinity, -Infinity, '1792763400000', Symbol('clock'), null, {}]) {
      assert.equal(auth.verifyHmacRequest(req(hmacHeaders(timestamp)), secret, clock), false);
    }
  });

  it('enforces inclusive 90-second bounds and does not claim one-time use', () => {
    for (const delta of [-91, -90, 0, 90, 91]) {
      const ts = String(Number(timestamp) + delta);
      assert.equal(auth.verifyHmacRequest(req(hmacHeaders(ts)), secret, nowMs), Math.abs(delta) <= 90);
    }
    const request = req(hmacHeaders(timestamp));
    assert.equal(auth.verifyHmacRequest(request, secret, nowMs), true);
    assert.equal(auth.verifyHmacRequest(request, secret, nowMs), true);
    assert.equal(auth.verifyHmacRequest(request, secret, nowMs + 91000), false);
  });

  for (const [label, ts] of [['NaN', 'NaN'], ['Infinity', 'Infinity'], ['short', '123'],
    ['float', timestamp + '.0'], ['exponent', '1e10'], ['negative', '-' + timestamp],
    ['space', ' ' + timestamp], ['newline', timestamp + '\n'], ['array', [timestamp]]]) {
    it('rejects ' + label + ' timestamp header', () => {
      const headers = hmacHeaders(timestamp); headers[timestampHeader] = ts;
      assert.equal(auth.verifyHmacRequest(req(headers), secret, nowMs), false);
    });
  }

  it('rejects another method/path/key/encoding even if the MAC is otherwise valid', () => {
    for (const options of [{method: 'GET'}, {url: '/api/content-push-fanout'}, {url: path + '/'},
      {separator: '\r\n'}, {key: 'cd'.repeat(32)}, {asciiKey: true}]) {
      assert.equal(auth.verifyHmacRequest(req(hmacHeaders(timestamp, options)), secret, nowMs), false);
    }
    for (const extra of [{method: 'GET'}, {method: 'post'}, {url: '/api/content-push-fanout'},
      {url: path + '/'}, {url: path + '?'}, {url: path + '?limit=1'}, {url: '/api/content%2Dpush-worker'},
      {url: undefined}]) {
      assert.equal(auth.verifyHmacRequest(req(hmacHeaders(timestamp), extra), secret, nowMs), false);
    }
  });

  it('uses timingSafeEqual with two exactly 32-byte MAC buffers', () => {
    const filename = require.resolve('../server/content-push-worker-auth.cjs'), module = {exports: {}};
    let compared = 0;
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {module, Buffer,
      require: () => ({createHmac: crypto.createHmac, timingSafeEqual(a, b) {
        compared++; assert.equal(a.length, 32); assert.equal(b.length, 32);
        return crypto.timingSafeEqual(a, b);
      }})});
    const verify = module.exports.verifyHmacRequest;
    assert.equal(verify(req(hmacHeaders(timestamp)), secret, nowMs), true);
    assert.equal(verify(req({...hmacHeaders(timestamp), [signatureHeader]: '0'.repeat(64)}), secret, nowMs), false);
    assert.equal(verify(req({...hmacHeaders(timestamp), [signatureHeader]: '0'.repeat(63)}), secret, nowMs), false);
    assert.equal(compared, 2);
  });
});

describe('sender authentication before disabled gate', () => {
  for (const [label, headers] of [['missing', {}], ['undefined headers', undefined],
    ['bad Bearer', {authorization: 'Bearer ' + 'z'.repeat(48)}],
    ['bad HMAC', {...hmacHeaders(), [signatureHeader]: '0'.repeat(64)}]]) {
    it(label + ' authentication returns 401 while disabled', async () => {
      const e = endpoint(), res = await e.invoke({...req(), headers});
      assert.equal(res.code, 401); assert.deepEqual(res.body, {ok: false}); noWork(e.calls);
      assert.equal(res.headers['Cache-Control'], 'no-store');
    });
  }

  for (const flag of [undefined, 'false', false, true, 'TRUE', 'true ']) {
    it('valid credentials cannot bypass disabled flag ' + String(flag), async () => {
      for (const headers of [hmacHeaders(), {authorization: 'Bearer ' + bearer},
        {...hmacHeaders(), authorization: 'Bearer ' + bearer}]) {
        const e = endpoint({env: {...environment, NCA_CONTENT_PUSH_WORKER_ENABLED: flag}});
        const res = await e.invoke(req(headers, {body: {}}));
        assert.equal(res.code, 503); assert.deepEqual(res.body, {ok: false}); noWork(e.calls);
      }
    });
  }

  it('does not read DB/CA/VAPID configuration while disabled', async () => {
    let forbiddenReads = 0;
    const env = new Proxy(environment, {get(target, key) {
      if (/DATABASE|CA_CERT|VAPID/.test(String(key))) { forbiddenReads++; throw Error('NO_RUNTIME_CONFIG_READ'); }
      return target[key];
    }});
    for (const headers of [hmacHeaders(), {authorization: 'Bearer ' + bearer}]) {
      const e = endpoint({env}), res = await e.invoke(req(headers));
      assert.equal(res.code, 503); noWork(e.calls);
    }
    assert.equal(forbiddenReads, 0);
  });

  for (const [label, configured] of [['empty', ''], ['nonhex', 'z'.repeat(64)], ['short', 'ab'],
    ['uppercase', secret.toUpperCase()], ['newline', secret + '\n'], ['array', [secret]]]) {
    it('invalid HMAC env (' + label + ') returns generic 503', async () => {
      const e = endpoint({env: {...environment, NCA_CONTENT_PUSH_WORKER_HMAC_SECRET: configured}});
      const res = await e.invoke(req({...hmacHeaders(), authorization: 'Bearer ' + bearer}));
      assert.equal(res.code, 503); assert.deepEqual(res.body, {ok: false}); noWork(e.calls);
    });
  }

  it('keeps Bearer compatibility when HMAC env is absent and requires valid Bearer config', async () => {
    const e = endpoint({env: {...environment, NCA_CONTENT_PUSH_WORKER_HMAC_SECRET: undefined}});
    const res = await e.invoke(req({authorization: 'Bearer ' + bearer}));
    assert.equal(res.code, 503); noWork(e.calls);
    const bad = await e.invoke(req(hmacHeaders())); assert.equal(bad.code, 401); noWork(e.calls);
    for (const configured of [undefined, '', 'short', bearer + '\n']) {
      const badConfig = endpoint({env: {...environment, NCA_PUSH_WORKER_SECRET: configured}});
      assert.equal((await badConfig.invoke(req(hmacHeaders()))).code, 503); noWork(badConfig.calls);
    }
  });

  it('rejects malformed/array/partial/foreign auth headers, including valid alternate proof', async () => {
    const good = hmacHeaders();
    for (const headers of [
      {[timestampHeader]: good[timestampHeader]}, {[signatureHeader]: good[signatureHeader]},
      {...good, [timestampHeader]: [good[timestampHeader]]}, {...good, [signatureHeader]: [good[signatureHeader]]},
      {...good, [signatureHeader]: good[signatureHeader] + ',invalid'}, {...good, [signatureHeader]: good[signatureHeader].toUpperCase()},
      {...good, authorization: ['Bearer ' + bearer]}, {...good, authorization: 'Bearer ' + bearer + ',invalid'},
      {...good, authorization: 'Basic invalid'}, {...good, Authorization: 'Bearer ' + bearer},
      {...good, 'x-nca-content-push-extra': 'unexpected'}, {...good, 'x-nca-fanout-signature': good[signatureHeader]},
      {authorization: 'Bearer ' + bearer, [timestampHeader]: good[timestampHeader]}
    ]) {
      const e = endpoint(), res = await e.invoke(req(headers));
      assert.equal(res.code, 401); noWork(e.calls);
    }
  });

  it('rejects duplicate auth headers even when Node keeps a valid normalized value', async () => {
    const headers = {...hmacHeaders(), authorization: 'Bearer ' + bearer};
    const raw = Object.entries(headers).flat();
    const clean = endpoint(); assert.equal((await clean.invoke(req(headers, {rawHeaders: raw}))).code, 503); noWork(clean.calls);
    for (const name of Object.keys(headers)) {
      for (const value of [headers[name], 'invalid']) {
        const e = endpoint(), res = await e.invoke(req(headers, {rawHeaders: [...raw, name.toUpperCase(), value]}));
        assert.equal(res.code, 401); noWork(e.calls);
      }
    }
    const socket = new net.Socket();
    try {
      const incoming = new (require('node:http').IncomingMessage)(socket);
      const duplicated = ['Authorization', 'Bearer ' + bearer, 'Authorization', 'invalid'];
      incoming._addHeaderLines(duplicated, duplicated.length);
      assert.ok(incoming.headers.authorization === 'Bearer ' + bearer);
      const e = endpoint(), res = await e.invoke(req(incoming.headers, {rawHeaders: incoming.rawHeaders}));
      assert.equal(res.code, 401); noWork(e.calls);
    } finally { socket.destroy(); }
  });

  it('rejects malformed raw metadata and normalized/raw mismatches', async () => {
    const headers = hmacHeaders(), raw = Object.entries(headers).flat();
    for (const rawHeaders of [null, {}, ['missing-value'], [false, 'value'],
      [timestampHeader, 'different'], raw.slice(0, 2), [...raw, 'x-nca-fanout-timestamp', 'unexpected']]) {
      const e = endpoint(), res = await e.invoke(req(headers, {rawHeaders}));
      assert.equal(res.code, 401); noWork(e.calls);
    }
  });

  it('rejects stale and future HMAC requests at the endpoint', async () => {
    for (const delta of [-1000, 1000]) {
      const ts = String(Math.floor(Date.now() / 1000) + delta);
      const e = endpoint(), res = await e.invoke(req(hmacHeaders(ts)));
      assert.equal(res.code, 401); noWork(e.calls);
    }
  });

  it('retains POST-only behavior and rejects caller-controlled work', async () => {
    for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const e = endpoint(), res = await e.invoke(req(hmacHeaders(), {method}));
      assert.equal(res.code, 405); assert.equal(res.headers.Allow, 'POST'); noWork(e.calls);
    }
    for (const extra of [{body: {limit: 100}}, {body: {endpoint: 'https://fixture.invalid'}},
      {body: {lease_token: 'fixture'}}, {body: []}, {body: '{}'}, {query: {limit: 100}},
      {query: []}, {url: path + '?limit=100'}, {url: path + '/'}, {url: '/api/content-push-fanout'}]) {
      const e = endpoint(), res = await e.invoke(req({authorization: 'Bearer ' + bearer}, extra));
      assert.equal(res.code, 400); noWork(e.calls);
    }
  });

  it('accepts the fixed pg_net empty-JSON request shape only as disabled', async () => {
    const headers = {...hmacHeaders(), 'content-type': 'application/json', 'user-agent': 'nca-supabase-content-sender-hmac-v1'};
    const e = endpoint(), res = await e.invoke(req(headers, {body: {}, query: {}, rawHeaders: Object.entries(headers).flat()}));
    assert.equal(res.code, 503); noWork(e.calls);
  });

  it('retains enabled mocked Bearer/HMAC success and generic failure/close behavior', async () => {
    // Unit-only dependency stubs. No real runtime configuration is enabled.
    for (const headers of [hmacHeaders(), {authorization: 'Bearer ' + bearer}]) {
      const env = {...environment, NCA_CONTENT_PUSH_WORKER_ENABLED: 'true'}, e = endpoint({env});
      const res = await e.invoke(req(headers, {body: {}}));
      assert.equal(res.code, 200); assert.equal(res.body.ok, true);
      assert.ok(Object.values(e.calls).every(n => n === 1));
      const failed = endpoint({env, failure: true}), failure = await failed.invoke(req(headers));
      assert.equal(failure.code, 503); assert.deepEqual(failure.body, {ok: false}); assert.equal(failed.calls.close, 1);
    }
  });

  it('neither returns fixture credentials nor adds logging/retry/scheduler code', async () => {
    const e = endpoint(), res = await e.invoke(req(hmacHeaders()));
    const output = JSON.stringify(res.body);
    for (const value of [secret, bearer, 'PRIVATE_FIXTURE_DETAIL']) assert.ok(!output.includes(value));
    for (const file of ['server/content-push-worker-auth.cjs', 'api/content-push-worker.js']) {
      const source = fs.readFileSync(file, 'utf8');
      assert.ok(!/console\.|process\.stdout|process\.stderr/.test(source));
      assert.ok(!source.includes(secret)); assert.ok(!source.includes(bearer));
      assert.ok(!/cron\.schedule|while\s*\(\s*true/.test(source));
    }
  });
});
