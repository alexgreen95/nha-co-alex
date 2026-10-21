'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {createHandler}=require('../api/push-config');
const {M,response,guardNetwork}=require('./helpers/push-api-fixture.cjs');
const {payloadFor}=require('../server/personal-push-worker.cjs');
guardNetwork(test);
const origin='https://nha-co-alex.vercel.app',pub=M.keys.p256dh;
function config(key,method='GET') {const reads=[];const env=new Proxy({NCA_PUSH_VAPID_PUBLIC_KEY:key},{get(o,k){reads.push(k);assert.equal(k,'NCA_PUSH_VAPID_PUBLIC_KEY');return o[k]}});const res=response();createHandler(env)({method},res);return {res,reads};}
test('public config exposes only validated public key, never reads any other env',()=>{const {res,reads}=config(pub);assert.equal(res.code,200);assert.deepEqual(res.body,{ok:true,vapid_public_key:pub});assert.deepEqual(reads,['NCA_PUSH_VAPID_PUBLIC_KEY']);assert.equal(res.headers['cache-control'],'no-store');assert.equal(res.headers['x-content-type-options'],'nosniff');assert(!JSON.stringify(res).includes('PRIVATE'));});
for(const method of ['POST','PUT','HEAD','OPTIONS'])test('public config wrong method '+method,()=>{const {res,reads}=config(pub,method);assert.equal(res.code,405);assert.equal(res.headers.allow,'GET');assert.deepEqual(reads,[]);});
for(const value of [undefined,null,'',pub+'=',pub+'\n',pub.slice(0,86)+'B','A'.repeat(87),'private key junk'])test('public config rejects missing/malformed/noncanonical/non-curve key '+String(value).length,()=>{const {res}=config(value);assert.equal(res.code,503);assert.deepEqual(res.body,{ok:false,error:{code:'UNAVAILABLE'}});});
const payload=()=>payloadFor({id:'9223372036854775807',category:'mention',story_id:'1',chapter_id:null,comment_id:'9007199254740993'});
function sw(options={}){
 const listeners={},shown=[],opened=[],focused=[];let close=0;
 const self={location:{origin},registration:{showNotification:async(title,opts)=>{shown.push({title,...opts});if(options.showError)throw Error('OS denied')}},clients:{matchAll:async()=>options.windows||[],openWindow:async url=>opened.push(url)},addEventListener:(type,fn)=>listeners[type]=fn};
 vm.runInNewContext(fs.readFileSync('push-sw.js','utf8'),{self,URL});
 async function push(value,{raw}={}){let work;listeners.push({data:raw===null?null:{text:()=>raw===undefined?JSON.stringify(value):raw,json:()=>{if(raw!==undefined)return JSON.parse(raw);return value}},waitUntil:p=>work=p});await work;}
 async function click(){let work;listeners.notificationclick({notification:{data:{url:'https://attacker.invalid/'},close:()=>close++},waitUntil:p=>work=p});await work;}
 return {shown,opened,focused,push,click,get close(){return close},listeners};
}
test('SW accepts exact frozen sender personal payload and stores only safe click metadata',async()=>{const s=sw();await s.push(payload());assert.equal(s.shown.length,1);assert.equal(s.shown[0].title,'Nhà có Alex');assert.equal(s.shown[0].tag,'nca-notification-9223372036854775807');assert.deepEqual(Object.keys(s.shown[0].data),['notification_id']);});
for(const raw of ['{', 'null','[]','"hello"','x'.repeat(4097),null])test('SW malformed/missing/oversized payload safely ignored '+String(raw).length,async()=>{const s=sw();await s.push(null,{raw});assert.equal(s.shown.length,0);});
const bad=[p=>p.version=2,p=>p.type='broadcast',p=>p.title='x'.repeat(101),p=>p.body='x'.repeat(241),p=>p.tag='x'.repeat(81),p=>p.title='',p=>p.body='x\n',p=>p.tag='different',p=>p.url='https://attacker.invalid',p=>p.data.url='https://attacker.invalid',p=>p.data.notification_id='01',p=>p.data.story_id=1,p=>p.data.category='unexpected',p=>p.data=null,p=>p.data.comment_id='9223372036854775808',p=>p.title={}];
for(let i=0;i<bad.length;i++)test('SW invalid bounded field/schema '+i,async()=>{const p=payload();bad[i](p);const s=sw();await s.push(p);assert.equal(s.shown.length,0);});
test('SW OS notification failure settles without uncaught error',async()=>{const s=sw({showError:true});await s.push(payload());});
test('click focuses only same-origin client, ignores payload/external clients',async()=>{let external=0,focused=0;const s=sw({windows:[{url:'https://attacker.invalid',focus:()=>external++},{url:origin+'/truyen/example',focus:()=>focused++}]});await s.click();assert.equal(external,0);assert.equal(focused,1);assert.equal(s.opened.length,0);assert.equal(s.close,1);});
test('click opens only same-origin root with no suitable client',async()=>{const s=sw({windows:[{url:'https://attacker.invalid',focus:()=>assert.fail()}]});await s.click();assert.deepEqual(s.opened,[origin+'/']);});
test('click recovers from a client focus error without external navigation',async()=>{const s=sw({windows:[{url:origin+'/',focus:()=>{throw Error('closed')}}]});await s.click();assert.deepEqual(s.opened,[origin+'/']);});
test('service worker has no background fetch/RPC or fetch/cache interceptor',()=>{const s=sw();assert.deepEqual(Object.keys(s.listeners),['push','notificationclick']);const text=fs.readFileSync('push-sw.js','utf8');assert(!/\bfetch\s*\(|\.rpc\s*\(|indexedDB|localStorage|caches\./.test(text));});
