const crypto = require('crypto');

function tokenFor(password) {
  return crypto.createHmac('sha256', password).update('nha-co-alex-gate-v1').digest('hex');
}
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(v => { const i=v.indexOf('='); return [v.slice(0,i), decodeURIComponent(v.slice(i+1))]; }));
}
function validCookie(req, password) {
  const got = parseCookies(req).nha_gate || '';
  const expected = tokenFor(password);
  if (got.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { return false; }
}
module.exports = { tokenFor, validCookie };
