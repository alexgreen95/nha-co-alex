'use strict';

const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const net = require('node:net'), tls = require('node:tls');
const {createRequire} = require('node:module');
const {databaseConfig, createDatabase} = require('../server/content-push-fanout-db.cjs');
const {runWorker} = require('../server/content-push-fanout-worker.cjs');
const {createHandler} = require('../api/content-push-fanout.js');
const ca = require('./helpers/personal-push-test-ca.cjs');

const originalSocket = net.Socket.prototype.connect, originalTLS = tls.connect;
let networkAttempts = 0;
before(() => {
  const forbidden = () => { networkAttempts++; throw Error('NETWORK_FORBIDDEN'); };
  net.Socket.prototype.connect = forbidden;
  tls.connect = forbidden;
});
after(() => {
  net.Socket.prototype.connect = originalSocket;
  tls.connect = originalTLS;
  assert.equal(networkAttempts, 0);
});

const url = 'postgresql://nca_push_fanout_runner.cwwulyrutdvuekydydew:fixture-only@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
const env = {NCA_CONTENT_PUSH_FANOUT_ENABLED: 'true', CRON_SECRET: 'f'.repeat(48),
  NCA_PUSH_FANOUT_DATABASE_URL: url, NCA_PUSH_FANOUT_CA_CERT_B64: ca.base64};
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const event = n => ({event_id: String(n), lease_token: uuid(n), lease_until: '2099-01-01T00:02:00+00:00'});
const claim = events => ({status: 'ok', events});
const page = overrides => ({status: 'ok', scanned: 1, inserted: 1, has_more: false, after: uuid(10), complete: true, ...overrides});
function mockDB(overrides = {}) {
  const calls = [];
  return {calls,
    claim: async limit => { calls.push(['claim', limit]); return claim([event(1)]); },
    fanoutPage: async (...args) => { calls.push(['page', ...args]); return page(); },
    close: async () => { calls.push(['close']); }, ...overrides};
}
function response() {
  return {headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }};
}
function request(overrides = {}) {
  return {method: 'GET', url: '/api/content-push-fanout', query: {},
    headers: {authorization: 'Bearer ' + env.CRON_SECRET}, ...overrides};
}
async function invoke({environment = env, req = request(), db = mockDB(), worker, factory} = {}) {
  let created = 0;
  const res = response();
  await createHandler({env: environment, database: config => {
    created++; return factory ? factory(config) : db;
  }, ...(worker ? {worker} : {})})(req, res);
  return {res, db, created};
}
function poolFixture({identity = {current_user: 'nca_push_fanout_runner', session_user: 'nca_push_fanout_runner'},
  settings = {statement_timeout: '5s', search_path: 'pg_catalog', read_only: 'off', application_name: 'nca_content_push_fanout'},
  failAt, setGate, malformed = false} = {}) {
  const calls = [], releases = [];
  let ended = 0;
  const client = {
    async query(sql, args) {
      calls.push([sql, args]);
      if (failAt === calls.length) throw Error('RAW_DB_FIXTURE_DETAIL');
      if (sql.startsWith('SELECT current_user')) return {rows: identity ? [identity] : []};
      if (sql.startsWith('SET ')) { if (setGate) await setGate; return {}; }
      if (sql.startsWith('SELECT pg_catalog.current_setting')) return {rows: settings ? [settings] : []};
      return {rows: malformed ? [] : [{result: {status: 'ok'}}]};
    },
    release(destroy) { releases.push(destroy); }
  };
  class Pool {
    constructor(config) { this.config = config; }
    on(name, fn) { assert.equal(name, 'error'); fn(Error('IGNORED_POOL_DETAIL')); }
    async connect() { if (failAt === 0) throw Error('RAW_CONNECT_FIXTURE_DETAIL'); return client; }
    async end() { ended++; }
  }
  return {Pool, calls, releases, ended: () => ended};
}

