'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/push-deeplink-v25.js'),'utf8');
function fixture(query=''){
  const events=new Map(),swEvents=new Map(),timers=new Map(),storage=new Map(),messages=[],reads=[],comments=[];
  let clock=Date.now(),serial=0;
  class Clock extends Date{static now(){return clock;}}
  const location=new URL('https://nha-co-alex.vercel.app/'+query);
  const worker={scriptURL:location.origin+'/push-sw.js',postMessage:m=>messages.push(m)};
  const c={URL,URLSearchParams,Date:Clock,stories:[],crypto:{getRandomValues:a=>a.fill(4)},document:{readyState:'complete',visibilityState:'visible',addEventListener(){},documentElement:{classList:{remove(){}}}},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},location,
    history:{state:null,replaceState(state,unused,url){c.location=new URL(url,c.location.origin);}},
    navigator:{serviceWorker:{controller:worker,getRegistration:async()=>({active:worker,update:async()=>{}}),addEventListener:(name,fn)=>swEvents.set(name,fn)}},
    addEventListener:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},
    setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    read:async(...args)=>reads.push(args),openStory:id=>reads.push([id]),scopedComments:{navigate:async id=>{comments.push(id);return true;}}};
  c.window=c;vm.createContext(c);vm.runInContext(source,c);
  return {c,timers,storage,messages,reads,comments,worker,
    ready(){c.stories=[{id:1,chapters:[{id:2}]}];},
    emit(name){for(const fn of events.get(name)||[])fn();},
    message(data,from=worker){swEvents.get('message')({source:from,data});},
    async tick(delay){const entry=[...timers].find(([,t])=>t.delay===delay);assert(entry,'expected timer '+delay);timers.delete(entry[0]);entry[1].fn();await new Promise(setImmediate);},
    now:()=>clock,advance:ms=>clock+=ms};
}
const intent={type:'content',category:'new_chapter',story_id:'1',chapter_id:'2'};
test('metadata readiness replaces the pending retry with an immediate attempt',async()=>{
  const f=fixture('?nca_push=content&category=new_chapter&story_id=1&chapter_id=2');
  await f.tick(0);assert.equal(f.c.NcaPushNavigation.getState(),'WAITING_FOR_DATA');assert([...f.timers.values()].some(t=>t.delay===180));
  f.ready();f.emit('nca-public-metadata-ready');assert(![...f.timers.values()].some(t=>t.delay===180));
  await f.tick(0);assert.equal(f.reads.length,1);assert.equal(f.c.NcaPushNavigation.getState(),'NAVIGATED');
});
test('warm READY/ACK inbox persists once and duplicate handoffs do not navigate twice',async()=>{
  const f=fixture(),record={type:'nca-push-intent-v2',id:'ab'.repeat(16),createdAt:f.now(),intent};
  f.message(record);assert(f.storage.get('nca.push.navigation.v2'));assert.equal(f.messages.filter(m=>m.type==='nca-push-ack-v2').length,1);
  await f.tick(0);f.ready();f.emit('nca-public-metadata-ready');await f.tick(0);f.message(record);
  assert.equal(f.reads.length,1);assert.equal(f.c.NcaPushNavigation.getState(),'NAVIGATED');
});
test('personal comment handoff uses its validated comment target after metadata readiness',async()=>{
  const f=fixture();f.message({type:'nca-push-intent-v2',id:'cd'.repeat(16),createdAt:f.now(),intent:{type:'personal',category:'reply',notification_id:'3',story_id:null,chapter_id:null,comment_id:'4'}});
  await f.tick(0);f.ready();f.emit('nca-public-metadata-ready');await f.tick(0);assert.deepEqual(f.comments,['4']);assert.equal(f.reads.length,0);
});
test('metadata wake cannot bypass source, payload or expiration checks',async()=>{
  const f=fixture(),record={type:'nca-push-intent-v2',id:'ab'.repeat(16),createdAt:f.now(),intent};
  f.message(record,{scriptURL:'https://attacker.invalid/push-sw.js'});
  f.message({...record,intent:{...intent,url:'https://attacker.invalid'}});
  f.message({...record,createdAt:f.now()-300001});f.ready();f.emit('nca-public-metadata-ready');
  assert.equal(f.reads.length,0);assert.equal(f.timers.size,0);assert.equal(f.messages.filter(m=>m.type==='nca-push-ack-v2').length,0);
});
test('TTL remains authoritative when valid pending work expires before metadata arrives',async()=>{
  const f=fixture('?nca_push=content&category=new_chapter&story_id=1&chapter_id=2');
  await f.tick(0);f.advance(300001);f.ready();f.emit('nca-public-metadata-ready');await f.tick(0);
  assert.equal(f.c.NcaPushNavigation.getState(),'EXPIRED');assert.equal(f.reads.length,0);
});
test('a readiness signal during an active navigation cannot start a second read',async()=>{
  const f=fixture('?nca_push=content&category=new_chapter&story_id=1&chapter_id=2');let release;
  f.ready();f.c.read=(...args)=>{f.reads.push(args);return new Promise(r=>release=r);};
  await f.tick(0);assert.equal(f.c.NcaPushNavigation.getState(),'NAVIGATING');
  f.emit('nca-public-metadata-ready');await f.tick(0);assert.equal(f.reads.length,1);
  release();await new Promise(setImmediate);assert.equal(f.c.NcaPushNavigation.getState(),'NAVIGATED');
});
