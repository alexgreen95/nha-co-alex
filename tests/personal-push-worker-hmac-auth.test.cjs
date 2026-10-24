'use strict';

const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto'), fs = require('node:fs'), vm = require('node:vm');
const {createRequire} = require('node:module');
const net = require('node:net'), tls = require('node:tls');
const auth = require('../server/personal-push-worker-auth.cjs');

// Public deterministic test inputs, never production credentials.
const secret = 'ab'.repeat(32), bearer = 'f'.repeat(48);
const path = '/api/personal-push-worker', tsHeader = 'x-nca-personal-push-timestamp';
const sigHeader = 'x-nca-personal-push-signature';
const nowMs = Date.UTC(2026, 9, 23, 13, 50), timestamp = '1792763400';
const env = {NCA_PUSH_WORKER_SECRET: bearer, NCA_PERSONAL_PUSH_WORKER_HMAC_SECRET: secret,
  NCA_PERSONAL_PUSH_WORKER_ENABLED: 'false'};
const originalConnect = net.Socket.prototype.connect, originalTLS = tls.connect;
let networkAttempts = 0;
before(() => {
  const deny = () => { networkAttempts++; throw Error('NETWORK_FORBIDDEN'); };
  net.Socket.prototype.connect = deny; tls.connect = deny;
});
after(() => {
  net.Socket.prototype.connect = originalConnect; tls.connect = originalTLS;
  assert.equal(networkAttempts, 0);
});
function sign(ts, {method = 'POST', url = path, key = secret, separator = '\n', asciiKey = false} = {}) {
  return crypto.createHmac('sha256', Buffer.from(key, asciiKey ? 'utf8' : 'hex'))
    .update(`${ts}${separator}${method}${separator}${url}`, 'utf8').digest('hex');
}
function headers(ts = String(Math.floor(Date.now() / 1000)), options) {
  return {[tsHeader]: ts, [sigHeader]: sign(ts, options)};
}
function request(h = headers(), extra = {}) { return {method: 'POST', url: path, headers: h, ...extra}; }
function endpoint(environment = env, failure = false) {
  const calls = {databaseConfig: 0, vapidConfig: 0, database: 0, transport: 0, worker: 0, close: 0};
  const db = {close: async () => { calls.close++; }}, transport = {};
  const filename = require.resolve('../api/personal-push-worker.js'), module = {exports: {}};
  const localRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {module, Buffer, process: {env: {}},
    require: name => {
      if (name === '../server/personal-push-db.cjs') return {
        databaseConfig: () => { calls.databaseConfig++; return {}; },
        createDatabase: () => { calls.database++; return db; }
      };
      if (name === '../server/personal-push-transport.cjs') return {
        vapidConfig: () => { calls.vapidConfig++; return {}; },
        createTransport: () => { calls.transport++; return transport; }
      };
      if (name === '../server/personal-push-worker.cjs') return {runWorker: async args => {
        calls.worker++;
        assert.equal(args.db, db); assert.equal(args.transport, transport);
        assert.deepEqual(Object.keys(args).sort(), ['db', 'transport']);
        if (failure) throw Error('PRIVATE_FIXTURE_DETAIL');
        return {claimed: 0, sent: 0, suppressed: 0, deferred: 0, failed: 0, errors: 0};
      }};
      return localRequire(name);
    }});
  return {calls, async invoke(req = request()) {
    const res = {headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(n) { this.code = n; return this; }, json(b) { this.body = JSON.parse(JSON.stringify(b)); return this; }};
    await module.exports.createHandler({env: environment})(req, res);
    return res;
  }};
}
function noWork(calls) { assert.ok(Object.values(calls).every(n => n === 0), 'must not initialize config/DB/transport/worker'); }

