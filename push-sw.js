'use strict';
// Push only: no fetch/cache interception, database calls or background mutations.
(function (scope) {
  const exact = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) &&
    Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
  const decimal = v => typeof v === 'string' && /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n;
  const text = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
  function personal(payload) {
    if (!exact(payload, ['version','type','title','body','tag','data']) || payload.version !== 1 || payload.type !== 'personal' ||
      !text(payload.title, 100) || !text(payload.body, 240) || !text(payload.tag, 80) ||
      !exact(payload.data, ['notification_id','category','story_id','chapter_id','comment_id'])) return null;
    const d = payload.data;
    if (!decimal(d.notification_id) || payload.tag !== 'nca-notification-' + d.notification_id ||
      !['comment','reply','mention','comment_like'].includes(d.category) ||
      !['story_id','chapter_id','comment_id'].every(k => d[k] === null || decimal(d[k]))) return null;
    // Click navigation intentionally uses the app root, not any payload URL/record.
    return {title:payload.title, options:{body:payload.body, tag:payload.tag, data:{notification_id:d.notification_id}}};
  }
  scope.addEventListener('push', event => {
    event.waitUntil((async () => {
      try {
        if (!event.data || event.data.text().length > 4096) return;
        const value = personal(event.data.json());
        if (value) await scope.registration.showNotification(value.title, value.options);
      } catch { /* Malformed data/OS rejection must not produce an unhandled error. */ }
    })());
  });
  scope.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil((async () => {
      try {
        const windows = await scope.clients.matchAll({type:'window', includeUncontrolled:true});
        for (const window of windows) {
          try { if (new URL(window.url).origin === scope.location.origin && typeof window.focus === 'function') { await window.focus(); return; } } catch {}
        }
        await scope.clients.openWindow(scope.location.origin + '/');
      } catch { /* No payload-controlled URL or fallback external navigation. */ }
    })());
  });
})(self);
