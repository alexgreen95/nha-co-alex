'use strict';

const https = require('node:https');
const {randomUUID, randomBytes, createHash} = require('node:crypto');
const v = require('./push-validation.cjs');
const {databaseConfig, createDatabase, DBFailure} = require('./push-db.cjs');

// Verify remotely against the fixed project's Auth service. No JWT decoding,
// redirects, retries, refresh tokens, house gate or worker credentials.
function verifyUser(token, key, {request = https.request, deadline, now = Date.now} = {}) {
  if (typeof key !== 'string' || key.length > 512 || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) v.fail(503, 'UNAVAILABLE');
  const remaining = Math.min(2000, deadline-now());
  if (!Number.isFinite(remaining) || remaining <= 0) v.fail(503, 'UNAVAILABLE');
  return new Promise((resolve, reject) => {
    let req, settled = false, response;
    const finish = (error, id) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      req?.destroy(); response?.destroy();
      if (error) reject(error); else resolve(id);
    };
    const unavailable = () => finish(new v.Fault(503, 'UNAVAILABLE'));
    const timer = setTimeout(unavailable, remaining);
    try {
      req = request('https://cwwulyrutdvuekydydew.supabase.co/auth/v1/user', {
        method:'GET', agent:false, rejectUnauthorized:true,
        headers:{Authorization:'Bearer '+token, apikey:key}
      }, res => {
        response = res;
        res.on('error', unavailable); res.on('aborted', unavailable);
        if ([400,401,403].includes(res.statusCode)) return finish(new v.Fault(401, 'UNAUTHORIZED'));
        if (res.statusCode !== 200) return unavailable();
        let size = 0, chunks = [];
        res.on('data', chunk => {
          if (settled) return;
          if (!Buffer.isBuffer(chunk)) return unavailable();
          size += chunk.length;
          if (size > 32768) { chunks = []; return unavailable(); }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (settled) return;
          try {
            const text = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(Buffer.concat(chunks));
            if (text.startsWith('\uFEFF')) return unavailable();
            const user = JSON.parse(text);
            if (!user || Array.isArray(user) || typeof user.id !== 'string' || !v.UUID.test(user.id)) return unavailable();
            finish(null, user.id);
          } catch { unavailable(); }
          finally { chunks = []; }
        });
      });
      req.on('error', unavailable); req.end();
    } catch { unavailable(); }
  });
}

