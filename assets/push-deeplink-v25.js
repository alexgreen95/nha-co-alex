/* Durable push navigation inbox with READY/ACK handoff and bounded recovery. */
(function(root){
  'use strict';
  if(typeof document!=='object'||typeof location!=='object'||typeof history!=='object'||root.NcaPushNavigation)return;
  const TTL=300000,ACTIVE=30000,PASSIVE=15000,KEY='nca.push.navigation.v2';
  const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
  const decimal=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
  const id=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
  function normalize(raw){
    if(exact(raw,['type','category','story_id','chapter_id'])&&raw.type==='content'&&
      ['new_story','new_chapter'].includes(raw.category)&&decimal(raw.story_id)&&
      (raw.category==='new_story'?raw.chapter_id===null:decimal(raw.chapter_id)))return {...raw};
    if(exact(raw,['type','category','notification_id','story_id','chapter_id','comment_id'])&&raw.type==='personal'&&
      ['comment','reply','mention','comment_like'].includes(raw.category)&&decimal(raw.notification_id)&&
      [raw.story_id,raw.chapter_id,raw.comment_id].every(v=>v===null||decimal(v))&&(raw.comment_id||raw.story_id))return {...raw};
    return null;
  }
  const valid=r=>exact(r,['id','createdAt','intent'])&&id(r.id)&&Number.isSafeInteger(r.createdAt)&&r.createdAt>0&&
    r.createdAt<=Date.now()+5000&&Date.now()-r.createdAt<TTL&&normalize(r.intent);
  const keyOf=i=>JSON.stringify([i.type,i.category,i.notification_id||'',i.story_id||'',i.chapter_id||'',i.comment_id||'']);
  function fromUrl(){
    const q=new URLSearchParams(location.search),type=q.get('nca_push');
    if(!type||location.search.length>2048)return null;
    if(['nca_push','category','notification_id','story_id','chapter_id','comment_id','nca_push_id','nca_push_at'].some(k=>q.getAll(k).length>1))return null;
    const raw={type,category:q.get('category'),story_id:q.get('story_id'),chapter_id:q.get('chapter_id')};
    if(type==='personal'){raw.notification_id=q.get('notification_id');raw.comment_id=q.get('comment_id');}
    const intent=normalize(raw);if(!intent)return null;
    const tagged=q.has('nca_push_id')||q.has('nca_push_at');
    if(tagged){
      if(!/^[1-9][0-9]{12}$/.test(q.get('nca_push_at')||''))return null;
      const r={id:q.get('nca_push_id'),createdAt:Number(q.get('nca_push_at')),intent};
      return valid(r)?r:null;
    }
    // Backward-compatible validated URL, never an arbitrary payload URL.
    if(!root.crypto?.getRandomValues)return null;
    const bytes=root.crypto.getRandomValues(new Uint8Array(16));
    return {id:Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join(''),createdAt:Date.now(),intent};
  }
  let pending=null,seen=[],running=false,timer=null,until=0,attempts=0,status='IDLE';
  function persist(){
    try{root.sessionStorage.setItem(KEY,JSON.stringify({pending,seen}));return true;}catch{return false;}
  }
  try{
    const raw=root.sessionStorage.getItem(KEY);
    if(raw&&raw.length<=4096){
      const s=JSON.parse(raw);
      if(exact(s,['pending','seen'])){
        if(valid(s.pending))pending=s.pending;
        if(Array.isArray(s.seen))seen=s.seen.filter(r=>exact(r,['id','at'])&&id(r.id)&&Number.isSafeInteger(r.at)&&r.at>0&&r.at<=Date.now()+5000&&Date.now()-r.at<TTL).slice(-8);
      }
    }
  }catch{}
  function cleanPushQuery(record){
    const value=fromUrl();if(!value||keyOf(value.intent)!==keyOf(record.intent))return;
    const q=new URLSearchParams(location.search);
    if(q.has('nca_push_id')&&q.get('nca_push_id')!==record.id)return;
    ['nca_push','category','notification_id','story_id','chapter_id','comment_id','nca_push_id','nca_push_at'].forEach(k=>q.delete(k));
    history.replaceState(history.state,'',location.pathname+(q.size?'?'+q.toString():'')+location.hash);
  }
  function finish(record){
    if(pending!==record)return;
    seen.push({id:record.id,at:record.createdAt});seen=seen.slice(-8);pending=null;status='NAVIGATED';
    if(timer){root.clearTimeout(timer);timer=null;}persist();cleanPushQuery(record);
  }
  function schedule(delay){if(pending&&!timer)timer=root.setTimeout(()=>{timer=null;void run();},delay);}
  function wake(){
    if(!pending)return;
    if(timer){root.clearTimeout(timer);timer=null;}
    until=Math.min(Date.now()+ACTIVE,pending.createdAt+TTL);attempts=0;status='PENDING';schedule(0);
  }
  function pause(record){
    if(pending!==record)return;
    status='PAUSED';
    const remaining=record.createdAt+TTL-Date.now();
    if(remaining>0)schedule(Math.min(PASSIVE,remaining));
  }
  function enqueue(record){
    if(!valid(record))return false;
    if(seen.some(r=>r.id===record.id&&Date.now()-r.at<TTL))return persist();
    if(pending?.id===record.id)return persist();
    if(pending&&pending.createdAt>record.createdAt)return false;
    if(seen.some(r=>r.at>record.createdAt))return persist();
    pending={id:record.id,createdAt:record.createdAt,intent:normalize(record.intent)};
    const saved=persist();wake();return saved;
  }
  async function run(){
    if(!pending||running)return;
    const record=pending;
    if(!valid(record)){pending=null;status='EXPIRED';persist();cleanPushQuery(record);return;}
    if(Date.now()>=until||attempts>=30){pause(record);return;}
    running=true;attempts++;
    try{
      const i=record.intent;
      if(i.type==='personal'&&i.comment_id){
        if(typeof stories==='undefined'||!Array.isArray(stories)||!stories.length||typeof root.scopedComments?.navigate!=='function'){
          status='WAITING_FOR_DATA';return;
        }
        status='NAVIGATING';
        if(await root.scopedComments.navigate(i.comment_id))finish(record);
        else if(pending===record)status='WAITING_FOR_TARGET';
        return;
      }
      if(typeof stories==='undefined'||!Array.isArray(stories)){status='WAITING_FOR_DATA';return;}
      const story=stories.find(s=>String(s.id)===i.story_id);
      if(!story){status='WAITING_FOR_DATA';return;}
      if(i.chapter_id){
        const index=story.chapters?.findIndex(ch=>String(ch.id)===i.chapter_id)??-1;
        if(index<0||typeof read!=='function'){status='WAITING_FOR_DATA';return;}
        status='NAVIGATING';await read(story.id,index);finish(record);return;
      }
      if(typeof openStory!=='function'){status='WAITING_FOR_DATA';return;}
      status='NAVIGATING';openStory(story.id);finish(record);
    }catch{if(pending===record)status='WAITING_FOR_TARGET';}
    finally{
      running=false;
      if(pending&&pending!==record)wake();
      else if(pending&&Date.now()<until&&attempts<30)schedule(Math.min(2000,180*attempts));
      else if(pending)pause(record);
    }
  }
  const sw=root.navigator?.serviceWorker;
  const worker=w=>w&&w.scriptURL===location.origin+'/push-sw.js';
  async function ready(){
    if(!sw)return;
    try{
      const w=worker(sw.controller)?sw.controller:(await sw.getRegistration('/'))?.active;
      if(worker(w))w.postMessage({type:'nca-push-ready-v2'});
    }catch{}
  }
  if(sw){
    sw.addEventListener('message',event=>{
      if(!worker(event.source))return;
      const data=event.data;
      if(exact(data,['type'])&&data.type==='nca-push-probe-v2'){void ready();return;}
      if(exact(data,['type','id','createdAt','intent'])&&data.type==='nca-push-intent-v2'){
        if(enqueue({id:data.id,createdAt:data.createdAt,intent:data.intent})){
          try{event.source.postMessage({type:'nca-push-ack-v2',id:data.id});}catch{}
        }
      }
    });
    sw.addEventListener('controllerchange',()=>{void ready();wake();});
  }
  root.addEventListener('pageshow',()=>{void ready();wake();});
  root.addEventListener('focus',()=>{void ready();wake();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){void ready();wake();}});
  // Refresh registration without touching subscriptions, permission or lifecycle ownership.
  let lastUpdate=-Infinity;
  const update=async()=>{
    if(Date.now()-lastUpdate<60000)return;lastUpdate=Date.now();
    try{const reg=await sw?.getRegistration('/');if(reg)await reg.update();}catch{}
  };
  root.addEventListener('pageshow',()=>{void update();});
  if(document.readyState==='complete')void update();else root.addEventListener('load',()=>{void update();},{once:true});
  root.NcaPushNavigation=Object.freeze({getState:()=>status});
  const initial=fromUrl();if(initial)enqueue(initial);else if(pending)wake();
  void ready();
})(typeof window==='object'?window:globalThis);
