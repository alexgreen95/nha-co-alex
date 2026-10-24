'use strict';
const {describe,it,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const https=require('node:https'),net=require('node:net');
const originalRequest=https.request,originalConnect=net.connect;let accidental=0;
before(()=>{https.request=()=>{accidental++;throw Error('REAL_NETWORK_FORBIDDEN');};net.connect=()=>{accidental++;throw Error('REAL_NETWORK_FORBIDDEN');};});
after(()=>{https.request=originalRequest;net.connect=originalConnect;assert.equal(accidental,0);});
const {payloadFor,runWorker}=require('../server/content-push-worker.cjs');
const {databaseConfig,createDatabase}=require('../server/content-push-db.cjs');
const {createHandler}=require('../api/content-push-worker.js');
const testCA=require('./helpers/personal-push-test-ca.cjs');
const key=require('node:crypto').createECDH('prime256v1');key.generateKeys();
const env={NCA_CONTENT_PUSH_WORKER_ENABLED:'true',NCA_PUSH_WORKER_SECRET:'t'.repeat(48),NCA_PUSH_SENDER_CA_CERT_B64:testCA.base64,
 NCA_PUSH_SENDER_DATABASE_URL:'postgresql://nca_push_sender.cwwulyrutdvuekydydew:test-only@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
 NCA_PUSH_VAPID_PUBLIC_KEY:key.getPublicKey().toString('base64url'),NCA_PUSH_VAPID_PRIVATE_KEY:key.getPrivateKey().toString('base64url'),NCA_PUSH_VAPID_SUBJECT:'mailto:push@example.invalid'};
const story={event_id:'9007199254740993',publication_id:'9223372036854775807',category:'new_story',story_id:'9007199254740994',chapter_id:null,story_title:'Truyện “Ánh”',chapter_title:null};
const chapter={...story,category:'new_chapter',chapter_id:'2',chapter_title:'Chương “Mới”'};
const item={delivery_id:'00000000-0000-4000-8000-000000000001',lease_token:'00000000-0000-4000-8000-000000000002'};
function ready(content=story){return {status:'ready',content,lease_remaining_ms:85000,event_remaining_seconds:600,subscription:{endpoint:'https://push.invalid/fixture',keys:{p256dh:'fixture-key',auth:'fixture-auth'}}};}
function mockDB(overrides={}){let c=0;const calls=[];return {calls,claim:async n=>{calls.push(['claim',n]);return {status:'ok',deliveries:c++===0?[item]:[]};},prepare:async(...a)=>{calls.push(['prepare',...a]);return ready();},finish:async(...a)=>{calls.push(['finish',...a]);return {status:a[2]==='sent'?'sent':a[2].includes('subscription')?'failed':'pending'};},close:async()=>{calls.push(['close']);},...overrides};}
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;}};}
function sw(){const handlers={},shown=[],opened=[],focused=[];const self={location:{origin:'https://local.invalid'},registration:{showNotification:async(title,options)=>shown.push({title,options})},addEventListener:(k,f)=>handlers[k]=f,clients:{matchAll:async()=>[{url:'https://local.invalid/',focus:async()=>focused.push(true)}],openWindow:async u=>opened.push(u)}};vm.runInNewContext(fs.readFileSync('push-sw.js','utf8'),{self,URL});return {shown,opened,focused,async push(p){let done;handlers.push({data:{text:()=>JSON.stringify(p),json:()=>p},waitUntil:x=>done=x});await done;},async click(){let done;handlers.notificationclick({notification:{data:{url:'https://evil.invalid'},close(){}},waitUntil:x=>done=x});await done;}};}
describe('content copy and strict service worker lane',()=>{
 for(const [label,n,body] of [
  ['new story',story,'Alex đã đăng truyện mới “Truyện “Ánh””.'],
  ['new chapter',chapter,'Alex đã đăng chương “Chương “Mới”” cho truyện “Truyện “Ánh””.'],
  ['story fallback',{...story,story_title:null},'Alex đã đăng truyện mới.'],
  ['chapter missing',{...chapter,chapter_title:null},'Alex đã đăng chương mới cho truyện “Truyện “Ánh””.'],
  ['both missing',{...chapter,story_title:null,chapter_title:null},'Alex đã đăng chương mới.'],
  ['only chapter available',{...chapter,story_title:null},'Alex đã đăng chương mới.']])it(label+' exact text, title, routing, stable grouping and no private fields',async()=>{
   const p=payloadFor({...n,content:'PRIVATE_CONTENT',url:'https://evil.invalid'});assert.equal(p.title,'Alex hiện lên và nói');assert.equal(p.body,body);assert.equal(p.tag,'nca-content-'+n.event_id);
   assert.deepEqual(p.data,{content_event_id:n.event_id,publication_id:n.publication_id,category:n.category,story_id:n.story_id,chapter_id:n.chapter_id});assert(!JSON.stringify(p).includes('PRIVATE_CONTENT'));assert(!JSON.stringify(p).includes('evil.invalid'));
   const s=sw();await s.push(p);assert.equal(s.shown.length,1);assert.equal(s.shown[0].title,p.title);assert.equal(s.shown[0].options.body,body);await s.click();assert.deepEqual(s.opened,[]);assert.equal(s.focused.length,1);
 });
 it('Vietnamese, apostrophes, quotes and emoji stay plain JSON text with safe normalization',()=>{
  const p=payloadFor({...chapter,story_title:' \tÁnh\n O\'Neil 🐈\0 ',chapter_title:'Tha\u0309o \u202e “Đêm”'});assert.equal(p.body,'Alex đã đăng chương “Thảo “Đêm”” cho truyện “Ánh O\'Neil 🐈”.');assert.equal(JSON.parse(JSON.stringify(p)).body,p.body);
 });
 it('grapheme-aware bounds fit unchanged 240 UTF-16 body and 4096 byte message limits',async()=>{
  for(const n of [story,chapter])for(const text of ['ế'.repeat(900),'👨‍👩‍👧‍👦'.repeat(100),'x'+'\u0301'.repeat(900)]){
   const p=payloadFor({...n,story_title:text,chapter_title:text});assert(p.body.length<=240);assert(p.body.isWellFormed());assert(Buffer.byteLength(JSON.stringify(p))<4096);const s=sw();await s.push(p);assert.equal(s.shown.length,1);
  }
 });
 it('missing/malformed optional titles use conservative fallbacks, never URLs or IDs',()=>{
  for(const story_title of [null,undefined,{},123,'', '\ud800','x'.repeat(8193),'https://evil.invalid','www.evil.invalid'])assert.equal(payloadFor({...story,story_title}).body,'Alex đã đăng truyện mới.');
 });
 it('malformed core shape and personal categories fail closed',()=>{
  for(const n of [null,[],{...story,event_id:1},{...story,story_id:'01'},{...story,publication_id:'9223372036854775808'},{...story,category:'comment'},{...story,chapter_id:'2'},{...chapter,chapter_id:null}])assert.throws(()=>payloadFor(n),/INVALID_CONTENT_SHAPE/);
 });
 it('SW strictly rejects forged content schemas, arbitrary URL fields and lane/tag swaps',async()=>{
  const mutations=[p=>p.data.url='https://evil.invalid',p=>p.url='https://evil.invalid',p=>p.data.category='comment',p=>p.type='personal',p=>p.tag='nca-notification-1',p=>p.data.story_id=1,p=>p.data.chapter_id=null,p=>p.data.publication_id='01',p=>p.body='x'.repeat(241),p=>p.body='x\n',p=>p.data.extra=true];
  for(const mutate of mutations){const p=payloadFor(chapter);mutate(p);const s=sw();await s.push(p);assert.equal(s.shown.length,0);}
 });
});
describe('bounded content worker, no blind retries',()=>{
 for(const [outcome,counter] of [['sent','sent'],['transient','deferred'],['network','deferred'],['invalid_subscription','failed'],['malformed_subscription','failed']])it(outcome+' has one send and one matching finalize',async()=>{
  const db=mockDB();let sends=0;const r=await runWorker({db,transport:{send:async(sub,payload,ttl)=>{sends++;assert.equal(payload.type,'content');assert.equal(ttl,600);return outcome;}}});
  assert.equal(sends,1);assert.equal(r[counter],1);assert.equal(r.errors,0);assert.deepEqual(db.calls.filter(x=>x[0]==='finish'),[['finish',item.delivery_id,item.lease_token,outcome]]);
 });
 for(const status of ['gone','cancelled'])it(status+' suppresses before network/finalize',async()=>{const db=mockDB({prepare:async()=>({status})});let sends=0;const r=await runWorker({db,transport:{send:async()=>{sends++;}}});assert.equal(r.suppressed,1);assert.equal(sends,0);assert.equal(db.calls.filter(x=>x[0]==='finish').length,0);});
 for(const phase of ['claim','prepare','finish'])it(phase+' failure stops with one error and no DB replay',async()=>{
  const db=mockDB(),original=db[phase];let failures=0,sends=0;db[phase]=async(...a)=>{failures++;await original(...a);throw Error('PRIVATE_DATABASE_DETAIL');};
  const r=await runWorker({db,transport:{send:async()=>{sends++;return 'sent';}}});assert.equal(r.errors,1);assert.equal(failures,1);assert.equal(sends,phase==='finish'?1:0);assert(!JSON.stringify(r).includes('PRIVATE'));
 });
 it('transport exception becomes one network outcome, never immediate resend',async()=>{const db=mockDB();let sends=0;const r=await runWorker({db,transport:{send:async()=>{sends++;throw Error('PRIVATE_ENDPOINT');}}});assert.equal(r.deferred,1);assert.equal(sends,1);assert.equal(db.calls.filter(x=>x[0]==='finish').length,1);});
 it('stale/short prepare never sends and uses bounded pending outcome',async()=>{for(const options of [{lease_remaining_ms:14999},{event_remaining_seconds:0}]){const db=mockDB({prepare:async()=>({...ready(),...options})});let sends=0;const r=await runWorker({db,transport:{send:async()=>{sends++;}}});assert.equal(sends,0);assert.equal(r.deferred,1);}});
 it('maxItems/budget and malformed responses remain fail closed',async()=>{
  for(const maxItems of [0,6,Infinity])await assert.rejects(runWorker({maxItems}),/INVALID_WORKER_BOUND/);
  const db=mockDB({claim:async()=>({status:'ok',deliveries:[item,item]})});assert.equal((await runWorker({db,transport:{send:async()=>assert.fail()}})).errors,1);
  let sends=0;const r=await runWorker({maxItems:2,db:mockDB({claim:async()=>({status:'ok',deliveries:[item]})}),transport:{send:async()=>{sends++;return 'sent';}}});assert.equal(sends,2);assert.equal(r.sent,2);
 });
});
describe('content API authority and pinned sender adapter',()=>{
 it('disabled, wrong method, missing/wrong auth, invalid secret or supplied body never creates DB/transport',async()=>{
  let constructions=0;const factory=()=>{constructions++;throw Error();};
  for(const [e,req,code] of [[{}, {method:'POST',headers:{}},503],[env,{method:'GET',headers:{}},405],[env,{method:'POST',headers:{}},401],[env,{method:'POST',headers:{authorization:'Bearer wrong'}},401],[{...env,NCA_PUSH_WORKER_SECRET:'bad'},{method:'POST',headers:{}},503],[{...env,NCA_CONTENT_PUSH_WORKER_ENABLED:'false',NCA_PERSONAL_PUSH_WORKER_ENABLED:'true'},{method:'POST',headers:{}},401],[{...env,NCA_CONTENT_PUSH_WORKER_ENABLED:'false'},{method:'POST',headers:{authorization:'Bearer '+env.NCA_PUSH_WORKER_SECRET}},503],[env,{method:'POST',headers:{authorization:'Bearer '+env.NCA_PUSH_WORKER_SECRET},body:{limit:100}},400]]){
   const res=response();await createHandler({env:e,database:factory,transport:factory})(req,res);assert.equal(res.code,code);
  }assert.equal(constructions,0);
 });
 it('authenticated path returns aggregates only and closes DB; exceptions never reveal source details',async()=>{
  let closed=false;const db=mockDB({close:async()=>closed=true}),res=response();await createHandler({env,database:()=>db,transport:()=>({send:async()=> 'sent'})})({method:'POST',headers:{authorization:'Bearer '+env.NCA_PUSH_WORKER_SECRET},body:{}},res);
  assert.equal(res.code,200);assert.equal(res.body.result.sent,1);assert.equal(closed,true);assert.equal(res.headers['Cache-Control'],'no-store');assert(!JSON.stringify(res.body).includes(story.event_id));
  const failed=response();await createHandler({env,database:()=>{throw Error('PRIVATE_PASSWORD');},transport:()=>({})})({method:'POST',headers:{authorization:'Bearer '+env.NCA_PUSH_WORKER_SECRET}},failed);assert.equal(failed.code,503);assert.deepEqual(failed.body,{ok:false});
 });
 it('reuses the exact closed sender URL, username, startup and pinned verified TLS config',()=>{
  assert.equal(databaseConfig,require('../server/personal-push-db.cjs').databaseConfig);const config=databaseConfig(env);assert.equal(config.ssl.rejectUnauthorized,true);assert.ok(config.ssl.ca===testCA.pem);assert.equal(config.user,'nca_push_sender.cwwulyrutdvuekydydew');
  for(const uri of [env.NCA_PUSH_SENDER_DATABASE_URL.replace(':5432/',':6543/'),env.NCA_PUSH_SENDER_DATABASE_URL.replace('nca_push_sender.','postgres.'),env.NCA_PUSH_SENDER_DATABASE_URL+'?sslmode=disable'])assert.throws(()=>databaseConfig({...env,NCA_PUSH_SENDER_DATABASE_URL:uri}));
 });
 it('adapter verifies identity and awaited session settings, calls only content RPCs, destroys failed clients without retry',async()=>{
  for(const failure of ['', 'identity','settings','rpc']){
   const calls=[];let released;
   class Pool{on(){}async end(){}async connect(){return {async query(sql,args){calls.push([sql,args]);if(sql.startsWith('SELECT current_user'))return {rows:[{current_user:failure==='identity'?'postgres':'nca_push_sender',session_user:'nca_push_sender'}]};if(sql.startsWith('SET '))return {};if(sql.startsWith('SELECT pg_catalog.current_setting'))return {rows:[{statement_timeout:'5s',search_path:'pg_catalog',read_only:'off',application_name:failure==='settings'?'wrong':'nca_content_push_sender'}]};if(failure==='rpc')throw Error('PRIVATE');return {rows:[{result:{status:'ok'}}]};},release(destroy){released=destroy;}};}}
   const db=createDatabase(databaseConfig(env),Pool);
   if(failure){await assert.rejects(db.claim(1));assert.equal(released,true);assert.equal(calls.filter(x=>x[0].includes('nca_claim_content_push_deliveries')).length,failure==='rpc'?1:0);}
   else{await db.claim(1);await db.prepare(item.delivery_id,item.lease_token);await db.finish(item.delivery_id,item.lease_token,'sent');assert.equal(released,false);for(const rpc of ['nca_claim_content_push_deliveries','nca_prepare_content_push_delivery','nca_finish_content_push_delivery'])assert(calls.some(x=>x[0].startsWith('SELECT public.'+rpc+'(')));assert(!calls.some(x=>x[0].includes('personal_push_deliveries')));}
  }
 });
});
