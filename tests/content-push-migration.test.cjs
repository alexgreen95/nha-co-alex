'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const sql=fs.readFileSync('database/migrations/20261022_content_push_delivery.sql','utf8');
const baseline=fs.readFileSync('tests/helpers/personal-push-sender-baseline.sql','utf8');
const fn=name=>sql.match(new RegExp('CREATE FUNCTION public\\.'+name+'[\\s\\S]*?AS \\$fn\\$([\\s\\S]*?)\\$fn\\$;'))?.[1];
const canonicalProsrc=source=>source.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
const required=JSON.parse(sql.match(/DECLARE required pg_catalog\.jsonb := '([^']+)'/)[1]);
const requiredFKDelete=JSON.parse(sql.match(/required_fk_delete pg_catalog\.jsonb := '([^']+)'/)[1]);
const checkManifestMatches=actual=>required.checks.every(expected=>actual.some(row=>JSON.stringify(row)===JSON.stringify(expected)))&&
 required.check_alternatives.every(([table,,scope,hashes])=>actual.some(row=>row[0]===table&&row[1]===scope&&hashes.includes(row[2])));
const fkDeleteManifestMatches=actual=>requiredFKDelete.every(expected=>{
 const sameLocalTuple=actual.filter(row=>row[0]===expected[0]&&JSON.stringify(row[1])===JSON.stringify(expected[1]));
 return sameLocalTuple.length===1&&JSON.stringify(sameLocalTuple[0])===JSON.stringify(expected);
});
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
 assert.match(sql,/r\.relname IN \('stories','chapters'\) AND a\.attname='id' AND a\.attidentity='d' THEN '' ELSE a\.attidentity/);
});
test('reviewed FK contracts count all mappings on the exact ordered local tuple before checking target/action/flags',()=>{
 assert.deepEqual(requiredFKDelete,[
  ['push_subscriptions',['user_id'],'auth','users',['id'],'c',true,false,false],
  ['push_preferences',['user_id'],'auth','users',['id'],'c',true,false,false],
  ['push_deliveries',['personal_notification_id'],'public','push_personal_events',['notification_id'],'c',true,false,false]
 ]);
 assert.match(sql,/k\.confdeltype::pg_catalog\.text/);
 assert.match(sql,/\), foreign_keys_all AS \([\s\S]*?k\.confdeltype::pg_catalog\.text,k\.convalidated,k\.condeferrable,k\.condeferred\) AS j[\s\S]*?WHERE k\.contype='f'\s*\)/);
 assert.doesNotMatch(sql,/foreign_keys_all AS \([\s\S]*?WHERE k\.contype='f' AND/);
 assert.match(sql,/actual->'foreign_keys_all'[\s\S]*?observed\.value->0=item->0 AND observed\.value->1=item->1\)<>1/);
 assert.doesNotMatch(sql,/WHERE observed\.value->0=item->0 AND observed\.value->1=item->1 AND observed\.value->2=item->2/);
 assert.match(sql,/WHERE observed\.value->0=item->0 AND observed\.value->1=item->1\)<>1[\s\S]*?END IF;\s*IF NOT EXISTS\([\s\S]*?WHERE observed\.value=item/);
 assert.match(sql,/jsonb_array_elements\(required_fk_delete\)/);
 assert.match(sql,/observed\.value=item/);
 const reviewed=requiredFKDelete.map(row=>[...row.slice(0,2),row[2],row[3],[...row[4]],...row.slice(5)]);
 assert(fkDeleteManifestMatches(reviewed),'exact reviewed cascade contracts pass');
 const changedAction=reviewed.map(row=>[...row]);changedAction[0][5]='a';
 assert(!fkDeleteManifestMatches(changedAction),'ON DELETE NO ACTION fails');
 const duplicateValidated=reviewed.concat([[...reviewed[0].slice(0,5),'a',true,false,false]]);
 assert(!fkDeleteManifestMatches(duplicateValidated),'a second validated/nondeferrable FK on the same local tuple fails');
 const duplicateUnvalidated=reviewed.concat([[...reviewed[0].slice(0,5),'c',false,false,false]]);
 assert(!fkDeleteManifestMatches(duplicateUnvalidated),'an unvalidated duplicate remains visible and fails');
 const duplicateDeferrable=reviewed.concat([[...reviewed[0].slice(0,5),'c',true,true,false]]);
 assert(!fkDeleteManifestMatches(duplicateDeferrable),'a deferrable duplicate remains visible and fails');
 const duplicateDeferred=reviewed.concat([[...reviewed[0].slice(0,5),'c',true,true,true]]);
 assert(!fkDeleteManifestMatches(duplicateDeferred),'an initially deferred duplicate remains visible and fails');
 const duplicateRelation=reviewed.concat([[...reviewed[0].slice(0,2),'public','other_table',['id'],'c',true,false,false]]);
 assert(!fkDeleteManifestMatches(duplicateRelation),'a duplicate referencing another relation fails');
 const duplicateColumns=reviewed.concat([[...reviewed[0].slice(0,4),['other_id'],'c',true,false,false]]);
 assert(!fkDeleteManifestMatches(duplicateColumns),'a duplicate referencing another column tuple fails');
 const unrelatedLocal=reviewed.concat([['push_subscriptions',['user_id','id'],'public','other_table',['id','id'],'c',true,false,false]]);
 assert(fkDeleteManifestMatches(unrelatedLocal),'a different local tuple does not count as a duplicate');
 const swapped=reviewed.map(row=>[...row]);
 for(const index of [2,3,4]) [swapped[0][index],swapped[2][index]]=[swapped[2][index],swapped[0][index]];
 assert(!fkDeleteManifestMatches(swapped),'swapping FK metadata between local relations fails');
 assert(!fkDeleteManifestMatches(reviewed.slice(1)),'missing required FK fails');
 const wrongTarget=reviewed.map(row=>[...row]);wrongTarget[2][4]=['id'];
 assert(!fkDeleteManifestMatches(wrongTarget),'referenced-column mismatch fails');
 const wrongRelation=reviewed.map(row=>[...row]);wrongRelation[2][3]='push_events';
 assert(!fkDeleteManifestMatches(wrongRelation),'referenced-relation mismatch fails');
 const unvalidatedSole=reviewed.map(row=>[...row]);unvalidatedSole[0][6]=false;
 assert(!fkDeleteManifestMatches(unvalidatedSole),'an unvalidated sole FK fails');
 const deferrableSole=reviewed.map(row=>[...row]);deferrableSole[0][7]=true;
 assert(!fkDeleteManifestMatches(deferrableSole),'a deferrable sole FK fails');
 // Approved evidence in the audit note records delete action only; do not guess
 // ON UPDATE or MATCH behavior from defaults or from a collector field name.
 assert.doesNotMatch(sql,/k\.confupdtype|k\.confmatchtype/);
});
test('reviewed CHECK alternatives stay bound to their table and logical invariant',()=>{
 const alternatives=required.check_alternatives;
 assert.deepEqual(alternatives,[
  ['push_content_events','push_content_events_lifetime','check',['b634c31b56e460e7d876fa6eae0ef65b','c02f8882fb8853364686e10079d5ec53']],
  ['content_publications','content_publications_genuine_legacy_metadata','check',['4d244c0394485df884ebf8c4c2a84867','32b9db3725b3931d958ed6dc285b2d40']],
  ['push_preferences','push_preferences_revision_check','check',['9eb5e5f3646758249a81e65d92c9aaa1','b50e163164a3859b3f2a0c3345d5579c']],
  ['push_preferences','push_preferences_check','check',['19908229a458f34817950aa89b5b9d9b','aebb952c5401e6d98f92f30943a8f6b7']],
  ['push_preferences','push_preferences_check1','check',['6a447d43ba2b15dc3659a34342986844','307cf9012e7d4c50a425cb87f62c876f']],
  ['push_preferences','push_preferences_check2','check',['d0dfde05cef009db0bf559637f77f3b5','ae213bc509a9e8e3ef286c60081d4135']],
  ['push_preferences','push_preferences_check3','check',['9afece9bffae87f05886c81cef27700a','c5868e8bcaa542be512a9535c932e7e4']],
  ['push_preferences','push_preferences_updated_at_check','check',['c78bf73b84a0cb0e17e1c45d403c0156','a3892e64ec447e7556413e1b993401e8']],
  ['push_preferences','push_preferences_comment_enabled_since_check','check',['bfcbcd18113c90a819dd7067ce34e903','f81e4ee892464ef60a3926f1bba53d26']],
  ['push_preferences','push_preferences_reply_enabled_since_check','check',['2fe580d86d0a208af86581024afd0ba4','a620d58ab205e334cea2f28972610dbd']],
  ['push_preferences','push_preferences_mention_enabled_since_check','check',['294cca3b1f1ba605c08bc0761327767b','c2665edfeacecd93bec27d5bb3be6ce2']],
  ['push_preferences','push_preferences_comment_like_enabled_since_check','check',['7d312628af98bbd807ae536fe95284e1','a229c200a1e813678f7e817133ec9d55']]
 ]);
 assert.equal(new Set(alternatives.map(row=>row[1])).size,12);
 assert(alternatives.every(row=>row.length===4&&row[2]==='check'&&row[3].length===2&&new Set(row[3]).size===2));
 assert.match(sql,/jsonb_each\(required\) WHERE key<>'check_alternatives'/);
 assert.match(sql,/observed\.value->>0=item->>0 AND observed\.value->>1=item->>2/);
 assert.match(sql,/jsonb_array_elements_text\(item->3\)/);
 assert.match(sql,/allowed\.hash=observed\.value->>2/);
 const candidate=required.checks.concat(alternatives.map(([table,,scope,hashes])=>[table,scope,hashes[0]]));
 assert(checkManifestMatches(candidate),'all candidate fingerprints pass');
 const production=required.checks.concat(alternatives.map(([table,,scope,hashes])=>[table,scope,hashes[1]]));
 assert(checkManifestMatches(production),'all exact reviewed production fingerprints pass');
 const arbitrary=production.map(row=>[...row]);
 const [first]=alternatives;const changed=arbitrary.find(row=>row[0]===first[0]&&row[1]===first[2]&&row[2]===first[3][1]);changed[2]='ffffffffffffffffffffffffffffffff';
 assert(!checkManifestMatches(arbitrary),'unreviewed replacement fingerprint fails');
 const swapped=required.checks.concat(alternatives.map(([table,,scope,hashes])=>[table,scope,hashes[1]]));
 const event=alternatives[0],publication=alternatives[1];
 swapped.find(row=>row[0]===event[0]&&row[1]===event[2]&&row[2]===event[3][1])[2]=publication[3][1];
 swapped.find(row=>row[0]===publication[0]&&row[1]===publication[2]&&row[2]===publication[3][1])[2]=event[3][1];
 assert(!checkManifestMatches(swapped),'swapping approved fingerprints between invariants fails');
 assert(!checkManifestMatches(candidate.filter(row=>!(row[0]==='push_content_events'&&row[1]==='check'&&row[2]===alternatives[0][3][0]))),'missing required invariant fails');
});
test('publication metadata alternative is isolated from origin and other CHECK guards',()=>{
 const publication=required.check_alternatives.find(row=>row[0]==='content_publications');
 assert.deepEqual(publication,['content_publications','content_publications_genuine_legacy_metadata','check',['4d244c0394485df884ebf8c4c2a84867','32b9db3725b3931d958ed6dc285b2d40']]);
 const origin=['content_publications','check','9c603e8249311c5b9a1557f53b8e6819'];
 assert(required.checks.some(row=>JSON.stringify(row)===JSON.stringify(origin)),'origin hash stays exact and separate');
 assert(!required.check_alternatives.some(([, , ,hashes])=>hashes.includes(origin[2])));
 const production=required.checks.concat(required.check_alternatives.map(([table,,scope,hashes])=>[table,scope,hashes[1]]));
 assert(checkManifestMatches(production),'production metadata fingerprint passes its own invariant');
 const wrongOrigin=production.map(row=>[...row]);
 const originRow=wrongOrigin.find(row=>row[0]===origin[0]&&row[1]===origin[1]&&row[2]===origin[2]);originRow[2]=publication[3][1];
 assert(!checkManifestMatches(wrongOrigin),'metadata fingerprint cannot satisfy the origin invariant');
 for(const hash of ['9867e2a437a1bd976ced8693f99a1511','61df2a5a6be1124c31951ccf4539747a'])
  assert(required.checks.some(row=>row[0]==='push_preferences'&&row[2]===hash),'new-story/new-chapter CHECK remains exact');
 const unrelated=required.checks.map(row=>[...row]).concat(required.check_alternatives.map(([table,,scope,hashes])=>[table,scope,hashes[0]]));
 const subscription=unrelated.find(row=>row[0]==='push_subscriptions');subscription[2]='ffffffffffffffffffffffffffffffff';
 assert(!checkManifestMatches(unrelated),'unrelated CHECK change remains fail-closed');
});
test('all six routines are definer/empty-path/hardened and have checked exact new source hashes',()=>{
 const hashes=JSON.parse(sql.match(/expected pg_catalog.jsonb:='([^']+)'/)[1]);assert.equal(Object.keys(hashes).length,6);
 for(const [name,hash] of Object.entries(hashes)){
  assert.equal(createHash('md5').update(fn(name)).digest('hex'),hash,name);
  const declaration=sql.match(new RegExp('CREATE FUNCTION public\\.'+name+'[\\s\\S]*?AS \\$fn\\$'))[0];
  assert(declaration.includes("SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s'"));
 }
});
test('final routine source hashes ignore only CRLF and lone-CR line endings',()=>{
 const hashes=JSON.parse(sql.match(/expected pg_catalog\.jsonb:='([^']+)'/)[1]);
 for(const [name,hash] of Object.entries(hashes)){
  const source=canonicalProsrc(fn(name));
  const md5=value=>createHash('md5').update(value).digest('hex');
  assert.equal(md5(source),hash,`${name} LF`);
  assert.equal(md5(canonicalProsrc(source.replace(/\n/g,'\r\n'))),hash,`${name} CRLF`);
  assert.equal(md5(canonicalProsrc(source.replace(/\n/g,'\r'))),hash,`${name} lone CR`);
  assert.notEqual(md5(source.replace('DECLARE','XDECLARE')),hash,`${name} substantive change`);
  assert.notEqual(md5(source.replace('DECLARE','DECLARE ')),hash,`${name} non-newline whitespace change`);
 }
 assert.match(sql,/md5\(pg_catalog\.replace\(pg_catalog\.replace\(r\.prosrc,E'\\r\\n',E'\\n'\),E'\\r',E'\\n'\)\)/);
 const verifier=sql.match(/IF r\.proowner[\s\S]*?THEN RAISE EXCEPTION 'NCA_CONTENT_FINAL_ROUTINES'; END IF;/)[0];
 for(const condition of ['r.proowner<>owner_oid','NOT r.prosecdef',"r.provolatile<>'v'",'r.proisstrict','r.proleakproof',
  'r.proretset',"r.prokind<>'f'",'proconfig IS DISTINCT FROM ARRAY','has_function_privilege','aclexplode','a.is_grantable'])
  assert(verifier.includes(condition),`final verifier retains ${condition}`);
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
