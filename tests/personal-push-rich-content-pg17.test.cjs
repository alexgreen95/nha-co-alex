'use strict';
const {describe,it,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync,spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {runWorker}=require('../server/personal-push-worker.cjs');
const sql=fs.readFileSync('database/migrations/20261022_personal_push_rich_content.sql','utf8');
const baseline=fs.readFileSync('tests/helpers/personal-push-sender-baseline.sql','utf8');
const fixture=fs.readFileSync('tests/helpers/personal-push-rich-fixture.sql','utf8');
const socket='/tmp/nca-pg17-guard-witness-62kuw392/socket',client='/tmp/nca-pg17-guard-witness-62kuw392/bin/psql';
const env={PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',HOME:'/nonexistent-nca-rich-test',PGPASSFILE:'/dev/null',PGSERVICEFILE:'/dev/null',PGSYSCONFDIR:'/nonexistent-nca-rich-test',PGCONNECT_TIMEOUT:'3',PGAPPNAME:'nca_rich_personal_local'};
function args(user){
 assert(path.isAbsolute(socket)&&!socket.includes(',')&&!socket.startsWith('//')&&!socket.includes('\0'));
 assert(fs.statSync(path.join(socket,'.s.PGSQL.5432')).isSocket());assert(/^[a-z_][a-z0-9_]*$/.test(user));
 const adapter=fs.readFileSync(client,'utf8');assert(adapter.includes('--host=unix:///var/run/docker.sock'));assert(adapter.includes('nca-pg17-guard-witness env -i'));
 return ['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h',socket,'-p','5432','-d','nca_guard_witness','-U',user];
}
function run(text,user='nca_guard_witness_admin',ok=true){const r=spawnSync(client,args(user),{input:text,env,encoding:'utf8',timeout:20000,maxBuffer:2e6});assert.ifError(r.error);if(ok)assert.equal(r.status,0,r.stderr);return r;}
const q=(text,user)=>JSON.parse(run(text,user).stdout.trim()),lit=s=>"'"+String(s).replaceAll("'","''")+"'";
const owner=randomUUID(),actor=randomUUID(),sid=randomUUID();let owned=false;
const claim=()=>q('SELECT public.nca_claim_personal_push_deliveries(1);','nca_push_sender').deliveries[0];
const prepare=e=>q(`SELECT public.nca_prepare_personal_push_delivery(${lit(e.delivery_id)},${lit(e.lease_token)});`,'nca_push_sender');
const finish=(e,outcome='sent')=>q(`SELECT public.nca_finish_personal_push_delivery(${lit(e.delivery_id)},${lit(e.lease_token)},${lit(outcome)});`,'nca_push_sender');
const fail=(text,code,user='postgres')=>{const r=run(text,user,false);assert.notEqual(r.status,0);assert(r.stderr.includes(code),r.stderr);};
function clear(){run('TRUNCATE public.comment_likes,public.comments,public.notifications,public.profiles,public.chapters,public.stories,public.push_preferences,public.push_subscriptions,public.push_personal_events,public.push_deliveries,auth.users CASCADE;');}
function seed(category='comment_like',{story=true,profile=true}={}){
 run(`INSERT INTO auth.users(placeholder,id) VALUES (0,${lit(owner)}),(0,${lit(actor)});
 INSERT INTO public.stories VALUES(9007199254740993,'Truyện “Ánh”');
 INSERT INTO public.chapters VALUES(2,9007199254740993);
 INSERT INTO public.comments(id,user_id,content) VALUES(3,${lit(owner)},'PRIVATE_COMMENT_NEVER_IN_PUSH');
 ${profile?`INSERT INTO public.profiles VALUES(${lit(actor)},'Thảo Nguyễn');`:''}
 INSERT INTO public.push_preferences(user_id,comment_enabled,comment_enabled_since,reply_enabled,reply_enabled_since,mention_enabled,mention_enabled_since,comment_like_enabled,comment_like_enabled_since)
 VALUES(${lit(owner)},true,clock_timestamp()-interval '1 day',true,clock_timestamp()-interval '1 day',true,clock_timestamp()-interval '1 day',true,clock_timestamp()-interval '1 day');
 INSERT INTO public.push_subscriptions(id,user_id,endpoint,p256dh,auth,device_secret_hash,binding_id,binding_version,state,activated_at)
 VALUES(${lit(sid)},${lit(owner)},'https://push.invalid/local-only','fixture-key','fixture-auth',decode(repeat('11',32),'hex'),gen_random_uuid(),1,'active',clock_timestamp()-interval '1 day');`);
 const id=q(`INSERT INTO public.notifications(user_id,actor_id,type,story_id,chapter_id,comment_id) VALUES(${lit(owner)},${lit(actor)},${lit(category)},${story?'9007199254740993':'NULL'},2,3) RETURNING id;`);
 run(`INSERT INTO public.push_personal_events(notification_id,recipient_id,category,occurred_at,expires_at) SELECT id,user_id,type,created_at,created_at+interval '1 hour' FROM public.notifications WHERE id=${id};
 INSERT INTO public.push_deliveries(id,personal_notification_id,subscription_id,captured_binding_id,captured_binding_version) SELECT gen_random_uuid(),${id},id,binding_id,binding_version FROM public.push_subscriptions;
 ${category==='comment_like'?`INSERT INTO public.comment_likes VALUES(3,${lit(actor)});`:''}`);
 return id;
}
const routineSnapshot=()=>q("SELECT json_object_agg(proname,json_build_object('oid',oid,'owner',proowner,'body',md5(prosrc),'acl',proacl::text,'config',proconfig)) FROM pg_proc WHERE proname IN ('nca_claim_personal_push_deliveries','nca_prepare_personal_push_delivery','nca_finish_personal_push_delivery');");

describe('rich personal push native PostgreSQL 17.11 LOCAL ONLY',()=>{
 before(()=>{
  const inspect=spawnSync('docker',['--host=unix:///var/run/docker.sock','inspect','--format','{{.HostConfig.NetworkMode}}','nca-pg17-guard-witness'],{env,encoding:'utf8'});assert.equal(inspect.status,0);assert.equal(inspect.stdout.trim(),'none');
  assert.deepEqual(q("SELECT json_build_object('version',current_setting('server_version_num'),'local',inet_server_addr() IS NULL,'db',current_database(),'user',current_user);"),{version:'170011',local:true,db:'nca_guard_witness',user:'nca_guard_witness_admin'});
  assert.equal(q("SELECT count(*) FROM pg_roles WHERE rolname IN ('postgres','anon','authenticated','service_role','authenticator','nca_push_sender');"),0);
  assert.equal(q("SELECT count(*) FROM pg_namespace WHERE nspname='auth';"),0);
  let grants='';for(const sig of ['nca_claim_personal_push_deliveries(integer)','nca_prepare_personal_push_delivery(uuid,uuid)','nca_finish_personal_push_delivery(uuid,uuid,text)'])grants+=`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC,anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION public.${sig} TO nca_push_sender;`;
  run('BEGIN;'+fixture+baseline+grants+'COMMIT;');owned=true;
 });
 after(()=>{if(owned){run('DROP OWNED BY nca_push_sender,postgres,anon,authenticated,service_role,authenticator CASCADE; DROP ROLE nca_push_sender,postgres,anon,authenticated,service_role,authenticator;');assert.equal(q("SELECT count(*) FROM pg_namespace WHERE nspname='auth';"),0);assert.equal(q("SELECT count(*) FROM pg_roles WHERE rolname IN ('postgres','nca_push_sender');"),0);}});
 it('baseline guard rejects metadata drift without replacing anything',()=>{run('ALTER FUNCTION public.nca_prepare_personal_push_delivery(uuid,uuid) STRICT;','postgres');try{fail(sql,'NCA_RICH_PERSONAL_PREPARE_BASELINE');}finally{run('ALTER FUNCTION public.nca_prepare_personal_push_delivery(uuid,uuid) CALLED ON NULL INPUT;','postgres');}});
 it('baseline guard rejects NULL security config rather than accepting unknown comparison',()=>{run('ALTER FUNCTION public.nca_prepare_personal_push_delivery(uuid,uuid) RESET ALL;','postgres');try{fail(sql,'NCA_RICH_PERSONAL_PREPARE_BASELINE');}finally{run("ALTER FUNCTION public.nca_prepare_personal_push_delivery(uuid,uuid) SET search_path='';ALTER FUNCTION public.nca_prepare_personal_push_delivery(uuid,uuid) SET lock_timeout='2s';ALTER FUNCTION public.nca_prepare_personal_push_delivery(uuid,uuid) SET statement_timeout='5s';",'postgres');}});
 it('schema guard fails closed when authoritative presentation column is absent',()=>{run('ALTER TABLE public.profiles RENAME display_name TO hidden_name;','postgres');try{fail(sql,'NCA_RICH_PERSONAL_METADATA_SCHEMA');}finally{run('ALTER TABLE public.profiles RENAME hidden_name TO display_name;','postgres');}});
 it('metadata identity guard rejects ambiguous actor profiles',()=>{run('ALTER TABLE public.profiles DROP CONSTRAINT profiles_pkey;','postgres');try{fail(sql,'NCA_RICH_PERSONAL_METADATA_IDENTITY');}finally{run('ALTER TABLE public.profiles ADD PRIMARY KEY(id);','postgres');}});
 it('migration preserves owner/config/ACL/OID, claim/finish and existing delivery data',()=>{
  seed();const before=routineSnapshot(),data=run("SELECT md5(json_agg(d)::text) FROM public.push_deliveries d;").stdout;run(sql,'postgres');const after=routineSnapshot();
  for(const name of ['nca_claim_personal_push_deliveries','nca_finish_personal_push_delivery'])assert.deepEqual(after[name],before[name]);
  const name='nca_prepare_personal_push_delivery';for(const key of ['oid','owner','acl','config'])assert.deepEqual(after[name][key],before[name][key]);
  assert.notEqual(after[name].body,before[name].body);assert.equal(run("SELECT md5(json_agg(d)::text) FROM public.push_deliveries d;").stdout,data);clear();
 });
 describe('fresh authority, suppression and unchanged delivery lifecycle',()=>{
  beforeEach(clear);
  for(const category of ['comment','reply','mention','comment_like'])it(category+' returns only current authoritative actor/story plus unchanged routing',()=>{
   const id=seed(category),e=claim();run("UPDATE public.profiles SET display_name='Tên Mới'; UPDATE public.stories SET title='Truyện Mới';");const r=prepare(e);assert.equal(r.status,'ready');
   assert.deepEqual(r.notification,{id:String(id),category,story_id:'9007199254740993',chapter_id:'2',comment_id:'3',actor_display_name:'Tên Mới',story_title:'Truyện Mới'});assert(!JSON.stringify(r.notification).includes('PRIVATE_COMMENT'));assert(!JSON.stringify(r.notification).includes(actor));
  });
  it('missing profile and missing notification story link return null presentation, never IDs',()=>{seed('reply',{profile:false,story:false});const r=prepare(claim());assert.equal(r.notification.actor_display_name,null);assert.equal(r.notification.story_title,null);});
  it('sender has only function EXECUTE, never direct SELECT on source/presentation/application tables',()=>{
   for(const table of ['notifications','profiles','stories','chapters','comments','comment_likes','push_preferences','push_subscriptions','push_personal_events','push_deliveries'])fail(`SELECT * FROM public.${table};`,'42501','nca_push_sender');
   for(const role of ['anon','authenticated','service_role','authenticator'])fail(`SET ROLE ${role};SELECT public.nca_prepare_personal_push_delivery('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');`,'42501','nca_guard_witness_admin');
   assert.equal(q("SELECT count(*) FROM pg_proc WHERE proname='nca_prepare_personal_push_delivery' AND prosecdef AND proconfig=ARRAY['search_path=\"\"','lock_timeout=2s','statement_timeout=5s'];"),1);
  });
  it('deleted authoritative notification suppresses transport before send',async()=>{seed('reply');const e=claim();run('DELETE FROM public.notifications;');let sends=0;const r=await runWorker({maxItems:1,db:{claim:async()=>({status:'ok',deliveries:[e]}),prepare:async()=>prepare(e)},transport:{send:async()=>{sends++;}}});assert.equal(r.suppressed,1);assert.equal(sends,0);});
  it('actual preserved unlike trigger cascades deletion and suppresses pending delivery',()=>{seed();const e=claim();run('DELETE FROM public.comment_likes;');assert.equal(q('SELECT count(*) FROM public.notifications;'),0);assert.equal(prepare(e).status,'gone');});
  for(const [name,change] of [
   ['recipient',`UPDATE public.push_personal_events SET recipient_id=${lit(actor)}`],
   ['category',"UPDATE public.notifications SET type='story_like'"],
   ['expiry',"UPDATE public.push_personal_events SET occurred_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour'"],
   ['preference',"UPDATE public.push_preferences SET comment_like_enabled=false,comment_like_enabled_since=NULL"],
   ['binding',"UPDATE public.push_subscriptions SET binding_id=gen_random_uuid()"],
   ['state',"UPDATE public.push_subscriptions SET state='disabled',user_id=NULL,endpoint=NULL,p256dh=NULL,auth=NULL,activated_at=NULL,disabled_at=clock_timestamp()"]
  ])it('prepare still cancels changed '+name+' authority',()=>{seed();const e=claim();run(change+';');assert.equal(prepare(e).status,'cancelled');});
  it('wrong/expired lease still rejects PT409; active claim is not reclaimed',()=>{seed();const e=claim();assert.equal(claim(),undefined);fail(`SELECT public.nca_prepare_personal_push_delivery(${lit(e.delivery_id)},${lit(randomUUID())});`,'PT409','nca_push_sender');run("UPDATE public.push_deliveries SET lease_until=clock_timestamp()-interval '1 second';");fail(`SELECT public.nca_prepare_personal_push_delivery(${lit(e.delivery_id)},${lit(e.lease_token)});`,'PT409','nca_push_sender');});
  it('finish transitions and terminal repeats remain unchanged after rich prepare',()=>{seed();const e=claim();assert.equal(prepare(e).status,'ready');assert.equal(finish(e,'network').status,'pending');run("UPDATE public.push_deliveries SET next_attempt_at=clock_timestamp()-interval '1 second';");const next=claim();assert.notEqual(next.lease_token,e.lease_token);assert.equal(finish(next).status,'sent');assert.equal(finish(next).status,'already_terminal');});
  it('in-flight unlike wins before notification SHARE lock, with no stale rich send',async()=>{
   seed();const e=claim();let ready,resolveReady,rejectReady;ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});
   const child=spawn(client,args('nca_guard_witness_admin'),{env,stdio:['pipe','pipe','pipe']});let output='',errors='';child.stdout.on('data',b=>{output+=b;if(output.includes('BARRIER_READY'))resolveReady();});child.stderr.on('data',b=>errors+=b);
   const timer=setTimeout(()=>{rejectReady(Error('LOCAL_BARRIER_TIMEOUT'));child.kill();},5000);
   const done=new Promise((resolve,reject)=>{child.on('error',error=>{rejectReady(error);reject(error);});child.on('close',code=>{clearTimeout(timer);if(code){const error=Error(errors);rejectReady(error);reject(error);}else resolve();});});done.catch(()=>{});
   child.stdin.end("BEGIN; DELETE FROM public.comment_likes; SELECT 'BARRIER_READY'; SELECT pg_sleep(0.25); COMMIT;");
   try{await ready;assert.equal(prepare(e).status,'gone');}finally{await done;}
  });
 });
});