describe('Personal fixed-operation HMAC', () => {
  it('pins independent constants, Vault documentation and canonical known answer', () => {
    assert.equal(auth.SIGNED_METHOD, 'POST'); assert.equal(auth.SIGNED_PATH, path);
    assert.equal(auth.TIMESTAMP_HEADER, tsHeader); assert.equal(auth.SIGNATURE_HEADER, sigHeader);
    assert.equal(auth.MAX_CLOCK_SKEW_SECONDS, 90);
    // Independently computed with Python hashlib and a public 32-byte fixture.
    assert.equal(sign(timestamp), 'c1d5496b6f0270a8da1c90cf026533d6049ed7c9cdead4f373bc1fe98612f5ab');
    assert.equal(auth.verifyHmacRequest(request(headers(timestamp)), secret, nowMs), true);
    assert.ok(fs.readFileSync('server/personal-push-worker-auth.cjs', 'utf8').includes('nca_personal_push_worker_hmac'));
  });
  for (const [label, value] of [['missing', undefined], ['empty', ''], ['short', 'ab'.repeat(31)],
    ['long', 'ab'.repeat(33)], ['uppercase', secret.toUpperCase()], ['nonhex', 'g'.repeat(64)],
    ['space', ' ' + secret], ['newline', secret + '\n'], ['array', [secret]], ['buffer', Buffer.from(secret)]]) {
    it('rejects ' + label + ' secret', () => {
      assert.equal(auth.isValidHmacSecret(value), false);
      assert.equal(auth.verifyHmacRequest(request(headers(timestamp)), value, nowMs), false);
    });
  }
  it('enforces the inclusive 90s boundary and intentionally permits bounded replay', () => {
    for (const delta of [-91, -90, 0, 90, 91]) {
      const ts = String(Number(timestamp) + delta);
      assert.equal(auth.verifyHmacRequest(request(headers(ts)), secret, nowMs), Math.abs(delta) <= 90);
    }
    const req = request(headers(timestamp));
    assert.equal(auth.verifyHmacRequest(req, secret, nowMs), true);
    assert.equal(auth.verifyHmacRequest(req, secret, nowMs), true);
    assert.equal(auth.verifyHmacRequest(req, secret, nowMs + 91000), false);
  });
  it('rejects non-finite/non-numeric clocks before arithmetic', () => {
    for (const clock of [NaN, Infinity, -Infinity, '1792763400000', Symbol('clock'), null, {}]) {
      assert.equal(auth.verifyHmacRequest(request(headers(timestamp)), secret, clock), false);
    }
  });
  for (const [label, ts] of [['NaN', 'NaN'], ['Infinity', 'Infinity'], ['short', '123'],
    ['fraction', timestamp + '.0'], ['exponent', '1e10'], ['negative', '-' + timestamp],
    ['space', ' ' + timestamp], ['newline', timestamp + '\n'], ['array', [timestamp]]]) {
    it('rejects ' + label + ' timestamp', () => {
      assert.equal(auth.verifyHmacRequest(request({...headers(timestamp), [tsHeader]: ts}), secret, nowMs), false);
    });
  }
  it('rejects wrong/malformed signatures and wrong key encoding', () => {
    for (const sig of [undefined, '', '0'.repeat(64), sign(timestamp).toUpperCase(), sign(timestamp) + '\n',
      '0'.repeat(63), 'g'.repeat(64), [sign(timestamp)]]) {
      assert.equal(auth.verifyHmacRequest(request({...headers(timestamp), [sigHeader]: sig}), secret, nowMs), false);
    }
    for (const options of [{method: 'GET'}, {url: '/api/content-push-worker'}, {url: '/api/content-push-fanout'},
      {separator: '\r\n'}, {key: 'cd'.repeat(32)}, {asciiKey: true}]) {
      assert.equal(auth.verifyHmacRequest(request(headers(timestamp, options)), secret, nowMs), false);
    }
  });
  it('requires the actual request method/path without normalization', () => {
    for (const extra of [{method: 'GET'}, {method: 'post'}, {url: '/api/content-push-worker'},
      {url: '/api/content-push-fanout'}, {url: path + '/'}, {url: path + '?'}, {url: path + '?limit=1'},
      {url: '/api/personal%2Dpush-worker'}, {url: undefined}]) {
      assert.equal(auth.verifyHmacRequest(request(headers(timestamp), extra), secret, nowMs), false);
    }
  });
  it('compares two exactly 32-byte buffers with timingSafeEqual', () => {
    const filename = require.resolve('../server/personal-push-worker-auth.cjs'), module = {exports: {}};
    let compared = 0;
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {module, Buffer,
      require: () => ({createHmac: crypto.createHmac, timingSafeEqual(a, b) {
        compared++; assert.equal(a.length, 32); assert.equal(b.length, 32);
        return crypto.timingSafeEqual(a, b);
      }})});
    const verify = module.exports.verifyHmacRequest;
    assert.equal(verify(request(headers(timestamp)), secret, nowMs), true);
    assert.equal(verify(request({...headers(timestamp), [sigHeader]: '0'.repeat(64)}), secret, nowMs), false);
    assert.equal(verify(request({...headers(timestamp), [sigHeader]: '0'.repeat(63)}), secret, nowMs), false);
    assert.equal(compared, 2);
  });
});

