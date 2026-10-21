'use strict';

const {decodeSenderCA} = require('./personal-push-db.cjs'); // Pure trust-anchor validator only.
const {DatabaseError} = require('pg');
class ApiClient extends require('pg/lib/client') {
  getStartupConf() { return {user:this.user, database:this.database}; }
}
class DBFailure extends Error {
  constructor(sqlstate, dispatched = false, definite = false) {
    super('LIFECYCLE_DB_FAILED');
    this.sqlstate = /^[A-Z0-9]{5}$/.test(sqlstate || '') ? sqlstate : undefined;
    this.dispatched = dispatched; this.definite = definite;
  }
}
function databaseConfig(env) {
  try {
    const uri = env.NCA_PUSH_API_DATABASE_URL;
    if (typeof uri !== 'string' || /[\s\x00-\x1f\x7f?#]/.test(uri)) throw Error();
    const u = new URL(uri), password = decodeURIComponent(u.password);
    if (u.protocol !== 'postgresql:' || u.username !== 'nca_push_api.cwwulyrutdvuekydydew' ||
      u.hostname !== 'aws-0-ap-northeast-2.pooler.supabase.com' || u.port !== '5432' ||
      u.pathname !== '/postgres' || u.search || u.hash || !password || /[\x00-\x1f\x7f]/.test(password)) throw Error();
    return {host:u.hostname, port:5432, user:u.username, password, database:'postgres', Client:ApiClient,
      ssl:{rejectUnauthorized:true, minVersion:'TLSv1.2', ca:decodeSenderCA(env.NCA_PUSH_API_CA_CERT_B64)},
      max:1, connectionTimeoutMillis:2000, idleTimeoutMillis:1000, query_timeout:7000, client_encoding:'UTF8'};
  } catch { throw new DBFailure(); }
}
const ROUTINES = Object.freeze({
  get:['nca_get_push_subscription',['uuid','bytea','text']],
  create:['nca_create_push_installation',['uuid','bytea']],
  reserve:['nca_reserve_push_subscription',['uuid','bytea','uuid','bigint']],
  activate:['nca_activate_push_subscription',['uuid','bytea','uuid','bigint','text','text','text']],
  release:['nca_release_push_subscription',['uuid','bytea','uuid','bigint','boolean']],
  recover:['nca_recover_push_subscription',['uuid','uuid','bigint','uuid','bytea','text','text','text']]
});
const SET = "SET statement_timeout = '5s'; SET lock_timeout = '2s'; SET search_path = pg_catalog; SET default_transaction_read_only = off; SET application_name = 'nca_push_subscription_api'";
const SETTINGS = "SELECT pg_catalog.current_setting('statement_timeout') AS statement_timeout, pg_catalog.current_setting('lock_timeout') AS lock_timeout, pg_catalog.current_setting('search_path') AS search_path, pg_catalog.current_setting('default_transaction_read_only') AS read_only, pg_catalog.current_setting('application_name') AS application_name";
function createDatabase(config, {deadline, now = Date.now, Pool = require('pg').Pool} = {}) {
  const pool = new Pool(config), initialized = new WeakSet();
  pool.on('error', () => {});
  const timeout = () => {
    const remaining = deadline-now();
    if (!Number.isFinite(remaining) || remaining <= 0) throw new DBFailure();
    return Math.min(7000, remaining);
  };
  async function call(operation, args) {
    let client, failed = true, dispatched = false;
    try {
      timeout();
      pool.options.connectionTimeoutMillis = Math.min(2000, timeout());
      client = await pool.connect();
      const query = (text, values) => client.query({text, values, query_timeout:timeout()});
      if (!initialized.has(client)) {
        const identity = await query('SELECT current_user::text AS current_user, session_user::text AS session_user');
        if (identity.rows.length !== 1 || identity.rows[0].current_user !== 'nca_push_api' || identity.rows[0].session_user !== 'nca_push_api') throw new DBFailure();
        await query(SET);
        const result = await query(SETTINGS), row = result.rows[0];
        if (result.rows.length !== 1 || row.statement_timeout !== '5s' || row.lock_timeout !== '2s' ||
          row.search_path !== 'pg_catalog' || row.read_only !== 'off' || row.application_name !== 'nca_push_subscription_api') throw new DBFailure();
        initialized.add(client);
      }
      const [name, types] = ROUTINES[operation];
      if (args.length !== types.length) throw new DBFailure();
      const limit = timeout();
      if (operation !== 'get' && limit < 7000) throw new DBFailure();
      dispatched = operation !== 'get';
      const placeholders = types.map((type,i) => '$'+(i+1)+'::'+type).join(',');
      const response = await client.query({text:`SELECT public.${name}(${placeholders}) AS result`, values:args, query_timeout:limit});
      if (response.rows.length !== 1) throw new DBFailure(undefined, dispatched);
      failed = false;
      return response.rows[0].result;
    } catch (error) {
      if (error instanceof DBFailure) throw error;
      const code = error instanceof DatabaseError ? error.code : undefined;
      const definite = !!code && !/^(08|57P)/.test(code);
      throw new DBFailure(code, dispatched, definite);
    } finally { if (client) client.release(failed); }
  }
  return Object.fromEntries([...Object.keys(ROUTINES).map(op => [op,(...args)=>call(op,args)]),['close',()=>pool.end()]]);
}
module.exports = {databaseConfig, createDatabase, DBFailure, ROUTINES};
