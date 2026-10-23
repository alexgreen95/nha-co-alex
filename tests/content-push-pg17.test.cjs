'use strict';
const {describe,it,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {localPG}=require('./helpers/content-push-local-pg.cjs');
const sql=fs.readFileSync('database/migrations/20261022_content_push_delivery.sql','utf8');
const rich=fs.readFileSync('database/migrations/20261022_personal_push_rich_content.sql','utf8');
const bridge=fs.readFileSync('database/migrations/20261023_content_push_fanout_runtime_bridge.sql','utf8');
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
let db,owned=false,installed=false;
const sender=(name,args)=>db.q(`SELECT public.${name}(${args});`,'nca_push_sender');
const fan=(name,args)=>db.q(`SET ROLE nca_push_fanout;SELECT public.${name}(${args});`);
const event=()=>fan('nca_claim_content_push_events','1').events[0];
const page=(e,limit=100)=>fan('nca_fanout_content_push_event_page',`${lit(e.event_id)},${lit(e.lease_token)},${limit}`);
const claim=()=>sender('nca_claim_content_push_deliveries','1').deliveries[0];
const prepare=d=>sender('nca_prepare_content_push_delivery',`${lit(d.delivery_id)},${lit(d.lease_token)}`);
const finish=(d,outcome='sent')=>sender('nca_finish_content_push_delivery',`${lit(d.delivery_id)},${lit(d.lease_token)},${lit(outcome)}`);
const count=t=>db.q(`SELECT count(*) FROM public.${t};`);
function fail(text,code,user='postgres'){const r=db.run(text,user,false);assert.notEqual(r.status,0);assert.ok(r.stderr.includes(code),r.stderr);}
function clear(){db.run('TRUNCATE public.stories,public.chapters,public.notifications,public.comments,public.comment_likes,public.profiles,public.push_preferences,public.push_subscriptions,public.content_publication_state,public.content_publications,public.content_publication_clock,public.push_content_events,public.push_deliveries,public.push_personal_events,auth.users CASCADE;INSERT INTO public.content_publication_clock VALUES(1,0);');}
function audience({enabled=true,since="clock_timestamp()-interval '1 day'",activated="clock_timestamp()-interval '1 day'",state='active',id=randomUUID()}={}){
 const user=randomUUID();
 db.run(`INSERT INTO auth.users(placeholder,id) VALUES(0,${lit(user)});
 INSERT INTO public.push_preferences(user_id,new_story_enabled,new_story_enabled_since,new_chapter_enabled,new_chapter_enabled_since)
 VALUES(${lit(user)},${enabled},${enabled?since:'NULL'},${enabled},${enabled?since:'NULL'});
 INSERT INTO public.push_subscriptions(id,user_id,endpoint,p256dh,auth,device_secret_hash,binding_id,binding_version,state,activated_at)
 VALUES(${lit(id)},${lit(user)},${state==='active'?`${lit('https://push.invalid/fixture/'+id)},'fixture-key','fixture-auth'`:'NULL,NULL,NULL'},decode(repeat('11',32),'hex'),gen_random_uuid(),1,${lit(state)},${state==='active'?activated:'NULL'});`);
 return {user,id};
}
function story(published=true,id=9007199254740993n){db.run(`INSERT INTO public.stories(id,title,published) VALUES(${id},'Truyện “Ánh”',${published});`);return String(id);}
function chapter(published=true){const id=story(false);db.run(`
 -- Synthetic established parent: no new-story announcement in this chapter case.
 UPDATE public.content_publication_state SET first_publication_recorded=true WHERE story_id=${id};
 UPDATE public.stories SET published=true WHERE id=${id};
 INSERT INTO public.chapters(id,story_id,chapter_number,title,published) VALUES(2,${id},1,'Chương “Mới”',${published});`);}
function queued(kind='new_story'){audience();if(kind==='new_story')story();else chapter();const e=event();assert.equal(page(e).inserted,1);return claim();}
const personalSnapshot=()=>db.q("SELECT jsonb_object_agg(proname,jsonb_build_object('oid',oid,'owner',proowner,'source',md5(prosrc),'acl',proacl::text,'config',proconfig)) FROM pg_proc WHERE proname IN ('nca_claim_personal_push_deliveries','nca_prepare_personal_push_delivery','nca_finish_personal_push_delivery');");

describe('content push PG17.11 isolated local foundation',()=>{
 before(()=>{db=localPG();db.bootstrap();owned=true;db.run(rich,'postgres');});
 after(()=>{if(owned)db.cleanup();});
 it('fails before installation if a critical CHECK is missing',()=>{
  db.run('ALTER TABLE public.push_deliveries DROP CONSTRAINT push_deliveries_check;','postgres');
  try{fail(sql,'NCA_CONTENT_FOUNDATION_checks');}finally{db.run('ALTER TABLE public.push_deliveries ADD CONSTRAINT push_deliveries_check CHECK((personal_notification_id IS NOT NULL)::integer+(content_event_id IS NOT NULL)::integer=1);','postgres');}
 });
 it('rejects unsafe columns, missing unique index and unexpected application triggers',()=>{
  db.run('ALTER TABLE public.stories ALTER COLUMN title DROP NOT NULL;','postgres');
  try{fail(sql,'NCA_CONTENT_FOUNDATION_columns');}finally{db.run('ALTER TABLE public.stories ALTER COLUMN title SET NOT NULL;','postgres');}
  db.run('DROP INDEX public.content_publication_state_story_key;','postgres');
  try{fail(sql,'NCA_CONTENT_FOUNDATION_indexes');}finally{db.run("CREATE UNIQUE INDEX content_publication_state_story_key ON public.content_publication_state(story_id) WHERE kind='new_story';",'postgres');}
  db.run("CREATE FUNCTION public.fixture_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;CREATE TRIGGER fixture_trigger AFTER UPDATE ON public.stories FOR EACH ROW EXECUTE FUNCTION public.fixture_trigger();",'postgres');
  try{fail(sql,'NCA_CONTENT_UNSUPPORTED_TOPOLOGY');}finally{db.run('DROP TRIGGER fixture_trigger ON public.stories;DROP FUNCTION public.fixture_trigger();','postgres');}
 });
 it('rejects sender table authority and incoming browser membership without changing either grant',()=>{
  db.run('GRANT SELECT ON public.stories TO nca_push_sender;','postgres');
  try{fail(sql,'NCA_CONTENT_ROLE_AUTHORITY');assert.equal(db.q("SELECT has_table_privilege('nca_push_sender','public.stories','SELECT');"),true);}finally{db.run('REVOKE SELECT ON public.stories FROM nca_push_sender;','postgres');}
  db.run('GRANT nca_push_sender TO authenticated WITH INHERIT TRUE, SET TRUE;','postgres');
  try{fail(sql,'NCA_CONTENT_ROLE_AUTHORITY');assert.equal(db.q("SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member WHERE r.rolname='nca_push_sender' AND u.rolname='authenticated';"),1);}finally{db.run('REVOKE nca_push_sender FROM authenticated;','postgres');}
 });
 it('rejects a reversed foreign key even when JSON tuple elements could match unordered containment',()=>{
  db.run('ALTER TABLE public.content_publication_state DROP CONSTRAINT content_publication_state_story_id_fkey;ALTER TABLE public.content_publication_state ADD CONSTRAINT fixture_story_unique UNIQUE(story_id);ALTER TABLE public.stories ADD CONSTRAINT fixture_reverse_fk FOREIGN KEY(id) REFERENCES public.content_publication_state(story_id);','postgres');
  try{fail(sql,'NCA_CONTENT_FOUNDATION_keys');}finally{db.run('ALTER TABLE public.stories DROP CONSTRAINT fixture_reverse_fk;ALTER TABLE public.content_publication_state DROP CONSTRAINT fixture_story_unique;ALTER TABLE public.content_publication_state ADD CONSTRAINT content_publication_state_story_id_fkey FOREIGN KEY(story_id) REFERENCES public.stories(id) ON DELETE CASCADE;','postgres');}
 });
 it('accepts BY DEFAULT identity only for story/chapter IDs and rejects unrelated identity state',()=>{
  db.run('ALTER TABLE public.stories ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;ALTER TABLE public.chapters ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;','postgres');
  try{fail(sql,'NCA_CONTENT_FOUNDATION_columns');}
  finally{db.run('ALTER TABLE public.stories ALTER COLUMN id DROP IDENTITY;ALTER TABLE public.chapters ALTER COLUMN id DROP IDENTITY;','postgres');}
 });
 it('installs without backfill, preserves old rows and all personal routine identities/bodies/ACLs',()=>{
  db.run('ALTER TABLE public.stories ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;ALTER TABLE public.chapters ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;','postgres');
  story(true,1n);story(false,2n);const old=personalSnapshot();db.run(sql,'postgres');installed=true;assert.deepEqual(personalSnapshot(),old);
  assert.equal(db.q("SELECT count(*)=2 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.oid IN ('public.stories'::regclass,'public.chapters'::regclass) AND a.attname='id' AND a.attidentity='d';"),true);
  assert.equal(count('content_publications'),0);assert.equal(count('push_content_events'),0);assert.equal(count('content_publication_state'),0);assert.equal(count('notifications'),0);assert.equal(count('stories'),2);
  db.run("UPDATE public.stories SET title='historical edit' WHERE id=1;UPDATE public.stories SET published=false WHERE id=1;UPDATE public.stories SET published=true WHERE id=1;UPDATE public.stories SET published=true WHERE id=2;");
  assert.equal(count('push_content_events'),0);assert.equal(db.q('SELECT bool_and(first_publication_recorded) FROM public.content_publication_state;'),true);clear();
 });
 it('rejects wrapper source drift transactionally, then accepts CRLF and preserves the base ACL boundary',()=>{
  const before=db.q("SELECT jsonb_agg(jsonb_build_array(p.proname,p.prosrc,p.proacl::text,p.proconfig) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('nca_capture_content_first_publication','nca_claim_content_push_events','nca_fanout_content_push_event_page','nca_finish_content_push_delivery','nca_claim_content_push_deliveries','nca_prepare_content_push_delivery');");
  const changed=bridge.replace('SELECT public.nca_claim_content_push_events($1)','SELECT public.nca_claim_content_push_events($1) /* source drift */');
  fail(changed,'NCA_FANOUT_BRIDGE_WRAPPER_DEFINITION_ACL');
  assert.equal(db.q("SELECT count(*)=0 FROM pg_roles WHERE rolname='nca_push_fanout_runner';"),true);
  assert.equal(db.q("SELECT count(*) FROM pg_proc WHERE proname IN ('nca_runner_claim_content_push_events','nca_runner_fanout_content_push_event_page');"),0);
  db.run(bridge.replace(/\n/g,'\r\n'),'postgres');
  assert.equal(db.q("SELECT jsonb_agg(jsonb_build_array(p.proname,p.prosrc,p.proacl::text,p.proconfig) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('nca_capture_content_first_publication','nca_claim_content_push_events','nca_fanout_content_push_event_page','nca_finish_content_push_delivery','nca_claim_content_push_deliveries','nca_prepare_content_push_delivery');"),before);
  assert.equal(db.q("SELECT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolpassword IS NULL FROM pg_roles r JOIN pg_authid a ON a.oid=r.oid WHERE r.rolname='nca_push_fanout_runner';"),true);
  assert.equal(db.q("SELECT count(*)=1 FROM pg_auth_members WHERE roleid='nca_push_fanout_runner'::regrole;"),true);
  assert.equal(db.q("SELECT m.admin_option IS TRUE AND m.set_option IS FALSE AND m.inherit_option IS FALSE AND grantor.rolsuper FROM pg_auth_members m JOIN pg_roles grantor ON grantor.oid=m.grantor WHERE m.roleid='nca_push_fanout_runner'::regrole AND m.member='postgres'::regrole;"),true);
  assert.equal(db.q("SELECT count(*)=0 FROM pg_auth_members WHERE member='nca_push_fanout_runner'::regrole;"),true);
  assert.equal(db.q("SELECT NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE (roleid='nca_push_fanout_runner'::regrole AND member='nca_push_fanout'::regrole) OR (roleid='nca_push_fanout'::regrole AND member='nca_push_fanout_runner'::regrole));"),true);
  assert.equal(db.q("SELECT has_schema_privilege('nca_push_fanout_runner','public','USAGE') AND NOT has_schema_privilege('nca_push_fanout_runner','public','CREATE');"),true);
  assert.equal(db.q("SELECT bool_and(NOT has_table_privilege('nca_push_fanout_runner',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AND NOT has_any_column_privilege('nca_push_fanout_runner',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('stories','chapters','content_publication_clock','content_publication_state','content_publications','push_content_events','push_preferences','push_subscriptions','push_deliveries');"),true);
  assert.equal(db.q("SELECT bool_and(NOT has_function_privilege('nca_push_fanout_runner',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('nca_claim_content_push_events','nca_fanout_content_push_event_page');"),true);
  assert.equal(db.q("SELECT count(*)=2 AND bool_and(proowner='postgres'::regrole AND prosecdef AND provolatile='v' AND NOT proisstrict AND NOT proleakproof AND NOT proretset AND prokind='f' AND proconfig=ARRAY['search_path=\"\"','lock_timeout=2s','statement_timeout=5s']) FROM pg_proc WHERE proname IN ('nca_runner_claim_content_push_events','nca_runner_fanout_content_push_event_page');"),true);
  assert.equal(db.q("SELECT bool_and(has_function_privilege('nca_push_fanout_runner',p.oid,'EXECUTE')) FROM pg_proc p WHERE p.proname IN ('nca_runner_claim_content_push_events','nca_runner_fanout_content_push_event_page');"),true);
  assert.equal(db.q("SELECT bool_and(NOT has_function_privilege('nca_push_fanout_runner',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('nca_claim_personal_push_deliveries','nca_prepare_personal_push_delivery','nca_finish_personal_push_delivery','nca_claim_content_push_deliveries','nca_prepare_content_push_delivery','nca_finish_content_push_delivery');"),true);
  assert.equal(db.q("SELECT NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname='nca_push_fanout';"),true);
  assert.equal(db.q("SELECT NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member='nca_push_fanout'::regrole) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid='nca_push_fanout'::regrole AND member<>'postgres'::regrole);"),true);
  audience();story();const claimed=db.q('SET ROLE nca_push_fanout_runner;SELECT public.nca_runner_claim_content_push_events(1);RESET ROLE;');
  const item=claimed.events[0];assert.ok(item);assert.equal(db.q(`SET ROLE nca_push_fanout_runner;SELECT public.nca_runner_fanout_content_push_event_page(${lit(item.event_id)},${lit(item.lease_token)},100);RESET ROLE;`).inserted,1);
  fail(`SET ROLE nca_push_fanout_runner;SELECT public.nca_claim_content_push_events(1);`,'42501','nca_guard_witness_admin');
  fail(`SET ROLE nca_push_fanout_runner;SELECT public.nca_fanout_content_push_event_page(1,'00000000-0000-4000-8000-000000000000'::uuid,1);`,'42501','nca_guard_witness_admin');
  fail('SET ROLE nca_push_fanout_runner;SET ROLE nca_push_fanout;','42501','nca_guard_witness_admin');
  fail('SET ROLE nca_push_fanout_runner;SELECT public.nca_claim_content_push_deliveries(1);','42501','nca_guard_witness_admin');
  fail('SET ROLE nca_push_fanout_runner;SELECT * FROM public.push_content_events;','42501','nca_guard_witness_admin');clear();
 });
 describe('capture, fanout and explicit sender lane',()=>{
  before(()=>assert.ok(installed,'migration must install before behavioral tests'));
  beforeEach(clear);
  it('first story publication atomically creates one genuine publication/event and advances clock once',()=>{
   story(false);assert.equal(count('push_content_events'),0);db.run('UPDATE public.stories SET published=true;');
   assert.equal(count('content_publications'),1);assert.equal(count('push_content_events'),1);assert.equal(count('notifications'),0);
   assert.deepEqual(db.q("SELECT jsonb_build_array(origin,kind,publication_revision,catalog_sequence,occurred_at IS NOT NULL,request_id IS NOT NULL,octet_length(request_hash)) FROM public.content_publications;"),['genuine','new_story',1,1,true,true,32]);
   assert.equal(db.q('SELECT frontier FROM public.content_publication_clock WHERE id=1;'),1);
   assert.equal(db.q("SELECT expires_at=created_at+interval '24 hours' FROM public.push_content_events;"),true);
  });
  it('published insert captures; edits and unpublish/republish never announce twice',()=>{
   story();db.run("UPDATE public.stories SET title='edited';UPDATE public.stories SET published=false;UPDATE public.stories SET published=true;");
   assert.equal(count('content_publications'),1);assert.equal(count('push_content_events'),1);
  });
  it('chapter first publication uses authoritative chapter/parent IDs and no bell notification',()=>{
   chapter(false);assert.equal(count('push_content_events'),0);db.run('UPDATE public.chapters SET published=true;');
   db.run("UPDATE public.chapters SET title='edit';UPDATE public.chapters SET published=false;UPDATE public.chapters SET published=true;");
   assert.equal(count('push_content_events'),1);assert.deepEqual(db.q('SELECT jsonb_build_array(kind,story_id::text,chapter_id::text) FROM public.content_publications;'),['new_chapter','9007199254740993','2']);assert.equal(count('notifications'),0);
  });
  it('missing/exhausted clock fails closed and rolls back capture and originating write',()=>{
   story(false);db.run('DELETE FROM public.content_publication_clock;');fail('UPDATE public.stories SET published=true;','NCA_PUBLICATION_CLOCK_MISSING');
   assert.equal(db.q('SELECT published FROM public.stories;'),false);assert.equal(count('push_content_events'),0);
   db.run('INSERT INTO public.content_publication_clock VALUES(1,9223372036854775807);');fail('UPDATE public.stories SET published=true;','NCA_CONTENT_CLOCK_EXHAUSTED');assert.equal(count('content_publications'),0);
  });
  it('historical publication evidence suppresses announcement even if state was false',()=>{
   const id=story(false);db.run(`INSERT INTO public.content_publications(kind,story_id,publication_revision,origin) VALUES('new_story',${id},0,'legacy_unknown');UPDATE public.stories SET published=true;`);
   assert.equal(count('content_publications'),1);assert.equal(count('push_content_events'),0);
  });
  it('global audience includes each eligible installation, excludes disabled/late/reserved subscriptions',()=>{
   audience();audience();audience({enabled:false});audience({since:"clock_timestamp()+interval '1 day'"});audience({activated:"clock_timestamp()+interval '1 day'"});audience({state:'reserved'});story();
   const e=event(),p=page(e);assert.equal(p.scanned,6);assert.equal(p.inserted,2);assert.equal(count('push_deliveries'),2);
   fail(`SET ROLE nca_push_fanout;SELECT public.nca_fanout_content_push_event_page(${lit(e.event_id)},${lit(e.lease_token)},100);`,'PT409','nca_guard_witness_admin');assert.equal(count('push_deliveries'),2);
  });
  it('UUID keyset pages are bounded and dedupe with content-event/subscription uniqueness',()=>{
   for(const id of ['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'])audience({id});story();const e=event();
   const a=page(e,1);assert.equal(a.scanned,1);assert.equal(a.has_more,true);assert.equal(a.after,'00000000-0000-4000-8000-000000000001');
   db.run('UPDATE public.push_content_events SET fanout_after=NULL;');assert.equal(page(e,1).inserted,0);assert.equal(page(e,1).inserted,1);assert.equal(page(e,1).inserted,1);assert.equal(count('push_deliveries'),3);
  });
  it('claim excludes expired/completed fanout, reclaims old leases with a new token',()=>{
   story();const e=event();assert.equal(event(),undefined);db.run("UPDATE public.push_content_events SET fanout_lease_until=clock_timestamp()-interval '1 second';");const next=event();assert.notEqual(next.lease_token,e.lease_token);
   db.run("UPDATE public.push_content_events SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '25 hours';");assert.equal(event(),undefined);
  });
  it('content claim never claims a personal row and personal claim never claims content',()=>{
   audience();story();page(event());assert.equal(sender('nca_claim_personal_push_deliveries','1').deliveries.length,0);
   const owner=db.q('SELECT user_id FROM public.push_preferences LIMIT 1;');
   db.run(`INSERT INTO public.notifications(user_id,type) VALUES(${lit(owner)},'reply');INSERT INTO public.push_personal_events(notification_id,recipient_id,category,occurred_at,expires_at) SELECT id,user_id,type,created_at,created_at+interval '1 hour' FROM public.notifications;
   INSERT INTO public.push_deliveries(id,personal_notification_id,subscription_id,captured_binding_id,captured_binding_version) SELECT gen_random_uuid(),n.id,s.id,s.binding_id,s.binding_version FROM public.notifications n CROSS JOIN public.push_subscriptions s;`);
   const content=claim();assert.equal(sender('nca_claim_content_push_deliveries','1').deliveries.length,0);const personal=sender('nca_claim_personal_push_deliveries','1').deliveries[0];assert.ok(personal);
   fail(`SELECT public.nca_prepare_content_push_delivery(${lit(personal.delivery_id)},${lit(personal.lease_token)});`,'NCA_SENDER_NOT_CONTENT','nca_push_sender');
   fail(`SELECT public.nca_prepare_personal_push_delivery(${lit(content.delivery_id)},${lit(content.lease_token)});`,'NCA_SENDER_NOT_PERSONAL','nca_push_sender');
  });
  for(const category of ['new_story','new_chapter'])it(category+' ready contains current authoritative titles and exact decimal routing, no body text',()=>{
   const d=queued(category);db.run("UPDATE public.stories SET title='Tên truyện mới';UPDATE public.chapters SET title='Tên chương mới';");const r=prepare(d);assert.equal(r.status,'ready');
   assert.equal(r.content.category,category);assert.equal(r.content.story_title,'Tên truyện mới');assert.equal(r.content.chapter_title,category==='new_chapter'?'Tên chương mới':null);assert.equal(r.content.story_id,'9007199254740993');assert.equal(typeof r.content.event_id,'string');assert.equal(typeof r.content.publication_id,'string');
   assert.deepEqual(Object.keys(r.content).sort(),['event_id','publication_id','category','story_id','chapter_id','story_title','chapter_title'].sort());
  });
  for(const [name,change] of [['disabled preference',"UPDATE public.push_preferences SET new_story_enabled=false,new_story_enabled_since=NULL"],
   ['enabled after event',"UPDATE public.push_preferences SET new_story_enabled_since=clock_timestamp()+interval '1 minute'"],
   ['binding replacement',"UPDATE public.push_subscriptions SET binding_id=gen_random_uuid(),binding_version=binding_version+1"],
   ['activated after event',"UPDATE public.push_subscriptions SET activated_at=clock_timestamp()+interval '1 minute'"],
   ['disabled device',"UPDATE public.push_subscriptions SET state='disabled',user_id=NULL,endpoint=NULL,p256dh=NULL,auth=NULL,activated_at=NULL,disabled_at=clock_timestamp()"],
   ['event expiry',"UPDATE public.push_content_events SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '25 hours'"]])
   it('prepare suppresses '+name+' after fanout',()=>{const d=queued();db.run(change+';');assert.equal(prepare(d).status,'cancelled');assert.equal(db.q('SELECT status FROM public.push_deliveries;'),'cancelled');});
  it('source deletion cascades all content work and prepare reports gone',()=>{const d=queued();db.run('DELETE FROM public.stories;');assert.equal(prepare(d).status,'gone');assert.equal(count('push_deliveries'),0);});
  for(const source of ['story','chapter'])it('unpublished '+source+' never exposes edited draft titles through an old event',()=>{
   const d=queued(source==='chapter'?'new_chapter':'new_story');
   db.run(`UPDATE public.${source==='story'?'stories':'chapters'} SET published=false,title='PRIVATE_DRAFT_TITLE';`);
   const r=prepare(d);assert.equal(r.status,'cancelled');assert(!JSON.stringify(r).includes('PRIVATE_DRAFT_TITLE'));
   assert.equal(db.q('SELECT last_error_code FROM public.push_deliveries;'),'SOURCE_NOT_PUBLISHED');
  });
  it('wrong and expired delivery lease are PT409, with bounded attempts/claim behavior',()=>{
   const d=queued();assert.equal(claim(),undefined);fail(`SELECT public.nca_prepare_content_push_delivery(${lit(d.delivery_id)},${lit(randomUUID())});`,'PT409','nca_push_sender');
   db.run("UPDATE public.push_deliveries SET lease_until=clock_timestamp()-interval '1 second';");fail(`SELECT public.nca_prepare_content_push_delivery(${lit(d.delivery_id)},${lit(d.lease_token)});`,'PT409','nca_push_sender');assert.notEqual(claim().lease_token,d.lease_token);
   db.run("UPDATE public.push_deliveries SET attempts=6,lease_until=clock_timestamp()-interval '1 second';");assert.equal(claim(),undefined);assert.equal(db.q('SELECT status FROM public.push_deliveries;'),'failed');
  });
  it('finish preserves transient/network backoff, terminal no-op and binding-safe invalidation',()=>{
   let d=queued();assert.equal(finish(d,'network').status,'pending');db.run("UPDATE public.push_deliveries SET next_attempt_at=clock_timestamp()-interval '1 second';");d=claim();assert.equal(finish(d,'transient').status,'pending');
   db.run("UPDATE public.push_deliveries SET next_attempt_at=clock_timestamp()-interval '1 second';");d=claim();assert.equal(finish(d).status,'sent');assert.equal(finish(d).status,'already_terminal');
   clear();d=queued();db.run('UPDATE public.push_subscriptions SET binding_id=gen_random_uuid(),binding_version=binding_version+1;');assert.equal(finish(d,'invalid_subscription').status,'failed');assert.equal(db.q('SELECT state FROM public.push_subscriptions;'),'active');
   clear();d=queued();assert.equal(finish(d,'invalid_subscription').status,'failed');assert.equal(db.q('SELECT state FROM public.push_subscriptions;'),'disabled');assert.equal(db.q('SELECT user_id IS NULL FROM public.push_subscriptions;'),true);
  });
  it('only RPC EXECUTE is granted; browser/API/service roles cannot call and sender/fanout cannot SELECT',()=>{
   for(const role of ['nca_push_sender','nca_push_fanout'])for(const table of ['stories','chapters','push_subscriptions','push_preferences','push_content_events','content_publications','push_deliveries'])
    fail(`SET ROLE ${role};SELECT * FROM public.${table};`,'42501','nca_guard_witness_admin');
   for(const role of ['anon','authenticated','service_role','nca_push_api','nca_push_fanout'])fail(`SET ROLE ${role};SELECT public.nca_claim_content_push_deliveries(1);`,'42501','nca_guard_witness_admin');
   fail('SELECT public.nca_claim_content_push_events(1);','42501','nca_push_sender');
  });
  it('two concurrent first-publish transactions serialize to one announcement',async()=>{
   story(false);const c=db.concurrent("BEGIN;UPDATE public.stories SET published=true;SELECT 'BARRIER_READY';SELECT pg_sleep(0.25);COMMIT;");
   try{await c.ready;db.run('UPDATE public.stories SET published=true;');}finally{await c.done;}assert.equal(count('push_content_events'),1);assert.equal(db.q('SELECT frontier FROM public.content_publication_clock;'),1);
  });
  it('chapter capture cannot deadlock with a parent delete waiting on the chapter row',async()=>{
   chapter(false);
   const c=db.concurrent("BEGIN;SELECT id FROM public.chapters FOR UPDATE;SELECT 'BARRIER_READY';SELECT pg_sleep(0.25);UPDATE public.chapters SET published=true;COMMIT;");
   await c.ready;db.run('DELETE FROM public.stories;');
   await assert.rejects(c.done,/55P03/);assert.equal(count('push_content_events'),0);assert.equal(count('stories'),0);
  });
  it('clock ordering makes enabling before publication eligible and enabling after non-retroactive',async()=>{
   audience({enabled:false});story(false);
   let c=db.concurrent("BEGIN;SELECT frontier FROM public.content_publication_clock WHERE id=1 FOR UPDATE;SELECT 'BARRIER_READY';SELECT pg_sleep(0.25);UPDATE public.push_preferences SET new_story_enabled=true,new_story_enabled_since=clock_timestamp();COMMIT;");
   try{await c.ready;db.run('UPDATE public.stories SET published=true;');}finally{await c.done;}assert.equal(page(event()).inserted,1);
   clear();audience({enabled:false});story(false);c=db.concurrent("BEGIN;UPDATE public.stories SET published=true;SELECT 'BARRIER_READY';SELECT pg_sleep(0.25);COMMIT;");
   try{await c.ready;db.run('BEGIN;SELECT frontier FROM public.content_publication_clock WHERE id=1 FOR UPDATE;UPDATE public.push_preferences SET new_story_enabled=true,new_story_enabled_since=clock_timestamp();COMMIT;');}finally{await c.done;}assert.equal(page(event()).inserted,0);
  });
  it('fanout expiry after a blocking preference lock rolls back inserts and cursor',async()=>{
   audience();story();const e=event();db.run("UPDATE public.push_content_events SET fanout_lease_until=clock_timestamp()+interval '0.1 second';");
   const c=db.concurrent("BEGIN;SELECT user_id FROM public.push_preferences FOR UPDATE;SELECT 'BARRIER_READY';SELECT pg_sleep(0.25);COMMIT;");
   try{await c.ready;fail(`SET ROLE nca_push_fanout;SELECT public.nca_fanout_content_push_event_page(${lit(e.event_id)},${lit(e.lease_token)},100);`,'PT409','nca_guard_witness_admin');}finally{await c.done;}
   assert.equal(count('push_deliveries'),0);assert.equal(db.q('SELECT fanout_after FROM public.push_content_events;'),null);
  });
  it('subscription account replacement during fanout cannot bind work to an unlocked stale owner',async()=>{
   const first=audience(),other=audience({enabled:false});story();const e=event();
   const c=db.concurrent(`BEGIN;UPDATE public.push_subscriptions SET user_id=${lit(other.user)},binding_id=gen_random_uuid(),binding_version=binding_version+1,activated_at=clock_timestamp() WHERE id=${lit(first.id)};SELECT 'BARRIER_READY';SELECT pg_sleep(0.25);COMMIT;`);
   try{await c.ready;fail(`SET ROLE nca_push_fanout;SELECT public.nca_fanout_content_push_event_page(${lit(e.event_id)},${lit(e.lease_token)},100);`,'55P03','nca_guard_witness_admin');}finally{await c.done;}assert.equal(count('push_deliveries'),0);assert.equal(db.q('SELECT fanout_after FROM public.push_content_events;'),null);
  });
  for(const phase of ['fanout','prepare'])it(phase+' cannot deadlock with account deletion through subscription/preference cascades',async()=>{
   const a=audience();story();const e=event();let d;
   if(phase==='prepare'){page(e);d=claim();}
   const statement=phase==='fanout'?`SET ROLE nca_push_fanout;SELECT public.nca_fanout_content_push_event_page(${lit(e.event_id)},${lit(e.lease_token)},100);`:
    `SET ROLE nca_push_sender;SELECT public.nca_prepare_content_push_delivery(${lit(d.delivery_id)},${lit(d.lease_token)});`;
   const c=db.concurrent(`BEGIN;SELECT user_id FROM public.push_preferences WHERE user_id=${lit(a.user)} FOR SHARE;SELECT 'BARRIER_READY';SELECT pg_sleep(0.25);${statement}COMMIT;`);
   await c.ready;db.run(`DELETE FROM auth.users WHERE id=${lit(a.user)};`);await assert.rejects(c.done,/55P03/);assert.equal(count('push_deliveries'),0);assert.equal(count('push_preferences'),0);
  });
 });
});
