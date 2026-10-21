'use strict';

const {performance} = require('node:perf_hooks');
const decimal = value => value === null || (typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);

function payloadFor(notification) {
  if (!notification || !decimal(notification.id) || notification.id === null ||
    !['comment', 'reply', 'mention', 'comment_like'].includes(notification.category) ||
    !['story_id', 'chapter_id', 'comment_id'].every(k => decimal(notification[k]))) throw new Error('INVALID_NOTIFICATION_SHAPE');
  return {
    version: 1, type: 'personal', title: 'Nhà có Alex', body: 'Bạn có thông báo mới.',
    tag: 'nca-notification-' + notification.id,
    data: {notification_id: notification.id, category: notification.category,
      story_id: notification.story_id, chapter_id: notification.chapter_id, comment_id: notification.comment_id}
  };
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
      const payload = payloadFor(ready.notification);
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