describe('fanout endpoint gates and response boundary', () => {
  for (const flag of [undefined, 'false', 'TRUE', true]) {
    it('fails closed before DB for non-enabled flag ' + String(flag), async () => {
      const x = await invoke({environment: {...env, NCA_CONTENT_PUSH_FANOUT_ENABLED: flag}});
      assert.equal(x.res.code, 503); assert.equal(x.created, 0);
      assert.equal(x.res.headers['Cache-Control'], 'no-store');
    });
  }
  for (const [label, secret] of [['missing', undefined], ['short', 'short'], ['whitespace', ' '.repeat(48)],
    ['too long', 'x'.repeat(257)], ['non ASCII', 'é'.repeat(48)], ['trailing newline', 'f'.repeat(48) + '\n']]) {
    it('rejects ' + label + ' cron config before DB', async () => {
      const x = await invoke({environment: {...env, CRON_SECRET: secret}});
      assert.equal(x.res.code, 503); assert.equal(x.created, 0);
    });
  }
  for (const [label, auth] of [['missing', undefined], ['wrong', 'Bearer ' + 'x'.repeat(48)],
    ['lowercase scheme', 'bearer ' + env.CRON_SECRET], ['suffix', 'Bearer ' + env.CRON_SECRET + ' '],
    ['array', ['Bearer ' + env.CRON_SECRET]]]) {
    it('rejects ' + label + ' auth before DB', async () => {
      const x = await invoke({req: request({headers: {authorization: auth}})});
      assert.equal(x.res.code, 401); assert.equal(x.created, 0);
    });
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    it('rejects ' + method, async () => {
      const x = await invoke({req: request({method})});
      assert.equal(x.res.code, 405); assert.equal(x.res.headers.Allow, 'GET'); assert.equal(x.created, 0);
    });
  }
  for (const [label, input] of [
    ['event query', {query: {event_id: '1'}}], ['token query', {query: {lease_token: uuid(1)}}],
    ['limit query', {query: {limit: 100}}], ['raw URL', {url: '/api/content-push-fanout?limit=100'}],
    ['empty search', {url: '/api/content-push-fanout?'}], ['query array', {query: []}],
    ['body fields', {body: {page_size: 100, recipient_id: uuid(1)}}], ['body string', {body: 'limit=100'}],
    ['body array', {body: []}]
  ]) {
    it('rejects caller-controlled ' + label + ' before DB', async () => {
      const x = await invoke({req: request(input)});
      assert.equal(x.res.code, 400); assert.equal(x.created, 0);
    });
  }
  it('uses timingSafeEqual for same-size valid and wrong bearer values', async () => {
    const crypto = require('node:crypto');
    let comparisons = 0;
    const filename = require.resolve('../api/content-push-fanout.js');
    const module = {exports: {}};
    const localRequire = createRequire(filename);
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {module, Buffer, process: {env: {}},
      require: name => name === 'node:crypto' ? {timingSafeEqual: (a, b) => {
        comparisons++; return crypto.timingSafeEqual(a, b);
      }} : localRequire(name)});
    const handler = module.exports.createHandler({env, database: () => mockDB()});
    const good = response(), bad = response();
    await handler(request(), good);
    await handler(request({headers: {authorization: 'Bearer ' + 'z'.repeat(48)}}), bad);
    assert.equal(good.code, 200); assert.equal(bad.code, 401); assert.equal(comparisons, 2);
  });
  it('passes only db to worker and closes after successful bounded work', async () => {
    const db = mockDB();
    const x = await invoke({db, worker: async args => {
      assert.deepEqual(Object.keys(args), ['db']); assert.equal(args.db, db);
      return runWorker(args);
    }});
    assert.equal(x.created, 1); assert.equal(x.res.code, 200); assert.equal(x.res.body.ok, true);
    assert.deepEqual(db.calls, [['claim', 2], ['page', '1', uuid(1), 50], ['close']]);
    assert.deepEqual(Object.keys(x.res.body.result).sort(),
      ['claimed', 'pages', 'scanned', 'inserted', 'completed', 'expired', 'gone', 'suppressed', 'deferred', 'errors'].sort());
  });
  it('closes after worker throw without disclosing raw detail', async () => {
    const x = await invoke({worker: async () => { throw Error('PRIVATE_FIXTURE_DETAIL'); }});
    assert.equal(x.res.code, 503); assert.deepEqual(x.res.body, {ok: false});
    assert.deepEqual(x.db.calls, [['close']]);
  });
  it('closes after uncertain RPC result and exposes aggregate counts only', async () => {
    const db = mockDB({fanoutPage: async () => { throw Error('PRIVATE_FIXTURE_DETAIL'); }});
    const x = await invoke({db});
    assert.equal(x.res.code, 503); assert.equal(x.res.body.result.errors, 1);
    assert.equal(x.res.body.result.deferred, 1);
    assert.ok(!JSON.stringify(x.res.body).includes('PRIVATE_FIXTURE_DETAIL'));
    assert.deepEqual(db.calls.at(-1), ['close']);
  });
  it('hides config/factory errors and handles close failure without leaking', async () => {
    const x = await invoke({environment: {...env, NCA_PUSH_FANOUT_DATABASE_URL: 'invalid fixture URL'}});
    assert.equal(x.created, 0); assert.deepEqual(x.res.body, {ok: false});
    const y = await invoke({factory: () => { throw Error('PRIVATE_FIXTURE_DETAIL'); }});
    assert.equal(y.res.code, 503); assert.deepEqual(y.res.body, {ok: false});
    const z = await invoke({db: mockDB({close: async () => { throw Error('PRIVATE_FIXTURE_DETAIL'); }})});
    assert.equal(z.res.code, 200); assert.ok(!JSON.stringify(z.res.body).includes('PRIVATE_FIXTURE_DETAIL'));
  });
});

