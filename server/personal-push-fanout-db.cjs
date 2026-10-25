'use strict';

const {decodeSenderCA} = require('./personal-push-db.cjs');
class SessionPoolerClient extends require('pg/lib/client') { getStartupConf() { return {user: this.user, database: this.database}; } }
function databaseConfig(env) {
  let u, password, ca;
  try {
    const uri = env.NCA_PUSH_FANOUT_DATABASE_URL;
    if (typeof uri !== 'string' || /[\s\x00-\x1f\x7f?#]/.test(uri)) throw Error();
    u = new URL(uri); password = decodeURIComponent(u.password);
    if (u.protocol !== 'postgresql:' || u.username !== 'nca_push_fanout_runner.cwwulyrutdvuekydydew' || u.hostname !== 'aws-0-ap-northeast-2.pooler.supabase.com' || u.port !== '5432' || u.pathname !== '/postgres' || u.search || u.hash || !password || /[\x00-\x1f\x7f]/.test(password)) throw Error();
  } catch { throw Error('INVALID_FANOUT_DATABASE_CONFIG'); }
  try { ca = decodeSenderCA(env.NCA_PUSH_FANOUT_CA_CERT_B64); } catch { throw Error('INVALID_FANOUT_CA_CERT'); }
  return {host:u.hostname,port:5432,database:'postgres',user:u.username,password,Client:SessionPoolerClient,ssl:{rejectUnauthorized:true,ca},max:1,connectionTimeoutMillis:2000,idleTimeoutMillis:1000,query_timeout:7000,client_encoding:'UTF8'};
}
function createDatabase(config, Pool = require('pg').Pool) {
  const pool = new Pool(config); pool.on('error', () => {}); const initialized = new WeakSet();
  async function call(sql, params) {
    let client, failed = true;
    try {
      client = await pool.connect();
      if (!initialized.has(client)) {
        const identity = await client.query('SELECT current_user::text AS current_user, session_user::text AS session_user');
        if (identity.rows.length !== 1 || identity.rows[0].current_user !== 'nca_push_fanout_runner' || identity.rows[0].session_user !== 'nca_push_fanout_runner') throw Error();
        await client.query("SET statement_timeout = '5s'; SET search_path = pg_catalog; SET default_transaction_read_only = off; SET application_name = 'nca_personal_push_fanout'");
        initialized.add(client);
      }
      const result = await client.query(sql, params);
      if (result.rows.length !== 1 || !result.rows[0].result || typeof result.rows[0].result !== 'object') throw Error();
      failed = false; return result.rows[0].result;
    } catch { throw Error('FANOUT_DATABASE_FAILURE'); } finally { if (client) client.release(failed); }
  }
  return {claim: limit => call('SELECT public.nca_runner_claim_personal_push_events($1::integer) AS result',[limit]),fanoutPage:(id,token,limit)=>call('SELECT public.nca_runner_fanout_personal_push_event_page($1::bigint,$2::uuid,$3::integer) AS result',[id,token,limit]),close:()=>pool.end()};
}
module.exports = {databaseConfig, createDatabase};
