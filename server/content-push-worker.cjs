'use strict';
const {performance}=require('node:perf_hooks');
const decimal=v=>typeof v==='string' && /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v)<=9223372036854775807n;
const uuid=v=>typeof v==='string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v);

// Bounds are UTF-16 units, matching the unchanged service worker's limits.
const segments = new Intl.Segmenter('vi', {granularity: 'grapheme'});
function displayText(value, limit, rejectEmail = false) {
  if (typeof value !== 'string' || value.length > 8192 || !value.isWellFormed()) return null;
  const text = value.normalize('NFC').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/gu, ' ').trim();
  if (!text || (rejectEmail && text.includes('@')) || /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/iu.test(text)) return null;
  if (text.length <= limit) return text;
  let out = '';
  for (const {segment} of segments.segment(text)) {
    if (out.length + segment.length > limit - 1) break;
    out += segment;
  }
  return out.trimEnd() ? out.trimEnd() + '…' : null;
}

function payloadFor(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content) ||
    !decimal(content.event_id) || !decimal(content.publication_id) || !decimal(content.story_id) ||
    !['new_story','new_chapter'].includes(content.category) ||
    (content.category === 'new_story' ? content.chapter_id !== null : !decimal(content.chapter_id))) {
    throw new Error('INVALID_CONTENT_SHAPE');
  }
  const story = displayText(content.story_title, 100), chapter = displayText(content.chapter_title, 100);
  const body = content.category === 'new_story' ?
    (story ? `Alex đã đăng truyện mới “${story}”.` : 'Alex đã đăng truyện mới.') :
    (story ? (chapter ? `Alex đã đăng chương “${chapter}” cho truyện “${story}”.` :
      `Alex đã đăng chương mới cho truyện “${story}”.`) : 'Alex đã đăng chương mới.');
  return {version:1, type:'content', title:'Alex hiện lên và nói', body,
    tag:'nca-content-'+content.event_id,
    data:{content_event_id:content.event_id, publication_id:content.publication_id,
      category:content.category, story_id:content.story_id, chapter_id:content.chapter_id}};
}

async function runWorker({db, transport, now = () => performance.now(), maxItems = 5, budgetMs = 45000}) {
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 5 || !Number.isFinite(budgetMs) || budgetMs < 1 || budgetMs > 45000) {
    throw new Error('INVALID_WORKER_BOUND');
  }
  const start = now(), summary = {claimed: 0, sent: 0, suppressed: 0, deferred: 0, failed: 0, errors: 0};
  for (let i = 0; i < maxItems && now() - start < budgetMs - 15000; i++) {
    let item;
    try {
      const claim = await db.claim(1);
      if (claim?.status !== 'ok' || !Array.isArray(claim.deliveries) || claim.deliveries.length > 1) throw new Error('INVALID_CLAIM');
      if (claim.deliveries.length === 0) break;
      item = claim.deliveries[0];
      if (!uuid(item.delivery_id) || !uuid(item.lease_token)) throw new Error('INVALID_CLAIM');
      summary.claimed++;
      // No asynchronous enrichment between this fresh DB check and transport.
      const before = now();
      const ready = await db.prepare(item.delivery_id, item.lease_token);
      if (ready?.status === 'gone' || ready?.status === 'cancelled') { summary.suppressed++; continue; }
      if (ready?.status !== 'ready') throw new Error('INVALID_PREPARE');
      const payload = payloadFor(ready.content);
      if (!Number.isFinite(ready.lease_remaining_ms) || ready.lease_remaining_ms < 15000 ||
        !Number.isFinite(ready.event_remaining_seconds) || ready.event_remaining_seconds < 1 ||
        now() - before > 2000 || now() - start > budgetMs - 7000) {
        // No send on delayed/stale preparation; bounded retry under same lease.
        await db.finish(item.delivery_id, item.lease_token, 'network');
        summary.deferred++; continue;
      }
      let outcome;
      try { outcome = await transport.send(ready.subscription, payload, ready.event_remaining_seconds); }
      catch { outcome = 'network'; }
      if (!['sent', 'transient', 'network', 'invalid_subscription', 'malformed_subscription'].includes(outcome)) outcome = 'network';
      const final = await db.finish(item.delivery_id, item.lease_token, outcome);
      if (final.status === 'sent') summary.sent++;
      else if (final.status === 'pending') summary.deferred++;
      else if (final.status === 'failed') summary.failed++;
      else summary.suppressed++;
    } catch {
      // Never retry DB calls blindly. An accepted push with failed finalize may
      // be sent again after lease recovery; leave current state authoritative.
      summary.errors++;
      break;
    }
  }
  return summary;
}

module.exports = {runWorker, payloadFor};