describe('fanout pinned DB configuration', () => {
  it('requires dedicated runner URL and explicit validated CA with verified TLS', () => {
    const c = databaseConfig(env);
    assert.equal(c.user, 'nca_push_fanout_runner.cwwulyrutdvuekydydew');
    assert.equal(c.host, 'aws-0-ap-northeast-2.pooler.supabase.com');
    assert.equal(c.port, 5432); assert.equal(c.database, 'postgres');
    assert.equal(c.ssl.rejectUnauthorized, true); assert.ok(c.ssl.ca === ca.pem, 'fixture CA must match');
    assert.equal(c.max, 1); assert.equal(c.connectionTimeoutMillis, 2000); assert.equal(c.query_timeout, 7000);
    assert.equal(c.idleTimeoutMillis, 1000);
    assert.deepEqual(c.Client.prototype.getStartupConf.call({user: c.user, database: c.database, options: 'ignored'}),
      {user: c.user, database: c.database});
  });
  for (const [label, uri] of [
    ['missing', undefined], ['malformed', 'not a URL'], ['wrong scheme', url.replace('postgresql:', 'postgres:')],
    ['sender user', url.replace('nca_push_fanout_runner.', 'nca_push_sender.')],
    ['bare runner', url.replace('nca_push_fanout_runner.cwwulyrutdvuekydydew', 'nca_push_fanout_runner')],
    ['wrong project', url.replace('cwwulyrutdvuekydydew', 'other')],
    ['direct host', url.replace('aws-0-ap-northeast-2.pooler.supabase.com', 'db.cwwulyrutdvuekydydew.supabase.co')],
    ['transaction port', url.replace(':5432/', ':6543/')], ['no port', url.replace(':5432/', '/')],
    ['wrong database', url.replace('/postgres', '/other')], ['empty password', url.replace('fixture-only', '')],
    ['password control', url.replace('fixture-only', 'a%00b')], ['bad percent', url.replace('fixture-only', '%XX')],
    ['query options', url + '?sslmode=disable'], ['fragment', url + '#ignored'], ['leading space', ' ' + url]
  ]) {
    it('rejects ' + label + ' URL with content-free error', () => {
      assert.throws(() => databaseConfig({...env, NCA_PUSH_FANOUT_DATABASE_URL: uri}),
        {message: 'INVALID_FANOUT_DATABASE_CONFIG'});
    });
  }
  for (const [label, value] of [
    ['missing', undefined], ['empty', ''], ['base64 whitespace', ' ' + ca.base64], ['malformed', '!not-base64!'],
    ['noncanonical', 'Zh=='], ['oversized', 'A'.repeat(16388)], ['not certificate', Buffer.from('plain fixture text').toString('base64')],
    ['multiple certificates', Buffer.from(ca.pem + ca.pem).toString('base64')],
    ['prefix junk', Buffer.from('prefix' + ca.pem).toString('base64')],
    ['suffix junk', Buffer.from(ca.pem + 'suffix').toString('base64')],
    ['control character', Buffer.from(ca.pem + '\0').toString('base64')],
    ['invalid certificate', Buffer.from('-----BEGIN CERTIFICATE-----\nYWJj\n-----END CERTIFICATE-----\n').toString('base64')]
  ]) {
    it('rejects ' + label + ' CA without echoing contents', () => {
      assert.throws(() => databaseConfig({...env, NCA_PUSH_FANOUT_CA_CERT_B64: value}), {message: 'INVALID_FANOUT_CA_CERT'});
    });
  }
  it('never falls back to sender URL or sender CA', () => {
    assert.throws(() => databaseConfig({NCA_PUSH_SENDER_DATABASE_URL: url, NCA_PUSH_SENDER_CA_CERT_B64: ca.base64}),
      {message: 'INVALID_FANOUT_DATABASE_CONFIG'});
    assert.throws(() => databaseConfig({NCA_PUSH_FANOUT_DATABASE_URL: url, NCA_PUSH_SENDER_CA_CERT_B64: ca.base64}),
      {message: 'INVALID_FANOUT_CA_CERT'});
  });
});

