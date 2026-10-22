'use strict';
// Reuse the CLOSED sender TLS/CA, exact Session Pooler route and startup contract.
const {databaseConfig}=require('./personal-push-db.cjs');

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
        await client.query("SET statement_timeout = '5s'; SET search_path = pg_catalog; SET default_transaction_read_only = off; SET application_name = 'nca_content_push_sender'");
        const settings = await client.query("SELECT pg_catalog.current_setting('statement_timeout') AS statement_timeout, pg_catalog.current_setting('search_path') AS search_path, pg_catalog.current_setting('default_transaction_read_only') AS read_only, pg_catalog.current_setting('application_name') AS application_name");
        if (settings.rows.length !== 1 || settings.rows[0].statement_timeout !== '5s' ||
          settings.rows[0].search_path !== 'pg_catalog' || settings.rows[0].read_only !== 'off' ||
          settings.rows[0].application_name !== 'nca_content_push_sender') throw new Error('INVALID_SENDER_DATABASE_SESSION');
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
    claim: limit => rpc('nca_claim_content_push_deliveries', [limit]),
    prepare: (id, token) => rpc('nca_prepare_content_push_delivery', [id, token]),
    finish: (id, token, outcome) => rpc('nca_finish_content_push_delivery', [id, token, outcome]),
    close: () => pool.end()
  };
}

module.exports = {databaseConfig, createDatabase};
