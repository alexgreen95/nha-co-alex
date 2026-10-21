'use strict';

const {createHash, ECDH} = require('node:crypto');
const ORIGIN = 'https://nha-co-alex.vercel.app';
const COOKIE = '__Host-nca_push_installation';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INSTALLATION = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MUTATIONS = new Set(['create','reserve','activate','release','recover']);
const REQUIRED_AUTH = new Set(['create','reserve','activate','recover']);

class Fault extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status = 400, code = 'INVALID_REQUEST') => { throw new Fault(status, code); };
function exact(object, keys) {
  if (!object || typeof object !== 'object' || Array.isArray(object) ||
    Object.getPrototypeOf(object) !== Object.prototype || Object.keys(object).length !== keys.length ||
    keys.some(k => !Object.hasOwn(object, k))) fail();
}
function version(value) {
  return typeof value === 'string' && value.length <= 19 && /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= 9223372036854775807n;
}
function bytes(value, length) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) fail();
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== length || decoded.toString('base64url') !== value) fail();
  return decoded;
}
function material(value) {
  exact(value, ['endpoint','keys']); exact(value.keys, ['p256dh','auth']);
  const endpoint = value.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length < 1 || endpoint.length > 2048 || /[^\x21-\x7e]/.test(endpoint)) fail();
  let u;
  try { u = new URL(endpoint); } catch { fail(); }
  const host = ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname) ||
    /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname);
  if (!host || u.href !== endpoint || u.protocol !== 'https:' || u.username || u.password || endpoint.includes('#') || u.port) fail();
  if (typeof value.keys.p256dh !== 'string' || value.keys.p256dh.length !== 87 ||
    typeof value.keys.auth !== 'string' || value.keys.auth.length !== 22) fail();
  const pub = bytes(value.keys.p256dh, 65); bytes(value.keys.auth, 16);
  if (pub[0] !== 4) fail();
  try { ECDH.convertKey(pub, 'prime256v1'); } catch { fail(); }
}
function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail();
  const op = body.operation;
  if (!['create','status','reserve','activate','release','recover'].includes(op)) fail();
  const fields = ['operation'];
  if (op !== 'create') fields.push('installation_id');
  if (!['create','status'].includes(op)) fields.push('binding_id','binding_version');
  if (['activate','recover'].includes(op)) fields.push('subscription');
  if (op === 'release') fields.push('disable');
  exact(body, fields);
  if (op !== 'create' && (typeof body.installation_id !== 'string' || !INSTALLATION.test(body.installation_id))) fail();
  if (!['create','status'].includes(op) && (typeof body.binding_id !== 'string' || !UUID.test(body.binding_id) || !version(body.binding_version))) fail();
  if (['activate','recover'].includes(op)) material(body.subscription);
  if (op === 'release' && typeof body.disable !== 'boolean') fail();
  return body;
}