describe('fanout runner identity, initialization and wrapper-only calls', () => {
  it('exposes only fixed wrappers and preserves bigint/token values as parameters', async () => {
    const f = poolFixture(), db = createDatabase(databaseConfig(env), f.Pool);
    assert.deepEqual(Object.keys(db).sort(), ['claim', 'close', 'fanoutPage']);
    await db.claim(2); await db.fanoutPage('9223372036854775807', uuid(1), 50); await db.close();
    assert.equal(f.calls.length, 5); assert.deepEqual(f.releases, [false, false]); assert.equal(f.ended(), 1);
    assert.deepEqual(f.calls[3], ['SELECT public.nca_runner_claim_content_push_events($1::integer) AS result', [2]]);
    assert.deepEqual(f.calls[4], ['SELECT public.nca_runner_fanout_content_push_event_page($1::bigint,$2::uuid,$3::integer) AS result',
      ['9223372036854775807', uuid(1), 50]]);
    assert.ok(!f.calls.some(([sql]) => /public\.nca_(?:claim_content|fanout_content)/.test(sql)));
  });
  for (const [label, identity] of [
    ['wrong current_user', {current_user: 'postgres', session_user: 'nca_push_fanout_runner'}],
    ['wrong session_user', {current_user: 'nca_push_fanout_runner', session_user: 'postgres'}],
    ['both sender', {current_user: 'nca_push_sender', session_user: 'nca_push_sender'}], ['no row', null]
  ]) {
    it('destroys ' + label + ' before settings/RPC', async () => {
      const f = poolFixture({identity}), db = createDatabase(databaseConfig(env), f.Pool);
      await assert.rejects(db.claim(2), {message: 'FANOUT_DATABASE_FAILURE'});
      assert.equal(f.calls.length, 1); assert.deepEqual(f.releases, [true]); await db.close();
    });
  }
  for (const key of ['statement_timeout', 'search_path', 'read_only', 'application_name']) {
    it('destroys connection with wrong ' + key + ' before RPC', async () => {
      const settings = {statement_timeout: '5s', search_path: 'pg_catalog', read_only: 'off', application_name: 'nca_content_push_fanout', [key]: 'wrong'};
      const f = poolFixture({settings}), db = createDatabase(databaseConfig(env), f.Pool);
      await assert.rejects(db.claim(2), {message: 'FANOUT_DATABASE_FAILURE'});
      assert.equal(f.calls.length, 3); assert.deepEqual(f.releases, [true]); await db.close();
    });
  }
  for (const failAt of [0, 1, 2, 3, 4]) {
    it('never retries connection/query failure at stage ' + failAt, async () => {
      const f = poolFixture({failAt}), db = createDatabase(databaseConfig(env), f.Pool);
      await assert.rejects(db.claim(2), {message: 'FANOUT_DATABASE_FAILURE'});
      assert.equal(f.calls.length, failAt); assert.deepEqual(f.releases, failAt ? [true] : []); await db.close();
    });
  }
  it('awaits session setup before verifying settings and calling a wrapper', async () => {
    let releaseSetup;
    const setGate = new Promise(resolve => { releaseSetup = resolve; });
    const f = poolFixture({setGate}), db = createDatabase(databaseConfig(env), f.Pool);
    const pending = db.claim(2);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.length, 2); assert.deepEqual(f.releases, []);
    assert.match(f.calls[1][0], /SET statement_timeout = '5s'; SET search_path = pg_catalog; SET default_transaction_read_only = off; SET application_name = 'nca_content_push_fanout'/);
    releaseSetup(); await pending;
    assert.equal(f.calls.length, 4); await db.close();
  });
  it('checks identity/settings again for each newly checked out client', async () => {
    const first = poolFixture(), second = poolFixture();
    const pools = [new first.Pool(), new second.Pool()]; let n = 0;
    class Pool { on() {} async connect() { return pools[n++].connect(); } async end() {} }
    const db = createDatabase(databaseConfig(env), Pool);
    await db.claim(2); await db.claim(2); await db.close();
    assert.equal(first.calls.length, 4); assert.equal(second.calls.length, 4);
  });
  it('destroys a malformed RPC response', async () => {
    const f = poolFixture({malformed: true}), db = createDatabase(databaseConfig(env), f.Pool);
    await assert.rejects(db.claim(2), {message: 'FANOUT_DATABASE_FAILURE'});
    assert.deepEqual(f.releases, [true]); await db.close();
  });
});