describe('Personal HMAC/Bearer endpoint boundary', () => {
  for (const [label, h] of [['missing', {}], ['undefined headers', undefined],
    ['bad Bearer', {authorization: 'Bearer ' + 'z'.repeat(48)}], ['bad HMAC', {...headers(), [sigHeader]: '0'.repeat(64)}]]) {
    it(label + ' auth returns 401 even while disabled', async () => {
      const e = endpoint(), res = await e.invoke({...request(), headers: h});
      assert.equal(res.code, 401); assert.deepEqual(res.body, {ok: false}); noWork(e.calls);
      assert.equal(res.headers['Cache-Control'], 'no-store');
    });
  }
  it('an entirely missing env does not hide missing authentication behind the disabled gate', async () => {
    const e = endpoint({}), res = await e.invoke(request({})); assert.equal(res.code, 401); noWork(e.calls);
  });
  for (const flag of [undefined, 'false', false, true, 'TRUE', 'true ']) {
    it('valid credentials cannot bypass non-enabled flag ' + String(flag), async () => {
      for (const h of [headers(), {authorization: 'Bearer ' + bearer}, {...headers(), authorization: 'Bearer ' + bearer}]) {
        const e = endpoint({...env, NCA_PERSONAL_PUSH_WORKER_ENABLED: flag});
        const res = await e.invoke(request(h, {body: {}}));
        assert.equal(res.code, 503); assert.deepEqual(res.body, {ok: false}); noWork(e.calls);
      }
    });
  }
  it('never reads DB/CA/VAPID config on auth failure or while disabled', async () => {
    let reads = 0;
    const environment = new Proxy(env, {get(target, key) {
      if (/DATABASE|CA_CERT|VAPID/.test(String(key))) { reads++; throw Error('FORBIDDEN_CONFIG_READ'); }
      return target[key];
    }});
    for (const h of [headers(), {authorization: 'Bearer ' + bearer}, {}]) {
      const e = endpoint(environment), res = await e.invoke(request(h));
      assert.equal(res.code, Object.keys(h).length ? 503 : 401); noWork(e.calls);
    }
    assert.equal(reads, 0);
  });
  for (const [label, configured] of [['empty', ''], ['bad hex', 'g'.repeat(64)], ['short', 'ab'],
    ['uppercase', secret.toUpperCase()], ['newline', secret + '\n'], ['array', [secret]]]) {
    it('invalid configured HMAC (' + label + ') returns generic 503', async () => {
      const e = endpoint({...env, NCA_PERSONAL_PUSH_WORKER_HMAC_SECRET: configured});
      for (const h of [{}, {...headers(), authorization: 'Bearer ' + bearer}]) {
        const res = await e.invoke(request(h)); assert.equal(res.code, 503); assert.deepEqual(res.body, {ok: false}); noWork(e.calls);
      }
    });
  }
  it('preserves Bearer-only compatibility and fails closed on missing Bearer config', async () => {
    const e = endpoint({...env, NCA_PERSONAL_PUSH_WORKER_HMAC_SECRET: undefined});
    assert.equal((await e.invoke(request({authorization: 'Bearer ' + bearer}))).code, 503);
    assert.equal((await e.invoke(request(headers()))).code, 401); noWork(e.calls);
    for (const configured of [undefined, '', 'short', bearer + '\n']) {
      const invalid = endpoint({...env, NCA_PUSH_WORKER_SECRET: configured});
      assert.equal((await invalid.invoke(request(headers()))).code, 503); noWork(invalid.calls);
    }
  });
  it('rejects partial, array, mixed-case and foreign credentials despite a valid alternate proof', async () => {
    const good = headers();
    for (const h of [{[tsHeader]: good[tsHeader]}, {[sigHeader]: good[sigHeader]},
      {...good, [tsHeader]: [good[tsHeader]]}, {...good, [sigHeader]: [good[sigHeader]]},
      {...good, [sigHeader]: good[sigHeader] + ',invalid'}, {...good, authorization: ['Bearer ' + bearer]},
      {...good, authorization: 'Basic invalid'}, {...good, authorization: 'Bearer ' + bearer + ',invalid'},
      {...good, Authorization: 'Bearer ' + bearer}, {...good, 'x-nca-personal-push-extra': 'unexpected'},
      {...good, 'x-nca-content-push-timestamp': good[tsHeader]}, {...good, 'x-nca-fanout-signature': good[sigHeader]},
      {...good, 'x-nca-other-auth': 'unexpected'}, {authorization: 'Bearer ' + bearer, [tsHeader]: good[tsHeader]}]) {
      const e = endpoint(), res = await e.invoke(request(h)); assert.equal(res.code, 401); noWork(e.calls);
    }
  });
  it('rejects raw duplicate credentials including ones discarded by Node normalization', async () => {
    const h = {...headers(), authorization: 'Bearer ' + bearer}, raw = Object.entries(h).flat();
    const clean = endpoint(); assert.equal((await clean.invoke(request(h, {rawHeaders: raw}))).code, 503); noWork(clean.calls);
    for (const name of Object.keys(h)) for (const value of [h[name], 'invalid']) {
      const e = endpoint(), res = await e.invoke(request(h, {rawHeaders: [...raw, name.toUpperCase(), value]}));
      assert.equal(res.code, 401); noWork(e.calls);
    }
    const socket = new net.Socket();
    try {
      const incoming = new (require('node:http').IncomingMessage)(socket);
      const repeated = ['Authorization', 'Bearer ' + bearer, 'Authorization', 'invalid'];
      incoming._addHeaderLines(repeated, repeated.length);
      assert.ok(incoming.headers.authorization === 'Bearer ' + bearer);
      const e = endpoint(), res = await e.invoke(request(incoming.headers, {rawHeaders: incoming.rawHeaders}));
      assert.equal(res.code, 401); noWork(e.calls);
    } finally { socket.destroy(); }
  });
  it('rejects malformed raw metadata, missing raw credentials and normalized/raw disagreement', async () => {
    const h = headers(), raw = Object.entries(h).flat();
    for (const rawHeaders of [null, {}, ['missing-value'], [false, 'value'], [tsHeader, 'different'],
      raw.slice(0, 2), [...raw, 'x-nca-content-push-signature', 'unexpected']]) {
      const e = endpoint(), res = await e.invoke(request(h, {rawHeaders})); assert.equal(res.code, 401); noWork(e.calls);
    }
  });
  it('rejects stale and future endpoint requests', async () => {
    for (const delta of [-1000, 1000]) {
      const e = endpoint(), res = await e.invoke(request(headers(String(Math.floor(Date.now() / 1000) + delta))));
      assert.equal(res.code, 401); noWork(e.calls);
    }
  });
  it('retains 405 and rejects caller work inputs before runtime construction', async () => {
    for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const e = endpoint(), res = await e.invoke(request(headers(), {method}));
      assert.equal(res.code, 405); assert.equal(res.headers.Allow, 'POST'); noWork(e.calls);
    }
    for (const extra of [{body: {recipient: 'fixture'}}, {body: {endpoint: 'https://fixture.invalid'}},
      {body: {outcome: 'sent'}}, {body: {limit: 100}}, {body: {lease_token: 'fixture'}}, {body: []},
      {body: '{}'}, {query: {limit: 100}}, {query: []}, {url: path + '?limit=100'}, {url: path + '/'}]) {
      const e = endpoint(), res = await e.invoke(request({authorization: 'Bearer ' + bearer}, extra));
      assert.equal(res.code, 400); noWork(e.calls);
    }
  });
  it('preserves enabled mocked Bearer/HMAC behavior without credentials or network', async () => {
    for (const h of [headers(), {authorization: 'Bearer ' + bearer}]) {
      const environment = {...env, NCA_PERSONAL_PUSH_WORKER_ENABLED: 'true'}, e = endpoint(environment);
      assert.equal((await e.invoke(request(h, {body: {}}))).code, 200);
      assert.ok(Object.values(e.calls).every(n => n === 1));
      const failed = endpoint(environment, true), res = await failed.invoke(request(h));
      assert.equal(res.code, 503); assert.deepEqual(res.body, {ok: false}); assert.equal(failed.calls.close, 1);
    }
  });
  it('has generic responses and no runtime logging or other HMAC credentials', async () => {
    const e = endpoint(), res = await e.invoke(request(headers())), output = JSON.stringify(res.body);
    for (const value of [secret, bearer, 'PRIVATE_FIXTURE_DETAIL']) assert.ok(!output.includes(value));
    for (const file of ['server/personal-push-worker-auth.cjs', 'api/personal-push-worker.js']) {
      const source = fs.readFileSync(file, 'utf8');
      assert.ok(!/console\.|process\.stdout|process\.stderr/.test(source));
      assert.ok(!source.includes(secret) && !source.includes(bearer));
      assert.ok(!/NCA_CONTENT_PUSH_WORKER_HMAC_SECRET|NCA_CONTENT_PUSH_FANOUT_HMAC_SECRET/.test(source));
    }
  });
});
