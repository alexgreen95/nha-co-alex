'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const sql=fs.readFileSync('database/migrations/20261022_content_push_delivery.sql','utf8');
const baseline=fs.readFileSync('tests/helpers/personal-push-sender-baseline.sql','utf8');
const fn=name=>sql.match(new RegExp('CREATE FUNCTION public\\.'+name+'[\\s\\S]*?AS \\$fn\\$([\\s\\S]*?)\\$fn\\$;'))?.[1];
test('one new transaction, context/drift/collision guards precede creation, no replaced consumed functions',()=>{
 assert.match(sql,/BEGIN;[\s\S]*COMMIT;\s*$/);assert(sql.indexOf('NCA_CONTENT_FOUNDATION_')<sql.indexOf('CREATE FUNCTION'));
 assert(sql.includes("pg_catalog.current_setting('server_version_num')<>'170011'"));assert(sql.includes('NCA_CONTENT_ROLE_AUTHORITY'));assert(sql.includes('NCA_CONTENT_PERSONAL_BOUNDARY'));assert(sql.includes('NCA_CONTENT_COLLISION'));
 assert.doesNotMatch(sql,/CREATE OR REPLACE|CREATE TABLE|ALTER TABLE|CREATE ROLE|ALTER ROLE|pg_get_|pg_(cancel|terminate)_backend|40001|40P01/);
 assert.equal((sql.match(/CREATE FUNCTION/g)||[]).length,6);assert.equal((sql.match(/CREATE TRIGGER/g)||[]).length,2);
});
test('structural requirements are explicit columns/checks/keys/indexes, not sampled production baseline',()=>{
 const required=JSON.parse(sql.match(/DECLARE required pg_catalog.jsonb := '([^']+)'/)[1]);
 for(const key of ['columns','checks','keys','indexes'])assert(required[key].length>0);
 for(const table of ['stories','chapters','content_publication_clock','content_publication_state','content_publications','push_content_events','push_preferences','push_subscriptions','push_deliveries'])assert(required.columns.some(x=>x[0]===table));
 assert(sql.includes('canonical REQUIRED shapes'));assert(sql.includes("':varattno '||a.names[x.step]"));
 assert(sql.includes('k.convalidated AND NOT k.condeferrable'));assert(sql.includes('i.indisvalid AND i.indisready AND i.indislive'));
 assert(sql.includes('WHERE observed.value=item'));assert.doesNotMatch(sql,/@>/);
});
test('all six routines are definer/empty-path/hardened and have checked exact new source hashes',()=>{
 const hashes=JSON.parse(sql.match(/expected pg_catalog.jsonb:='([^']+)'/)[1]);assert.equal(Object.keys(hashes).length,6);
 for(const [name,hash] of Object.entries(hashes)){
  assert.equal(createHash('md5').update(fn(name)).digest('hex'),hash,name);
  const declaration=sql.match(new RegExp('CREATE FUNCTION public\\.'+name+'[\\s\\S]*?AS \\$fn\\$'))[0];
  assert(declaration.includes("SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s'"));
 }
});
test('minimal function-only ACLs separate fanout/sender and keep capture owner-only',()=>{
 assert.doesNotMatch(sql,/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL|USAGE)|GRANT[^;]*ON\s+(?:TABLE|SEQUENCE|SCHEMA)/i);
 for(const name of ['nca_claim_content_push_events','nca_fanout_content_push_event_page'])assert.match(sql,new RegExp('GRANT EXECUTE ON FUNCTION public\\.'+name+'[^;]+TO nca_push_fanout;'));
 for(const name of ['nca_claim_content_push_deliveries','nca_prepare_content_push_delivery','nca_finish_content_push_delivery'])assert.match(sql,new RegExp('GRANT EXECUTE ON FUNCTION public\\.'+name+'[^;]+TO nca_push_sender;'));
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION public\.nca_capture/);assert(sql.includes('FROM PUBLIC,anon,authenticated,service_role,nca_push_api,nca_push_fanout,nca_push_sender'));
 assert(sql.includes('m.roleid=guard_row.oid AND m.member<>installer'));
});
test('installation itself does not backfill, create events or call any runtime routine',()=>{
 const outside=sql.replace(/DO \$guard\$[\s\S]*?\$guard\$;/,'').replace(/AS \$fn\$[\s\S]*?\$fn\$;/g,'').replace(/DO \$verify\$[\s\S]*?\$verify\$;/,'').replace(/CREATE TRIGGER[^;]*;/g,'').replace(/--[^\n]*/g,'');
 assert.doesNotMatch(outside,/\b(INSERT|UPDATE|DELETE|PERFORM|CALL)\b/i);assert.doesNotMatch(outside,/SELECT\s+(?:public\.)?nca_/i);
 assert.doesNotMatch(sql,/INSERT INTO public\.notifications/);
});
test('capture derives first transition from NEW/OLD, serializes state then clock and uses DB-generated evidence',()=>{
 const s=fn('nca_capture_content_first_publication');
 assert(s.indexOf('FOR UPDATE')<s.indexOf('FROM public.content_publication_clock'));
 for(const part of ['ON CONFLICT(story_id)',"WHERE kind='new_story'",'ON CONFLICT(chapter_id)',"WHERE kind='new_chapter'",'state_at.first_publication_recorded','OLD.published IS TRUE','NEW.published IS NOT TRUE',"unknown_history:=TG_OP='UPDATE'",'NCA_PUBLICATION_CLOCK_MISSING','NCA_CONTENT_CLOCK_EXHAUSTED','pg_catalog.gen_random_uuid()','pg_catalog.sha256','pg_catalog.clock_timestamp()',"time_at+INTERVAL '24 hours'"])assert(s.includes(part),part);
 assert(sql.includes('AFTER INSERT OR UPDATE ON public.stories'));assert(sql.includes('AFTER INSERT OR UPDATE ON public.chapters'));
});
test('fanout keysets global UUIDs but takes preference before subscription locks, with late time/lease checks',()=>{
 const s=fn('nca_fanout_content_push_event_page');assert(s.includes('ORDER BY id LIMIT (p_limit+1)'));
 assert(s.indexOf('FROM public.push_preferences')<s.indexOf('WHERE id=locator.id FOR SHARE'));
 for(const part of ['since_at<=p.occurred_at','s.activated_at<=p.occurred_at','s.user_id IS NOT DISTINCT FROM locator.user_id',
  's.user_id IS NOT DISTINCT FROM pref.user_id','s.binding_id,s.binding_version','ON CONFLICT(content_event_id,subscription_id)',
  'WHERE content_event_id IS NOT NULL DO NOTHING','NCA_CONTENT_FANOUT_LEASE_CONFLICT','NCA_CONTENT_FANOUT_EXPIRED'])assert(s.includes(part));
 assert(s.lastIndexOf('NCA_CONTENT_FANOUT_EXPIRED')>s.indexOf('ON CONFLICT(content_event_id,subscription_id)'));
  assert(s.includes('WHERE id=locator.id FOR SHARE NOWAIT'));
});
test('content claim/finish copy the closed safety algorithm with only lane filtering/names changed',()=>{
 for(const name of ['claim','finish']){
  const old=baseline.match(new RegExp('CREATE FUNCTION public\\.nca_'+name+'_personal_push_deliver'+(name==='claim'?'ies':'y')+'[\\s\\S]*?AS \\$fn\\$([\\s\\S]*?)\\$fn\\$;'))[1];
  const expected=old.replaceAll('d.personal_notification_id IS NOT NULL AND d.content_event_id IS NULL','d.personal_notification_id IS NULL AND d.content_event_id IS NOT NULL')
   .replaceAll('d.personal_notification_id IS NULL OR d.content_event_id IS NOT NULL','d.personal_notification_id IS NOT NULL OR d.content_event_id IS NULL').replaceAll('NCA_SENDER_NOT_PERSONAL','NCA_SENDER_NOT_CONTENT');
  assert.equal(fn('nca_'+name+'_content_push_deliver'+(name==='claim'?'ies':'y')),expected);
 }
});
test('prepare repeats source/preference/activation/binding/lease checks and projects only authoritative titles',()=>{
 const s=fn('nca_prepare_content_push_delivery');
 for(const token of ['NCA_SENDER_NOT_CONTENT','d.lease_token IS DISTINCT FROM p_lease_token',"INTERVAL '15 seconds'",'e.expires_at<=pg_catalog.clock_timestamp()',
  "p.origin<>'genuine'","p.kind NOT IN ('new_story','new_chapter')",'since_at>p.occurred_at','s.activated_at>p.occurred_at',
  's.user_id IS DISTINCT FROM pref.user_id','s.binding_id IS DISTINCT FROM d.captured_binding_id','s.binding_version IS DISTINCT FROM d.captured_binding_version',
  'SELECT title,published INTO story_title,story_published FROM public.stories WHERE id=p.story_id','SELECT title,story_id,published INTO chapter_title,chapter_story,chapter_published FROM public.chapters WHERE id=p.chapter_id',
  'story_published IS DISTINCT FROM true','chapter_published IS DISTINCT FROM true','SOURCE_NOT_PUBLISHED'])assert(s.includes(token),token);
 assert.doesNotMatch(s,/SELECT[^;]*\b(?:body|content|email)\b/i);
 assert(s.includes('WHERE id=d.subscription_id FOR SHARE NOWAIT'));
});
test('worker execution/budgets exactly preserve the personal loop except content projection',()=>{
 const personal=fs.readFileSync('server/personal-push-worker.cjs','utf8'),content=fs.readFileSync('server/content-push-worker.cjs','utf8');
 assert.equal(content.slice(content.indexOf('async function runWorker')),personal.slice(personal.indexOf('async function runWorker')).replace('payloadFor(ready.notification)','payloadFor(ready.content)'));
});
test('SW personal validator/click behavior remain unchanged and deployment adds duration only, no cron',()=>{
 const sw=fs.readFileSync('push-sw.js','utf8');assert(sw.includes("scope.clients.openWindow(scope.location.origin + '/')"));assert.doesNotMatch(sw,/openWindow\([^)]*(?:payload|event\.notification)/);
 const config=JSON.parse(fs.readFileSync('vercel.json'));assert.equal(config.functions['api/content-push-worker.js'].maxDuration,60);assert.equal(config.crons,undefined);
});