describe('bounded fanout worker and actual installed JSON contract', () => {
  it('no work performs only one bounded claim', async () => {
    const db = mockDB({claim: async n => { db.calls.push(['claim', n]); return claim([]); }});
    const result = await runWorker({db});
    assert.equal(result.errors, 0); assert.equal(result.claimed, 0); assert.equal(result.pages, 0);
    assert.deepEqual(db.calls, [['claim', 2]]);
  });
  it('uses fixed 2-event/2-page/50-row bounds despite injected work options', async () => {
    let pages = 0;
    const db = mockDB({claim: async n => { db.calls.push(['claim', n]); return claim([event(1), event(2)]); },
      fanoutPage: async (...args) => { db.calls.push(['page', ...args]); pages++;
        return page({scanned: 50, inserted: 50, has_more: true, complete: false, after: uuid(pages * 50)}); }});
    const result = await runWorker({db, maxItems: 99999, pageSize: 100000, maxPages: Infinity});
    assert.deepEqual(db.calls.map(c => c[0]), ['claim', 'page', 'page', 'page', 'page']);
    assert.ok(db.calls.slice(1).every(c => c[3] === 50));
    assert.equal(result.claimed, 2); assert.equal(result.pages, 4); assert.equal(result.scanned, 200);
    assert.equal(result.inserted, 200); assert.equal(result.deferred, 2); assert.equal(result.errors, 0);
  });
  it('stops a completed page and preserves exact bigint IDs', async () => {
    const e = {...event(1), event_id: '9223372036854775807'};
    const db = mockDB({claim: async () => claim([e])});
    const result = await runWorker({db});
    assert.equal(result.completed, 1); assert.equal(result.pages, 1); assert.equal(result.deferred, 0);
    assert.deepEqual(db.calls, [['page', e.event_id, e.lease_token, 50]]);
  });
  for (const [status, expected] of [['expired', 'expired'], ['source_mismatch', 'suppressed'], ['gone', 'gone']]) {
    it('stops exact terminal ' + status + ' page response', async () => {
      const db = mockDB({fanoutPage: async (...args) => {
        db.calls.push(['page', ...args]);
        return status === 'gone' ? {status, inserted: 0} : page({status, scanned: 0, inserted: 0, after: null});
      }});
      const result = await runWorker({db});
      assert.equal(result[expected], 1); assert.equal(result.errors, 0); assert.equal(result.pages, 1); assert.equal(result.deferred, 0);
    });
  }
  it('accepts completed empty audience with null cursor', async () => {
    const db = mockDB({fanoutPage: async () => page({scanned: 0, inserted: 0, after: null})});
    const result = await runWorker({db}); assert.equal(result.completed, 1); assert.equal(result.errors, 0);
  });
  for (const code of ['PT409', '55P03', '57014', 'CONNECTION_LOST']) {
    it('stops immediately without replay after ' + code, async () => {
      let attempted = 0;
      const db = mockDB({claim: async () => claim([event(1), event(2)]), fanoutPage: async () => {
        attempted++; throw Object.assign(Error('PRIVATE_FIXTURE_DETAIL'), {code});
      }});
      const result = await runWorker({db});
      assert.equal(attempted, 1); assert.equal(result.errors, 1); assert.equal(result.deferred, 2);
      assert.ok(Object.values(result).every(Number.isInteger));
    });
  }
  it('does not retry unknown claim outcome', async () => {
    let attempted = 0;
    const db = mockDB({claim: async () => { attempted++; throw Error('PRIVATE_FIXTURE_DETAIL'); }});
    const result = await runWorker({db}); assert.equal(attempted, 1); assert.equal(result.errors, 1); assert.equal(result.pages, 0);
  });
  for (const [label, value] of [
    ['wrong status', {status: 'ready', events: []}], ['missing events', {status: 'ok'}],
    ['too many events', claim([event(1), event(2), event(3)])], ['duplicate event', claim([event(1), event(1)])],
    ['numeric id', claim([{...event(1), event_id: 1}])], ['out of range id', claim([{...event(1), event_id: '9223372036854775808'}])],
    ['bad token', claim([{...event(1), lease_token: 'not-uuid'}])], ['bad expiry', claim([{...event(1), lease_until: 'not-time'}])],
    ['id with newline', claim([{...event(1), event_id: '1\n'}])],
    ['token with newline', claim([{...event(1), lease_token: uuid(1) + '\n'}])]
  ]) {
    it('rejects malformed claim: ' + label, async () => {
      const db = mockDB({claim: async () => value});
      const result = await runWorker({db}); assert.equal(result.errors, 1); assert.equal(result.pages, 0);
    });
  }
  for (const [label, value] of [
    ['invented status', page({status: 'completed'})], ['oversized scan', page({scanned: 51})],
    ['negative count', page({inserted: -1})], ['too many inserts', page({inserted: 2})],
    ['inconsistent complete', page({complete: false})], ['no cursor with scanned rows', page({after: null})],
    ['invalid cursor', page({after: 'private-bad-cursor'})], ['short continuing page', page({has_more: true, complete: false})],
    ['expired with writes', page({status: 'expired'})], ['gone with writes', {status: 'gone', inserted: 1}]
  ]) {
    it('rejects malformed page: ' + label, async () => {
      const db = mockDB({fanoutPage: async () => value});
      const result = await runWorker({db}); assert.equal(result.errors, 1); assert.equal(result.pages, 1); assert.equal(result.deferred, 1);
    });
  }
  it('rejects a nonadvancing cursor without retrying', async () => {
    const db = mockDB({fanoutPage: async () => page({scanned: 50, has_more: true, complete: false})});
    const result = await runWorker({db}); assert.equal(result.errors, 1); assert.equal(result.pages, 2);
  });
  it('stops before another call when conservative time reserve no longer fits', async () => {
    let clock = 0;
    const db = mockDB({fanoutPage: async () => {
      clock = 16000; return page({scanned: 50, has_more: true, complete: false});
    }});
    const result = await runWorker({db, now: () => clock});
    assert.equal(result.pages, 1); assert.equal(result.deferred, 1); assert.equal(result.errors, 0);
  });
  it('does not start work with exhausted/invalid monotonic budget', async () => {
    for (const elapsed of [16000, NaN, -1]) {
      let calls = 0;
      const db = mockDB(); const result = await runWorker({db, now: () => calls++ ? elapsed : 0});
      assert.equal(result.pages, 0); assert.deepEqual(db.calls, []);
    }
  });
  it('derives response names and terminal states from the frozen SQL and bridge', () => {
    const base = fs.readFileSync('database/migrations/20261022_content_push_delivery.sql', 'utf8');
    const bridge = fs.readFileSync('database/migrations/20261023_content_push_fanout_runtime_bridge.sql', 'utf8');
    assert.match(base, /'event_id',id::pg_catalog.text/);
    assert.match(base, /'status','ok','events',result/);
    assert.match(base, /'status',reason,'scanned',scanned,'inserted',inserted,'has_more',more,'after',cursor_id,'complete',NOT more/);
    assert.match(base, /'status','gone','inserted',0/);
    assert.match(base, /reason:='source_mismatch'/); assert.match(base, /reason:='expired'/);
    assert.match(base, /ERRCODE='PT409',MESSAGE='NCA_CONTENT_FANOUT_LEASE_CONFLICT'/);
    assert.match(bridge, /SELECT public.nca_claim_content_push_events\(\$1\)/);
    assert.match(bridge, /SELECT public.nca_fanout_content_push_event_page\(\$1,\$2,\$3\)/);
  });
  it('runtime imports no sender worker or transport and config adds no cron', () => {
    for (const name of ['server/content-push-fanout-worker.cjs', 'api/content-push-fanout.js']) {
      const source = fs.readFileSync(name, 'utf8');
      assert.ok(!/require\([^)]*(?:transport|web-push|personal-push-worker|content-push-worker)/.test(source));
      assert.ok(!/console\.|while\s*\(\s*true/.test(source));
    }
    const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    assert.equal(config.functions['api/content-push-fanout.js'].maxDuration, 60);
    assert.equal(config.crons, undefined);
  });
});
