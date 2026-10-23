'use strict';

// Private bounds: HTTP callers cannot select work, limits, leases or cursors.
const EVENTS = 2, PAGE_SIZE = 50, PAGES_PER_EVENT = 2, TOTAL_PAGES = 4, BUDGET_MS = 45000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const uuid = v => typeof v === 'string' && v.length === 36 && UUID.test(v);
const id = v => typeof v === 'string' && /^[1-9][0-9]{0,18}$/.test(v) &&
  BigInt(v).toString() === v && BigInt(v) <= 9223372036854775807n;
const count = v => Number.isInteger(v) && v >= 0 && v <= PAGE_SIZE;

function validClaim(result) {
  return object(result) && result.status === 'ok' && Array.isArray(result.events) && result.events.length <= EVENTS &&
    new Set(result.events.map(e => e && e.event_id)).size === result.events.length &&
    result.events.every(e => object(e) && id(e.event_id) && uuid(e.lease_token) &&
      typeof e.lease_until === 'string' && e.lease_until.length <= 64 && Number.isFinite(Date.parse(e.lease_until)));
}

function validPage(p, after) {
  if (!object(p)) return false;
  if (p.status === 'gone') return p.inserted === 0;
  if (!['ok', 'expired', 'source_mismatch'].includes(p.status) || !count(p.scanned) || !count(p.inserted) ||
    p.inserted > p.scanned || typeof p.has_more !== 'boolean' || p.complete !== !p.has_more ||
    !(p.after === null || uuid(p.after)) || (p.scanned > 0 && !uuid(p.after))) return false;
  if (p.status !== 'ok') return p.complete && p.scanned === 0 && p.inserted === 0;
  return (!p.has_more || p.scanned === PAGE_SIZE) &&
    !(p.scanned > 0 && after !== null && p.after <= after);
}

async function runWorker({db, now = () => performance.now()}) {
  const result = {claimed: 0, pages: 0, scanned: 0, inserted: 0, completed: 0, expired: 0, gone: 0, suppressed: 0, deferred: 0, errors: 0};
  const started = now();
  // Reserve 30s for every call: 2s checkout + four 7s queries, including
  // initialization if a fresh connection is needed. Leave 15s below Vercel's 60s.
  const timeFor = reserve => {
    const elapsed = now() - started;
    return Number.isFinite(elapsed) && elapsed >= 0 && elapsed + reserve <= BUDGET_MS;
  };
  try {
    if (!timeFor(30000)) return result;
    const claim = await db.claim(EVENTS);
    if (!validClaim(claim)) throw Error();
    result.claimed = claim.events.length;
    for (const event of claim.events) {
      let after = null;
      for (let page = 0; page < PAGES_PER_EVENT && result.pages < TOTAL_PAGES && timeFor(30000); page++) {
        result.pages++;
        const p = await db.fanoutPage(event.event_id, event.lease_token, PAGE_SIZE);
        if (!validPage(p, after)) throw Error();
        if (p.status === 'gone') { result.gone++; break; }
        result.scanned += p.scanned;
        result.inserted += p.inserted;
        if (p.status === 'expired') { result.expired++; break; }
        if (p.status === 'source_mismatch') { result.suppressed++; break; }
        if (p.complete) { result.completed++; break; }
        after = p.after;
      }
    }
  } catch {
    // Includes PT409, 55P03, timeout and unknown outcome: no replay or retry.
    result.errors++;
  }
  result.deferred = result.claimed - result.completed - result.expired - result.gone - result.suppressed;
  return result;
}

module.exports = {runWorker};
