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
    return {title:payload.title, options:{body:payload.body, tag:payload.tag, data:{
      type:'personal', category:d.category, notification_id:d.notification_id,
      story_id:d.story_id, chapter_id:d.chapter_id, comment_id:d.comment_id
    }}};
  }
  function content(payload) {
    if (!exact(payload, ['version','type','title','body','tag','data']) || payload.version !== 1 || payload.type !== 'content' ||
      !text(payload.title, 100) || !text(payload.body, 240) || !text(payload.tag, 80) ||
      !exact(payload.data, ['content_event_id','publication_id','category','story_id','chapter_id'])) return null;
    const d = payload.data;
    if (!decimal(d.content_event_id) || !decimal(d.publication_id) || !decimal(d.story_id) ||
      payload.tag !== 'nca-content-' + d.content_event_id || !['new_story','new_chapter'].includes(d.category) ||
      (d.category === 'new_story' ? d.chapter_id !== null : !decimal(d.chapter_id))) return null;
    return {title:payload.title, options:{body:payload.body, tag:payload.tag, data:{
      type:'content', category:d.category, content_event_id:d.content_event_id,
      story_id:d.story_id, chapter_id:d.chapter_id
    }}};
  }
  function clickTarget(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return scope.location.origin + '/';
    const url = new URL('/', scope.location.origin);
    if (data.type === 'content' && ['new_story','new_chapter'].includes(data.category) && decimal(data.story_id) &&
      (data.category === 'new_story' ? data.chapter_id === null : decimal(data.chapter_id))) {
      url.searchParams.set('nca_push','content');
      url.searchParams.set('category',data.category);
      url.searchParams.set('story_id',data.story_id);
      if (data.chapter_id !== null) url.searchParams.set('chapter_id',data.chapter_id);
      return url.href;
    }
    if (data.type === 'personal' && ['comment','reply','mention','comment_like'].includes(data.category) && decimal(data.notification_id) &&
      ['story_id','chapter_id','comment_id'].every(k => data[k] === null || decimal(data[k]))) {
      url.searchParams.set('nca_push','personal');
      url.searchParams.set('category',data.category);
      url.searchParams.set('notification_id',data.notification_id);
      for (const key of ['story_id','chapter_id','comment_id']) if (data[key] !== null) url.searchParams.set(key,data[key]);
      return url.href;
    }
    return scope.location.origin + '/';
  }
  scope.addEventListener('install', event => event.waitUntil(scope.skipWaiting()));
  scope.addEventListener('push', event => {
    event.waitUntil((async () => {
      try {
        if (!event.data || event.data.text().length > 4096) return;
        const payload = event.data.json();
        const value = personal(payload) || content(payload);
        if (value) await scope.registration.showNotification(value.title, value.options);
      } catch { /* Malformed data/OS rejection must not produce an unhandled error. */ }
    })());
  });
  scope.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil((async () => {
      const target = clickTarget(event.notification.data);
      try {
        const windows = await scope.clients.matchAll({type:'window', includeUncontrolled:true});
        for (const window of windows) {
          try {
            if (new URL(window.url).origin !== scope.location.origin || typeof window.navigate !== 'function') continue;
            const navigated = await window.navigate(target);
            if (navigated && typeof navigated.focus === 'function') { await navigated.focus(); return; }
          } catch {}
        }
        await scope.clients.openWindow(target);
      } catch { /* Validated IDs only; fall back silently if the platform rejects navigation. */ }
    })());
  });
})(self);