function dbError(error, mutationAttempted) {
  if (error instanceof v.Fault) return error;
  if (!(error instanceof DBFailure)) return new v.Fault(503, mutationAttempted ? 'OUTCOME_UNKNOWN' : 'UNAVAILABLE');
  if (error.definite) {
    if (error.sqlstate === 'PT403') return new v.Fault(403, 'INVALID_CAPABILITY');
    if (error.sqlstate === 'PT409') return new v.Fault(409, 'STATE_CONFLICT');
    if (error.sqlstate === '22023') return new v.Fault(400, 'INVALID_REQUEST');
    if (error.sqlstate === '23503') return new v.Fault(409, 'ACCOUNT_UNAVAILABLE');
    if (error.sqlstate === '23505') return new v.Fault(409, 'ENDPOINT_CONFLICT');
  }
  return new v.Fault(503, error.dispatched && !error.definite ? 'OUTCOME_UNKNOWN' : 'UNAVAILABLE');
}
function envelope(operation, row, user) {
  const ownership = row.user_id === null ? 'none' : !user ? 'unverified' : user === row.user_id ? 'self' : 'other';
  return {ok:true, operation, subscription:{installation_id:row.installation_id, state:row.state,
    binding_id:row.binding_id, binding_version:row.binding_version, ownership}};
}
function createHandler({env = process.env, database = createDatabase, verifyAuth = verifyUser,
  uuid = randomUUID, random = randomBytes, now = Date.now} = {}) {
  return async function handler(req, res) {
    const deadline = now()+25000;
    let db, attempted = false, resultConfirmed = false;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const mint = (id = uuid()) => {
      const raw = random(32);
      if (typeof id !== 'string' || !v.INSTALLATION.test(id) || !Buffer.isBuffer(raw) || raw.length !== 32) v.fail(503, 'UNAVAILABLE');
      return {id, raw, digest:createHash('sha256').update(raw).digest()};
    };
    try {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); v.fail(405, 'METHOD_NOT_ALLOWED'); }
      v.origin(req);
      const body = await v.readBody(req, deadline, now), op = body.operation;
      const token = v.authorization(req, op);
      let user = null;
      if (token !== null) {
        try { user = await verifyAuth(token, env.NCA_PUSH_API_AUTH_PUBLISHABLE_KEY, {deadline, now}); }
        catch (error) { if (error instanceof v.Fault) throw error; v.fail(503, 'UNAVAILABLE'); }
        if (typeof user !== 'string' || !v.UUID.test(user)) v.fail(503, 'UNAVAILABLE');
      }
      const cap = v.cookie(req);
      if (op !== 'create' && (!cap || cap.id !== body.installation_id)) v.fail(403, 'INVALID_CAPABILITY');
      if (now() >= deadline) v.fail(503, 'UNAVAILABLE');
      db = database(databaseConfig(env), {deadline, now});
      const get = async id => {
        const row = v.validateResult(await db.get(id, cap.digest, 'status'));
        if (row.installation_id !== id) v.fail(503, 'UNAVAILABLE');
        return row;
      };
      let observed, row, issued;
      if (op === 'create') {
        if (cap) {
          try { observed = await get(cap.id); }
          catch (error) { if (!(error instanceof DBFailure && error.definite && error.sqlstate === 'PT403')) throw error; }
        }
        if (observed) row = observed;
        else {
          issued = mint(); attempted = true;
          try { row = v.validateResult(await db.create(issued.id, issued.digest)); }
          catch (error) {
            if (error instanceof DBFailure && error.definite && error.sqlstate === '23505') v.fail(409, 'STATE_CONFLICT');
            if (error instanceof v.Fault) v.fail(503, 'OUTCOME_UNKNOWN');
            throw error;
          }
          if (row.installation_id !== issued.id || row.state !== 'unbound' || row.user_id !== null || row.binding_version !== '0') v.fail(503, 'OUTCOME_UNKNOWN');
        }
      } else {
        observed = await get(cap.id);
        row = observed;
        if (op !== 'status') {
          if (observed.binding_id !== body.binding_id || observed.binding_version !== body.binding_version) v.fail(409, 'STATE_CONFLICT');
          if (op !== 'release' && observed.user_id !== null && observed.user_id !== user) v.fail(409, 'ACCOUNT_BINDING_CONFLICT');
          if (op === 'activate' && (observed.state !== 'reserved' || observed.user_id !== user)) v.fail(409, 'STATE_CONFLICT');
          if (op === 'recover' && (!['reserved','active'].includes(observed.state) || observed.user_id !== user)) v.fail(409, 'STATE_CONFLICT');
          if (op === 'recover') {
            issued = mint(cap.id);
            if (issued.digest.equals(cap.digest)) v.fail(503, 'UNAVAILABLE');
          }
          const id = cap.id, pair = [body.binding_id, body.binding_version];
          const material = body.subscription;
          const args = op === 'reserve' ? [id,cap.digest,user,body.binding_version] :
            op === 'activate' ? [id,cap.digest,...pair,material.endpoint,material.keys.p256dh,material.keys.auth] :
            op === 'release' ? [id,cap.digest,...pair,body.disable] :
            [id,...pair,user,issued.digest,material.endpoint,material.keys.p256dh,material.keys.auth];
          attempted = true;
          let next;
          try { next = v.validateResult(await db[op](...args)); }
          catch (error) { if (error instanceof v.Fault) v.fail(503, 'OUTCOME_UNKNOWN'); throw error; }
          const expectedState = op === 'reserve' ? 'reserved' : op === 'release' ? (body.disable ? 'disabled' : 'unbound') : 'active';
          const expectedUser = op === 'release' ? null : user;
          if (next.installation_id !== id || next.state !== expectedState || next.user_id !== expectedUser ||
            next.binding_id === observed.binding_id || BigInt(next.binding_version) !== BigInt(observed.binding_version)+1n) v.fail(503, 'OUTCOME_UNKNOWN');
          row = next;
        }
      }
      resultConfirmed = true;
      const response = envelope(op, row, user);
      if (issued) res.setHeader('Set-Cookie', v.setCookie(row.installation_id, issued.raw));
      return res.status(op === 'create' && issued ? 201 : 200).json(response);
    } catch (error) {
      const safe = resultConfirmed && attempted ? new v.Fault(503, 'OUTCOME_UNKNOWN') : dbError(error, attempted);
      if (res.headersSent) return;
      res.removeHeader('Set-Cookie');
      if (safe.status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
      return res.status(safe.status).json({ok:false, error:{code:safe.code}});
    } finally { if (db) { try { await db.close(); } catch {} } }
  };
}
module.exports = {createHandler, verifyUser};
