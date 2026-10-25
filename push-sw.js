'use strict';
// Push only: no fetch/cache interception or database calls. Click navigation is handed to the app as well as the requested URL.
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
  function normalizedIntent(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.type === 'content' && ['new_story','new_chapter'].includes(data.category) && decimal(data.story_id) &&
      (data.category === 'new_story' ? data.chapter_id === null : decimal(data.chapter_id))) {
      return {type:'content',category:data.category,story_id:data.story_id,chapter_id:data.chapter_id};
    }
    if (data.type === 'personal' && ['comment','reply','mention','comment_like'].includes(data.category) && decimal(data.notification_id) &&
      ['story_id','chapter_id','comment_id'].every(k => data[k] === null || decimal(data[k]))) {
      return {type:'personal',category:data.category,notification_id:data.notification_id,
        story_id:data.story_id,chapter_id:data.chapter_id,comment_id:data.comment_id};
    }
    return null;
  }
  function clickTarget(intent) {
    if (!intent) return scope.location.origin + '/';
    const url = new URL('/', scope.location.origin);
    url.searchParams.set('nca_push',intent.type);
    url.searchParams.set('category',intent.category);
    if (intent.type === 'personal') url.searchParams.set('notification_id',intent.notification_id);
    if (intent.story_id !== null) url.searchParams.set('story_id',intent.story_id);
    if (intent.chapter_id !== null) url.searchParams.set('chapter_id',intent.chapter_id);
    if (intent.type === 'personal' && intent.comment_id !== null) url.searchParams.set('comment_id',intent.comment_id);
    return url.href;
  }
  const messageFor = intent => ({type:'nca-push-click-v1', intent});
  const sleep = ms => new Promise(resolve => scope.setTimeout(resolve, ms));
  async function handoff(client, message) {
    if (!client || typeof client.postMessage !== 'function') return;
    for (const delay of [0,100,250,500,900,1500]) {
      if (delay) await sleep(delay);
      try { client.postMessage(message); } catch {}
    }
  }
  scope.addEventListener('install', event => event.waitUntil(scope.skipWaiting()));
  scope.addEventListener('activate', event => event.waitUntil(scope.clients.claim()));
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
      const intent = normalizedIntent(event.notification.data), target = clickTarget(intent);
      if (!intent) {
        try { await scope.clients.openWindow(scope.location.origin + '/'); } catch {}
        return;
      }
      const message = messageFor(intent);
      try {
        const windows = await scope.clients.matchAll({type:'window', includeUncontrolled:true});
        const existing = windows.find(window => {
          try { return new URL(window.url).origin === scope.location.origin; } catch { return false; }
        });
        if (existing) {
          try { existing.postMessage(message); } catch {}
          let client=existing;
          try { if (typeof existing.navigate === 'function') client=(await existing.navigate(target))||existing; } catch {}
          try { if (typeof client.focus === 'function') await client.focus(); } catch {}
          await handoff(client,message);
          return;
        }
        const opened = await scope.clients.openWindow(target);
        if (opened) {
          try { if (typeof opened.focus === 'function') await opened.focus(); } catch {}
          await handoff(opened,message);
        }
      } catch {
        try { await scope.clients.openWindow(target); } catch {}
      }
    })());
  });
})(self);