// Raw headers are necessary: Node may discard duplicated Authorization fields.
function values(req, name) {
  if (!Array.isArray(req.rawHeaders) || req.rawHeaders.length % 2) fail();
  const found = [];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (typeof req.rawHeaders[i] !== 'string' || typeof req.rawHeaders[i+1] !== 'string') fail();
    if (req.rawHeaders[i].toLowerCase() === name) found.push(req.rawHeaders[i+1]);
  }
  return found;
}
function origin(req) {
  const origins = values(req, 'origin');
  if (origins.length !== 1 || origins[0] !== ORIGIN) fail(403, 'ORIGIN_FORBIDDEN');
}
function authorization(req, op) {
  const headers = values(req, 'authorization');
  if (headers.length > 1) fail();
  if (!headers.length) { if (REQUIRED_AUTH.has(op)) fail(401, 'UNAUTHORIZED'); return null; }
  const value = headers[0];
  if (value.length > 8199 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) fail(401, 'UNAUTHORIZED');
  return value.slice(7);
}
function cookie(req) {
  const raw = values(req, 'cookie').join('; ');
  if (Buffer.byteLength(raw) > 16384) fail(431, 'HEADERS_TOO_LARGE');
  const found = raw.split(';').map(s => s.replace(/^[ \t]+|[ \t]+$/g, '')).filter(s => {
    const at = s.indexOf('='); return (at < 0 ? s : s.slice(0,at)) === COOKIE;
  });
  if (!found.length) return null;
  if (found.length !== 1) fail(403, 'INVALID_CAPABILITY');
  const value = found[0].slice(COOKIE.length+1), parts = value.split('.');
  if (parts.length !== 2 || !INSTALLATION.test(parts[0]) || parts[1].length !== 43) fail(403, 'INVALID_CAPABILITY');
  let cap;
  try { cap = bytes(parts[1], 32); } catch { fail(403, 'INVALID_CAPABILITY'); }
  return {id: parts[0], digest: createHash('sha256').update(cap).digest()};
}
function setCookie(id, raw) {
  return `${COOKIE}=${id}.${raw.toString('base64url')}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`;
}
async function readBody(req, deadline, now = Date.now) {
  const types = values(req, 'content-type'), encodings = values(req, 'content-encoding');
  if (types.length !== 1 || !/^application\/json(?:[ \t]*;[ \t]*charset=utf-8)?$/i.test(types[0]) ||
    encodings.length > 1 || (encodings.length && encodings[0].toLowerCase() !== 'identity')) fail(415, 'UNSUPPORTED_MEDIA_TYPE');
  if (typeof req.on !== 'function' || req.readableEnded || req.destroyed) fail();
  const raw = await new Promise((resolve, reject) => {
    let size = 0, chunks = [], settled = false;
    const done = (error, data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.removeListener('data', dataHandler); req.removeListener('end', endHandler);
      req.removeListener('error', errorHandler); req.removeListener('aborted', errorHandler);
      req.once('error', () => {}); // Do not expose a late stream error after responding.
      if (error) { req.pause(); reject(error); } else resolve(data);
      chunks = [];
    };
    const dataHandler = chunk => {
      if (!Buffer.isBuffer(chunk)) return done(new Fault(400, 'INVALID_REQUEST'));
      size += chunk.length;
      if (size > 16384) return done(new Fault(413, 'PAYLOAD_TOO_LARGE'));
      chunks.push(chunk);
    };
    const endHandler = () => done(null, Buffer.concat(chunks));
    const errorHandler = () => done(new Fault(400, 'INVALID_REQUEST'));
    const timer = setTimeout(() => done(new Fault(503, 'UNAVAILABLE')), Math.max(1, deadline-now()));
    req.on('data', dataHandler); req.once('end', endHandler); req.once('error', errorHandler); req.once('aborted', errorHandler);
  });
  let body;
  try {
    const text = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(raw);
    if (text.startsWith('\uFEFF')) fail();
    body = JSON.parse(text);
  } catch { fail(); }
  return validateBody(body);
}
function validateResult(result) {
  try {
    exact(result, ['status','installation_id','state','binding_id','binding_version','user_id']);
    if (result.status !== 'ok' || !INSTALLATION.test(result.installation_id) || typeof result.installation_id !== 'string' ||
      !UUID.test(result.binding_id) || typeof result.binding_id !== 'string' || !version(result.binding_version) ||
      !['unbound','reserved','active','disabled'].includes(result.state) ||
      (result.user_id !== null && (typeof result.user_id !== 'string' || !UUID.test(result.user_id))) ||
      (['unbound','disabled'].includes(result.state) !== (result.user_id === null))) fail();
    return result;
  } catch { fail(503, 'UNAVAILABLE'); }
}
module.exports = {Fault, fail, exact, UUID, INSTALLATION, MUTATIONS, REQUIRED_AUTH, version,
  validateBody, material, origin, authorization, cookie, setCookie, readBody, validateResult};
