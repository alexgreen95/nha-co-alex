'use strict';

// Pinned pg JS client: emit only protocol essentials, never inherited PGOPTIONS
// or pooler-dependent startup GUCs. Session settings are established below.
class SessionPoolerClient extends require('pg/lib/client') {
  getStartupConf() {
    return {user: this.user, database: this.database};
  }
}

function databaseConfig(env) {
  const uri = env.NCA_PUSH_SENDER_DATABASE_URL;
  if (typeof uri !== 'string' || /[\s\x00-\x1f\x7f?#]/.test(uri)) {
    throw new Error('INVALID_SENDER_DATABASE_CONFIG');
  }
  const u = new URL(uri);
  const password = decodeURIComponent(u.password);
  if (u.protocol !== 'postgresql:' || u.username !== 'nca_push_sender.cwwulyrutdvuekydydew' ||
    !password || /[\x00-\x1f\x7f]/.test(password) || u.hostname !== 'aws-0-ap-northeast-2.pooler.supabase.com' ||
    u.port !== '5432' || u.pathname !== '/postgres' || u.search || u.hash) {
    throw new Error('INVALID_SENDER_DATABASE_CONFIG');
  }
  // Explicit fields prevent libpq-style URL options or inherited PG credentials
  // from selecting another identity, disabling TLS, or adding startup commands.
  return {
    host: u.hostname, port: 5432, user: u.username,
    password, database: 'postgres', Client: SessionPoolerClient,
    ssl: {rejectUnauthorized: true}, max: 1, connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 1000, query_timeout: 7000, client_encoding: 'UTF8'
  };
}

function createDatabase(config, Pool = require('pg').Pool) {
  const pool = new Pool(config);
  pool.on('error', () => {}); // Never log endpoints, credentials or raw DB errors.
  const initialized = new WeakSet();
  async function rpc(name, params) {
    const client = await pool.connect(); // Exclusive checkout; no async connect-event race.
    let failed = true;
    try {
      if (!initialized.has(client)) {
        const identity = await client.query('SELECT current_user::text AS current_user, session_user::text AS session_user');
        if (identity.rows.length !== 1 || identity.rows[0].current_user !== 'nca_push_sender' ||
          identity.rows[0].session_user !== 'nca_push_sender') throw new Error('INVALID_SENDER_DATABASE_IDENTITY');
        await client.query("SET statement_timeout = '5s'; SET search_path = pg_catalog; SET default_transaction_read_only = off; SET application_name = 'nca_personal_push_sender'");
        const settings = await client.query("SELECT pg_catalog.current_setting('statement_timeout') AS statement_timeout, pg_catalog.current_setting('search_path') AS search_path, pg_catalog.current_setting('default_transaction_read_only') AS read_only, pg_catalog.current_setting('application_name') AS application_name");
        if (settings.rows.length !== 1 || settings.rows[0].statement_timeout !== '5s' ||
          settings.rows[0].search_path !== 'pg_catalog' || settings.rows[0].read_only !== 'off' ||
          settings.rows[0].application_name !== 'nca_personal_push_sender') throw new Error('INVALID_SENDER_DATABASE_SESSION');
        initialized.add(client); // Only after every awaited initialization check passes.
      }
      const placeholders = params.map((_, i) => '$' + (i + 1)).join(',');
      const result = await client.query(`SELECT public.${name}(${placeholders}) AS result`, params);
      failed = false;
      return result.rows[0].result;
    } finally {
      client.release(failed); // Destroy failed connections; never retry an RPC here.
    }
  }
  return {
    claim: limit => rpc('nca_claim_personal_push_deliveries', [limit]),
    prepare: (id, token) => rpc('nca_prepare_personal_push_delivery', [id, token]),
    finish: (id, token, outcome) => rpc('nca_finish_personal_push_delivery', [id, token, outcome]),
    close: () => pool.end()
  };
}

module.exports = {databaseConfig, createDatabase};
