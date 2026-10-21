/* Fresh browser implementation of lifecycle API V1. No credentials/capability access. */
(function (root) {
  'use strict';
  const ORIGIN = 'https://nha-co-alex.vercel.app';
  const KEY = 'nca.push.lifecycle.v1', GUARD = 'nca.push.lifecycle.safety.v1';
  const LOCK = 'nca-push-subscription-lifecycle-v1';
  const BROWSER_LOCK = 'nca-push-subscription-browser-v1';
  const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  const INSTALL = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const STATES = ['unbound','reserved','active','disabled'];
  const exact = (o, keys) => !!o && typeof o === 'object' && !Array.isArray(o) &&
    Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
  const version = v => typeof v === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(v) && BigInt(v) <= 9223372036854775807n;
  const metadata = o => exact(o, ['installation_id','binding_id','binding_version','state']) &&
    typeof o.installation_id === 'string' && INSTALL.test(o.installation_id) && typeof o.binding_id === 'string' &&
    UUID.test(o.binding_id) && version(o.binding_version) && STATES.includes(o.state);
  const fault = code => Object.assign(new Error(code), {safeCode:code});
  function bytes(value, size) {
    if (typeof value !== 'string' || value.length !== Math.ceil(size * 8 / 6) || !/^[A-Za-z0-9_-]+$/.test(value)) throw fault('INVALID_MATERIAL');
    const s = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4-value.length%4)%4));
    const out = Uint8Array.from(s, c => c.charCodeAt(0));
    if (out.length !== size || encode(out) !== value) throw fault('INVALID_MATERIAL');
    return out;
  }
  const encode = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function point(value) {
    const b = bytes(value, 65);
    const n = a => BigInt('0x'+Array.from(a, x=>x.toString(16).padStart(2,'0')).join(''));
    const p = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
    const c = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
    const x=n(b.slice(1,33)), y=n(b.slice(33));
    if (b[0] !== 4 || x>=p || y>=p || (y*y-(x*x*x-3n*x+c))%p !== 0n) throw fault('INVALID_MATERIAL');
    return b;
  }
  function material(subscription) {
    const j = subscription.toJSON();
    if (!j || !j.keys || typeof j.endpoint !== 'string' || j.endpoint.length>2048 || !/^[\x21-\x7e]+$/.test(j.endpoint)) throw fault('INVALID_MATERIAL');
    const u = new URL(j.endpoint);
    if (u.href !== j.endpoint || u.protocol !== 'https:' || u.port || u.username || u.password || j.endpoint.includes('#') ||
      !(['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname))) throw fault('INVALID_MATERIAL');
    point(j.keys.p256dh); bytes(j.keys.auth,16);
    return {endpoint:j.endpoint,keys:{p256dh:j.keys.p256dh,auth:j.keys.auth}};
  }
  function result(value, op, previous) {
    if (!exact(value,['ok','operation','subscription']) || value.ok!==true || value.operation!==op) throw fault('INVALID_RESPONSE');
    const s=value.subscription;
    if (!exact(s,['installation_id','state','binding_id','binding_version','ownership']) ||
      !metadata({installation_id:s.installation_id,binding_id:s.binding_id,binding_version:s.binding_version,state:s.state}) ||
      !['none','self','other','unverified'].includes(s.ownership) ||
      (['unbound','disabled'].includes(s.state) !== (s.ownership==='none'))) throw fault('INVALID_RESPONSE');
    if (previous && s.installation_id!==previous.installation_id) throw fault('INVALID_RESPONSE');
    if (previous && !['status','create'].includes(op) &&
      (s.binding_id===previous.binding_id || BigInt(s.binding_version)!==BigInt(previous.binding_version)+1n)) throw fault('INVALID_RESPONSE');
    if (op==='reserve' && (s.state!=='reserved'||s.ownership!=='self') || ['activate','recover'].includes(op) && (s.state!=='active'||s.ownership!=='self')) throw fault('INVALID_RESPONSE');
    return s;
  }
  function create({sb, getAccount, env = root, requestTimeout = 30000, cleanupTimeout = 4000} = {}) {
    let epoch=0, owner=getAccount(), preparedOwner, initFlight, transportFlight=Promise.resolve(), browserFlight=Promise.resolve(), state={status:'NOT_INITIALIZED',risk:false};
    const nav=env.navigator;
    const supported = () => {
      if (!env.isSecureContext || env.location.origin!==ORIGIN || !nav?.serviceWorker || !env.PushManager || !env.Notification) return 'UNSUPPORTED';
      const ios=/iPad|iPhone|iPod/.test(nav.userAgent||'') || nav.platform==='MacIntel' && nav.maxTouchPoints>1;
      if (ios && !nav.standalone && !env.matchMedia?.('(display-mode: standalone)').matches) return 'HOME_SCREEN_REQUIRED';
      if (!nav.locks?.request) return 'UNSUPPORTED_COORDINATION';
      return null;
    };
    const publish = (status, risk=false) => { state={status,risk}; return getState(); };
    const getState = () => ({...state,permission:env.Notification?.permission||'unsupported'});
    const guard = () => { try { const s=env.localStorage.getItem(GUARD); return s===null?null:['blocked','unknown','repair'].includes(s)?s:'blocked'; } catch { throw fault('STORAGE_UNAVAILABLE'); } };
    const mark = value => { try { if(value)env.localStorage.setItem(GUARD,value);else env.localStorage.removeItem(GUARD); } catch { throw fault('STORAGE_UNAVAILABLE'); } };
    const read = () => {
      try {
        const raw=env.localStorage.getItem(KEY); if(raw===null)return null;
        if(raw.length>1024)throw 0;
        const value=JSON.parse(raw); if(!metadata(value))throw 0; return value;
      } catch { mark('repair'); throw fault('LOCAL_METADATA_INVALID'); }
    };
    const save = row => { const value={installation_id:row.installation_id,binding_id:row.binding_id,binding_version:row.binding_version,state:row.state}; env.localStorage.setItem(KEY,JSON.stringify(value)); };
    const context = () => ({epoch,user:getAccount()});
    const current = c => { if(c.epoch!==epoch || c.user!==getAccount())throw fault('STALE_ACTION'); };
    const step = async (p,c) => { const value=await p; current(c); return value; };
    const bounded = (p,ms,code='UNAVAILABLE') => new Promise((resolve,reject)=>{const timer=env.setTimeout(()=>reject(fault(code)),ms);Promise.resolve(p).then(v=>{env.clearTimeout(timer);resolve(v)},()=>{env.clearTimeout(timer);reject(fault(code))})});
    async function token(c, required) {
      if(!c.user){if(required)throw fault('SIGN_IN_REQUIRED');return null;}
      const r=await step(bounded(sb.auth.getSession(),2000),c),s=r?.data?.session;
      if(r.error || !s || s.user?.id!==c.user || typeof s.access_token!=='string' || s.access_token.length>8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s.access_token))throw fault('SIGN_IN_REQUIRED');
      return s.access_token; // Used only for this request; server verifies it independently.
    }
    async function api(op, row, c, extra={}, anonymous=false) {
      current(c);
      const mutation=op!=='status', body={operation:op};
      if(op!=='create')body.installation_id=row.installation_id;
      if(!['create','status'].includes(op)){body.binding_id=row.binding_id;body.binding_version=row.binding_version;}
      Object.assign(body,extra);
      const auth=anonymous?null:await token(c,['create','reserve','activate','recover'].includes(op)); current(c);
      const previousGuard=guard();
      if(['reserve','activate','recover'].includes(op) && previousGuard)throw fault('REPAIR_REQUIRED');
      if(mutation)mark('unknown'); // Persistent crash/timeout barrier, shared by all tabs.
      const controller=new env.AbortController(); let timedOut=false;
      const timer=env.setTimeout(()=>{timedOut=true;if(mutation){try{mark('unknown')}catch{}publish('OUTCOME_UNKNOWN',true)}controller.abort()},requestTimeout);
      let response;
      try {
        const headers={'Content-Type':'application/json'}; if(auth)headers.Authorization='Bearer '+auth;
        // Browser supplies Origin and HttpOnly cookie; neither is read or synthesized here.
        const flight=Promise.resolve(env.fetch('/api/push-subscriptions',{method:'POST',credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',headers,body:JSON.stringify(body),signal:controller.signal})).then(async r=>[r,await r.text()]);
        transportFlight=flight.catch(()=>{});
        const [received,text]=await bounded(flight,requestTimeout,'OUTCOME_UNKNOWN');response=received;
        current(c); if(timedOut || text.length>16384)throw fault('INVALID_RESPONSE');
        const json=JSON.parse(text);
        if(!response.ok){
          const codes=['INVALID_REQUEST','UNAUTHORIZED','ORIGIN_FORBIDDEN','INVALID_CAPABILITY','STATE_CONFLICT','ACCOUNT_BINDING_CONFLICT','ENDPOINT_CONFLICT','ACCOUNT_UNAVAILABLE','UNAVAILABLE','OUTCOME_UNKNOWN'];
          if(!exact(json,['ok','error']) || json.ok!==false || !exact(json.error,['code']) || !codes.includes(json.error.code))throw fault('INVALID_RESPONSE');
          if(mutation && response.status>=500)throw fault('OUTCOME_UNKNOWN');
          if(mutation)mark(previousGuard);
          throw fault(json.error.code);
        }
        if(op==='create'?![200,201].includes(response.status):response.status!==200)throw fault('INVALID_RESPONSE');
        const next=result(json,op,row);
        if(op==='release' && (next.state!==(extra.disable?'disabled':'unbound')||next.ownership!=='none'))throw fault('INVALID_RESPONSE');
        if(op==='create' && response.status===201 && (next.state!=='unbound'||next.binding_version!=='0'))throw fault('INVALID_RESPONSE');
        save(next); if(mutation)mark(previousGuard);
        return next;
      } catch(error) {
        const definite=['INVALID_REQUEST','UNAUTHORIZED','ORIGIN_FORBIDDEN','INVALID_CAPABILITY','STATE_CONFLICT','ACCOUNT_BINDING_CONFLICT','ENDPOINT_CONFLICT','ACCOUNT_UNAVAILABLE'];
        if(mutation && !definite.includes(error?.safeCode)){mark('unknown');throw fault('OUTCOME_UNKNOWN');}
        throw fault(error?.safeCode||'UNAVAILABLE');
      } finally { env.clearTimeout(timer); controller.abort(); }
    }
    async function locked(c,work,timeout=2000) {
      current(c); const reason=supported(); if(reason)throw fault(reason);
      const controller=new env.AbortController(),timer=env.setTimeout(()=>controller.abort(),timeout);
      try { return await nav.locks.request(LOCK,{mode:'exclusive',signal:controller.signal},async()=>{
        env.clearTimeout(timer);current(c);
        // A timeout reports/freeze state but cannot release coordination while an
        // old HTTP response could still deliver a successful Set-Cookie header.
        try{return await work()}finally{await transportFlight;await browserFlight}
      }); }
      finally {env.clearTimeout(timer);}
    }
    async function registration(c, allowRegister=false) {
      let reg=await step(bounded(nav.serviceWorker.getRegistration(ORIGIN+'/'),2000),c);
      const validate=r=>{if(!r || r.scope!==ORIGIN+'/' || ![r.active,r.waiting,r.installing].some(w=>w?.scriptURL===ORIGIN+'/push-sw.js'))throw fault('SERVICE_WORKER_CONFLICT');return r;};
      if(reg)validate(reg);
      else if(allowRegister){
        await step(bounded(nav.serviceWorker.register('/push-sw.js',{scope:'/',updateViaCache:'none'}),5000),c);
        reg=validate(await step(bounded(nav.serviceWorker.ready,5000),c));
      }
      return reg;
    }
    async function subscription(c,allowRegister=false) { const reg=await registration(c,allowRegister);return {reg,sub:reg?await step(bounded(reg.pushManager.getSubscription(),2000),c):null}; }
    async function config(c) {
      const r=await step(bounded(env.fetch('/api/push-config',{method:'GET',credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store'}),2000),c);
      const text=await step(bounded(r.text(),2000),c);if(!r.ok || text.length>512)throw fault('CONFIG_UNAVAILABLE');
      const j=JSON.parse(text);if(!exact(j,['ok','vapid_public_key'])||j.ok!==true)throw fault('CONFIG_UNAVAILABLE');
      return point(j.vapid_public_key);
    }
    function sameKey(sub,key) {try{return encode(sub.options.applicationServerKey)===encode(key)}catch{return false}}
    function browserWork(c, work) {
      // Also coordinate local mitigation when the main lifecycle lock is held by
      // an uncertain HTTP request. Never release this lock before browser work
      // actually settles, even if its caller reports a bounded timeout first.
      const flight=nav.locks.request(BROWSER_LOCK,{mode:'exclusive'},async()=>{current(c);return work();});
      browserFlight=flight.catch(()=>{});return flight;
    }
    async function unsubscribe(c) {
      try {
        return await bounded(browserWork(c,async()=>{
          const reg=await step(nav.serviceWorker.getRegistration(ORIGIN+'/'),c);if(!reg)return true;
          const sub=await step(reg.pushManager.getSubscription(),c);if(!sub)return true;
          let ok=false;try{ok=await step(sub.unsubscribe(),c)}catch{current(c)}
          if(ok===true)return true;
          return await step(reg.pushManager.getSubscription(),c)===null;
        }),1500);
      } catch { return false; }
    }
    async function fallback(c) {
      current(c);++epoch;const next=context();
      try{mark('blocked')}catch{}
      const local=await unsubscribe(next);current(next);
      try{mark(local?'repair':'blocked')}catch{}
      return publish(local?'REPAIR_REQUIRED':'OLD_ACCOUNT_PUSH_RISK',!local);
    }
    async function cleanup(c,disable) {
      try { return await locked(c,async()=>{
        let server=false,local=false;
        try {
          if(guard()==='unknown')throw fault('OUTCOME_UNKNOWN');
          const row=read();if(!row)throw fault('REPAIR_REQUIRED');
          const fresh=await api('status',row,c,{},true);
          const target=disable?'disabled':'unbound';
          if(fresh.state!==target)await api('release',fresh,c,{disable},true);
          server=true;
        } catch {}
        current(c);
        if(disable || !server)local=await unsubscribe(c);
        current(c);
        mark(server?null:local?'repair':'blocked');
        return publish(server?(disable&&!local?'DISABLED_LOCAL_UNSUBSCRIBE_FAILED':disable?'DISABLED':'UNBOUND'):local?'REPAIR_REQUIRED':'OLD_ACCOUNT_PUSH_RISK',!server&&!local);
      }); } catch(e) {current(c);return fallback(c);}
    }
    async function safe(work) {
      try { return await work(); }
      catch(e) { if(e?.safeCode==='STALE_ACTION')return getState();const codes=['UNSUPPORTED','HOME_SCREEN_REQUIRED','UNSUPPORTED_COORDINATION','STORAGE_UNAVAILABLE','LOCAL_METADATA_INVALID','SIGN_IN_REQUIRED','INVALID_CAPABILITY','STATE_CONFLICT','ACCOUNT_BINDING_CONFLICT','ENDPOINT_CONFLICT','ACCOUNT_UNAVAILABLE','OUTCOME_UNKNOWN','REPAIR_REQUIRED','PERMISSION_DENIED','USER_GESTURE_REQUIRED','SERVICE_WORKER_CONFLICT','INVALID_MATERIAL','CONFIG_UNAVAILABLE'];return publish(codes.includes(e?.safeCode)?e.safeCode:'UNAVAILABLE',e?.safeCode==='OUTCOME_UNKNOWN'); }
    }
    function initialize() {
      if(initFlight)return initFlight;
      const c=context();
      initFlight=safe(async()=>{
        const reason=supported();if(reason)return publish(reason);
        return locked(c,async()=>{
          const risk=guard();if(risk)return publish(risk==='blocked'?'OLD_ACCOUNT_PUSH_RISK':'REPAIR_REQUIRED',risk==='blocked');
          const row=read();if(!row)return publish(c.user?'SETUP_REQUIRED':'SIGN_IN_REQUIRED');
          const fresh=await api('status',row,c),{sub}=await subscription(c);
          if(fresh.state==='active' && sub){const key=await config(c);return publish(fresh.ownership==='self'&&sameKey(sub,key)?'ACTIVE':'REPAIR_REQUIRED');}
          return publish(fresh.state==='active'||fresh.state==='reserved'||sub?'REPAIR_REQUIRED':fresh.state.toUpperCase());
        });
      }).finally(()=>{initFlight=null});return initFlight;
    }
    async function acquire(c,key) {
      return step(bounded(browserWork(c,async()=>{
        let {reg,sub}=await subscription(c,true);
        if(sub&&!sameKey(sub,key)){
          const ok=await step(sub.unsubscribe(),c);
          if(ok!==true && await step(reg.pushManager.getSubscription(),c)!==null)throw fault('REPAIR_REQUIRED');sub=null;
        }
        if(!sub)sub=await step(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key}),c);
        const m=material(sub);current(c);return m;
      }),10000),c);
    }
    function enable({repair=false}={}) {
      const c=context();
      // Invoke permission synchronously inside the caller's user activation.
      if(supported())return Promise.resolve(publish(supported()));
      if(!nav.userActivation?.isActive)return Promise.resolve(publish('USER_GESTURE_REQUIRED'));
      if(!c.user)return Promise.resolve(publish('SIGN_IN_REQUIRED'));
      let permission;
      try {permission=env.Notification.permission==='default'?env.Notification.requestPermission():Promise.resolve(env.Notification.permission)}catch{return Promise.resolve(publish('PERMISSION_DENIED'))}
      return safe(async()=>{
        if(await step(permission,c)!=='granted')return publish('PERMISSION_DENIED');
        return locked(c,async()=>{
          const risk=guard(); if(risk&&!repair)throw fault('REPAIR_REQUIRED');
          if(repair){if(!await step(unsubscribe(c),c)){mark('blocked');return publish('OLD_ACCOUNT_PUSH_RISK',true);}mark('repair');}
          let saved;try{saved=read()}catch(e){if(!repair)throw e;}
          let row;
          if(saved){try{row=await api('status',saved,c)}catch(e){if(!repair || e.safeCode!=='INVALID_CAPABILITY')throw e;}}
          if(!row){
            if(!repair && !await step(unsubscribe(c),c)){mark('blocked');return publish('OLD_ACCOUNT_PUSH_RISK',true);}
            row=await api('create',null,c);
          }
          current(c);
          if(row.ownership==='other'||row.ownership==='unverified')row=await api('release',row,c,{disable:false},true);
          if(repair)mark(null);
          const key=await config(c);
          if(row.state==='active'&&row.ownership==='self'&&!repair){
            const existing=await subscription(c);if(existing.sub&&sameKey(existing.sub,key))return publish('ACTIVE');
            // Explicit enable/repair intent, not bootstrap: recover lost browser material.
          }
          if(['active','reserved'].includes(row.state)&&row.ownership==='self'){
            const m=await acquire(c,key);await api('recover',row,c,{subscription:m});return publish('ACTIVE');
          }
          row=await api('reserve',row,c);
          let m;
          try {m=await acquire(c,key)}
          catch(e){current(c);try{await api('release',row,c,{disable:false},true)}catch(releaseError){throw releaseError}throw e;}
          await api('activate',row,c,{subscription:m});return publish('ACTIVE');
        });
      });
    }
    function disable({disable=true}={}) {const c=context();return safe(async()=>{if(typeof disable!=='boolean')throw fault('INVALID_REQUEST');if(!nav.userActivation?.isActive)throw fault('USER_GESTURE_REQUIRED');return cleanup(c,disable);});}
    async function prepareLogout() {
      preparedOwner=owner; ++epoch; const c=context();
      try {mark('blocked')}catch{return safe(()=>fallback(c))}
      try {return await bounded(cleanup(c,false),cleanupTimeout)}
      catch {return safe(()=>fallback(c));}
    }
    function authChanged(next) {
      if(next===owner)return;
      const old=owner; owner=next; ++epoch;
      if(old && old!==preparedOwner){
        try{mark('blocked')}catch{}
        const c=context();env.setTimeout(()=>{void safe(()=>bounded(cleanup(c,false),cleanupTimeout)).then(async r=>{
          if(c.epoch!==epoch)return;
          if(r.status==='UNAVAILABLE')await safe(()=>fallback(c));
        });},0);
      }
      preparedOwner=undefined;
    }
    env.addEventListener?.('storage',event=>{if(event.key===KEY||event.key===GUARD){++epoch;publish('RECONCILIATION_REQUIRED');}});
    return Object.freeze({initialize,enable,repair:()=>enable({repair:true}),disable,prepareLogout,authChanged,getState});
  }
  const exported={create, point, material, result, metadata, KEY, GUARD, LOCK, BROWSER_LOCK};
  if(typeof module==='object'&&module.exports)module.exports=exported;
  else root.NcaPushLifecycle=Object.freeze({create});
})(typeof window==='object'?window:globalThis);
