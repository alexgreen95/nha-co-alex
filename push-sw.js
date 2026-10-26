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

  // One short-lived navigation record, never credentials or a payload-provided URL.
  const TTL = 5 * 60 * 1000, VERSION = 'nca-push-navigation-v2';
  let memory = null, storageFlight = Promise.resolve();
  const validRecord = r => exact(r, ['id','intent','createdAt','clientId']) &&
    (r.clientId === null || typeof r.clientId === 'string' && r.clientId.length <= 256) &&
    /^[a-f0-9]{32}$/.test(r.id) && Number.isSafeInteger(r.createdAt) && r.createdAt > 0 &&
    r.createdAt <= Date.now() + 5000 && Date.now() - r.createdAt < TTL && normalizedIntent(r.intent);
  function stored(change) {
    const task = storageFlight.then(async () => {
      const transform = value => change(validRecord(value) ? value : null);
      if (!scope.indexedDB) { memory = transform(memory); return memory; }
      try {
        return await new Promise((resolve, reject) => {
          const request = scope.indexedDB.open(VERSION, 1);
          request.onupgradeneeded = () => request.result.createObjectStore('intent');
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('NAVIGATION_STORAGE_BLOCKED'));
          request.onsuccess = () => {
            const db = request.result, tx = db.transaction('intent', 'readwrite'), store = tx.objectStore('intent');
            let result;
            const get = store.get('pending');
            get.onsuccess = () => {
              result = transform(get.result);
              if (result) store.put(result, 'pending'); else store.delete('pending');
            };
            tx.oncomplete = () => { db.close(); memory = result; resolve(result); };
            tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
          };
        });
      } catch { memory = transform(memory); return memory; }
    });
    storageFlight = task.catch(() => {});
    return task;
  }
  const sameOrigin = client => {
    try { return client?.type === 'window' && typeof client.id === 'string' && new URL(client.url).origin === scope.location.origin; }
    catch { return false; }
  };
  const windows = async () => (await scope.clients.matchAll({type:'window', includeUncontrolled:true})).filter(sameOrigin);
  const sleep = ms => new Promise(resolve => scope.setTimeout(resolve, ms));
  function envelope(record) {
    return {type:'nca-push-intent-v2', id:record.id, createdAt:record.createdAt, intent:normalizedIntent(record.intent)};
  }
  async function ready(client) {
    if (!sameOrigin(client)) return;
    const current = await stored(r => r);
    if (!current) return;
    if (current.clientId && current.clientId !== client.id) {
      const alive = await windows();
      if (alive.some(w => w.id === current.clientId)) return;
    }
    const record = await stored(r => r?.id === current.id ? {...r, clientId:client.id} : r);
    if (record?.id === current.id && record.clientId === client.id) {
      client.postMessage(envelope(record));
      if (current.clientId !== client.id && client.focus) { try { await client.focus(); } catch {} }
    }
  }
  scope.addEventListener('message', event => {
    if (!sameOrigin(event.source)) return;
    const data = event.data;
    event.waitUntil((async () => {
      try {
        if (exact(data, ['type']) && data.type === 'nca-push-ready-v2') await ready(event.source);
        else if (exact(data, ['type','id']) && data.type === 'nca-push-ack-v2' && /^[a-f0-9]{32}$/.test(data.id)) {
          await stored(r => r?.id === data.id && r.clientId === event.source.id ? null : r);
        }
      } catch { /* Retain pending record for a later READY. */ }
    })());
  });
  scope.addEventListener('install', event => event.waitUntil(scope.skipWaiting()));
  scope.addEventListener('activate', event => event.waitUntil((async () => {
    await scope.clients.claim();
    await stored(r => r);
    for (const client of await windows()) { try { client.postMessage({type:'nca-push-probe-v2'}); } catch {} }
  })()));
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
      const bytes = scope.crypto.getRandomValues(new Uint8Array(16));
      const id = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
      const record = await stored(r => ({id, intent, createdAt:Math.max(Date.now(), (r?.createdAt || 0) + 1), clientId:null}));
      const url = new URL(target);
      url.searchParams.set('nca_push_id', id);
      url.searchParams.set('nca_push_at', String(record.createdAt));
      let client, navigated = false;
      const focused = new Set();
      try {
        client = (await windows()).sort((a,b) => Number(b.focused) - Number(a.focused))[0];
        if (!client) client = await scope.clients.openWindow(url.href);
        if (client?.focus) { focused.add(client.id); try { await client.focus(); } catch {} }
      } catch { try { client = await scope.clients.openWindow(url.href); } catch {} }
      // Bounded active handshake. Durable record outlives this event: a later page READY can recover it.
      for (let attempt = 0; attempt < 40; attempt++) {
        const pending = await stored(r => r);
        if (pending?.id !== id) return; // ACK or a newer click owns the slot.
        try {
          const all = await windows();
          client = all.find(w => w.id === pending.clientId) || all.find(w => w.id === client?.id) || all[0];
          if (client) {
            if (!focused.has(client.id) && client.focus) { focused.add(client.id); try { await client.focus(); } catch {} }
            client.postMessage({type:'nca-push-probe-v2'});
            // Old pages have no receiver. Reload once only if no ACK arrived.
            if (attempt === 2 && !pending.clientId && !navigated && typeof client.navigate === 'function') {
              navigated = true;
              client = await client.navigate(url.href) || client;
            }
          }
        } catch {}
        await sleep(500);
      }
    })());
  });
})(self);
