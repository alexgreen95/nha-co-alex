'use strict';
// Static only. No application import, subprocess, SQL client, network or DB.
const {describe,it}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../database/verification/20261022_content_push_contract_collector.sql'),'utf8');

function executable(text){
 let out='',i=0;
 while(i<text.length){
  if(text.startsWith('--',i)){const end=text.indexOf('\n',i);i=end<0?text.length:end;out+=' ';continue;}
  if(text.startsWith('/*',i)){
   let depth=1;i+=2;
   while(depth&&i<text.length){if(text.startsWith('/*',i)){depth++;i+=2;}else if(text.startsWith('*/',i)){depth--;i+=2;}else i++;}
   assert.equal(depth,0,'unterminated comment');out+=' ';continue;
  }
  if(text[i]==="'"){
   i++;let closed=false;
   while(i<text.length){if(text[i]==="'"){if(text[i+1]==="'")i+=2;else{i++;closed=true;break;}}else i++;}
   assert.ok(closed,'unterminated literal');out+=' <literal> ';continue;
  }
  if(text.startsWith('"char"',i)){out+='char';i+=6;continue;}
  assert.notEqual(text[i],'$','no executable dollar quoting');
  assert.notEqual(text[i],'"','no executable quoted identifiers except builtin char');
  assert.notEqual(text[i],'\\','no psql metacommands or escaped executable syntax');
  out+=text[i++];
 }
 return out;
}
const code=executable(source);
const catalogs=new Set(['pg_class','pg_namespace','pg_attribute','pg_attrdef','pg_constraint','pg_index',
 'pg_policy','pg_rewrite','pg_depend','pg_proc','pg_language','pg_trigger','pg_database','pg_default_acl',
 'pg_roles','pg_auth_members','pg_type','pg_opclass','pg_collation','pg_shdepend','pg_inherits']);
const functions=new Set(['lower','strpos','unnest','aclexplode','acldefault','octet_length','btrim','encode',
 'jsonb_build_object','jsonb_agg','to_jsonb','jsonb_each_text','count','current_database','current_setting','statement_timestamp']);
const ctes=new Set([...code.matchAll(/^([a-z_]+)(?:\([^\n]*\))? AS (?:MATERIALIZED )?\(/gm)].map(m=>m[1]));

function validateRowSources(text){
 for(const [,schema,name] of text.matchAll(/\b(?:FROM|JOIN)\s+(?:LATERAL\s+)?(\w+)\.(\w+)/gi))
  assert.ok(schema==='pg_catalog'&&(catalogs.has(name)||functions.has(name)),`non-catalog row source: ${schema}.${name}`);
 for(const [,name] of text.matchAll(/\b(?:FROM|JOIN)\s+(?!LATERAL\b)(\w+)(?![\w.])/gi))
  assert.ok(ctes.has(name),`unknown unqualified row source: ${name}`);
}
function validateCalls(text){
 for(const [,schema,name] of text.matchAll(/\b(\w+)\.(\w+)\s*\(/g))
  assert.ok(schema==='pg_catalog'&&functions.has(name),`non-approved function: ${schema}.${name}`);
}

describe('content push raw catalog collector: static safety and evidence contract',()=>{
 it('uses exactly one read-only transaction, local hardening and final rollback',()=>{
  const statements=code.split(';').map(s=>s.trim()).filter(Boolean);
  assert.equal(statements.length,9);assert.equal(statements[0],'BEGIN READ ONLY');
  assert.match(statements[7],/^WITH RECURSIVE\b/);assert.equal(statements[8],'ROLLBACK');
  assert.doesNotMatch(code,/\bCOMMIT\b/i);
  for(const [setting,value] of [['search_path',''],['standard_conforming_strings','on'],['statement_timeout','15s'],
   ['lock_timeout','2s'],['idle_in_transaction_session_timeout','20s'],['transaction_timeout','30s']])
   assert.ok(source.includes(`SET LOCAL ${setting} = '${value}';`));
 });
 it('contains no data/schema mutation, dynamic SQL, role impersonation, locks or controls',()=>{
  assert.doesNotMatch(code,/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO|EXECUTE|COPY|PREPARE|LOCK|LISTEN|NOTIFY|VACUUM|ANALYZE|INTO|COMMENT|SECURITY LABEL)\b/i);
  assert.doesNotMatch(code,/SET\s+(LOCAL\s+)?(ROLE|SESSION AUTHORIZATION)|FOR\s+(SHARE|UPDATE)|pg_(cancel_backend|terminate_backend|sleep|advisory|reload_conf|notify)|nextval|setval/i);
 });
 it('all qualified row sources are allowlisted catalogs, all other row sources are CTEs',()=>{
  assert(ctes.size>30);validateRowSources(code);
  assert.doesNotMatch(code,/\b(public|auth|realtime)\s*\.|pg_authid|pg_shadow|pg_user_mapping|information_schema|dblink|postgres_fdw/i);
  assert.throws(()=>validateRowSources('SELECT * FROM public.push_subscriptions'));
  assert.throws(()=>validateRowSources('SELECT * FROM notifications'));
  assert.throws(()=>validateRowSources('SELECT * FROM pg_catalog.pg_authid'));
 });
 it('only audited metadata builtins are called; an application call cannot pass',()=>{
  validateCalls(code);assert.throws(()=>validateCalls('SELECT public.nca_prepare_content_push_delivery(1)'));
  assert.throws(()=>validateCalls('SELECT pg_catalog.pg_terminate_backend(1)'));
  assert.doesNotMatch(code,/\bnca_\w*\s*\(/i);
 });
 it('no secret fields or subscription/application values are selected',()=>{
  assert.doesNotMatch(code,/\b(rolpassword|rolsecret|passwd|umoptions|srvoptions|subconninfo)\b/i);
  assert.doesNotMatch(code,/\.\s*(endpoint|p256dh|auth|user_id|content|body|email|title)\b/i);
  // Names/source/default nodes are inert metadata, not evaluated SELECT paths.
  assert.ok(source.includes("'application_rows_read',0"));assert.ok(source.includes("'runtime_rpc_calls',0"));
 });
 it('does not use deparsers, formatted type/object casts or privilege resolution',()=>{
  assert.doesNotMatch(code,/pg_get_|format_type|regprocedure|regtype|regrole|regclass|has_(function|table|column|schema)_privilege/);
  for(const [,cast] of code.matchAll(/::pg_catalog\.(\w+)/g))assert.ok(['text','char','int2','int4','int8','oid','jsonb'].includes(cast),cast);
  assert.ok(source.includes("'raw_nodes_only',true,'deparsers_used',false"));
 });
 it('discovers seven exact public targets and two clearly separated support relations',()=>{
  const wanted=source.slice(source.indexOf('requested('),source.indexOf('tokens('));
  for(const name of ['content_publication_clock','content_publication_state','content_publications',
   'push_content_events','push_deliveries','push_preferences','push_subscriptions'])
   assert.ok(wanted.includes(`('public','${name}','foundation')`),name);
  for(const name of ['stories','chapters'])assert.ok(wanted.includes(`('public','${name}','presentation_publication_support')`));
  assert.ok(source.includes('7 AS target_relations_expected'));
  assert.ok(source.includes("'exists',r.oid IS NOT NULL"));assert.ok(source.includes('LEFT JOIN relations_all r'));
  assert.ok(source.includes("'target_absence_is_recorded_not_failure',true"));
 });
 it('captures raw relation identity, ownership/RLS, defaults and column type/typmod details',()=>{
  for(const field of ['oid','relkind','relnamespace','reltype','relowner','relrowsecurity','relforcerowsecurity','relacl',
   'relispartition','relpartbound','attrelid','attnum','attname','attisdropped','atttypid','typname','type_schema',
   'atttypmod','attnotnull','attidentity','attgenerated','attcollation','atthasdef','attrdef_oid','adbin','attacl'])
   assert.ok(source.includes(`'${field}'`),field);
  assert.ok(source.includes('d.adbin::pg_catalog.text'));assert.ok(source.includes('r.relpartbound::pg_catalog.text'));
 });
 it('collects all preference columns and does not inspect preference RPC definitions',()=>{
  const columns=source.slice(source.indexOf('columns_all AS'),source.indexOf('constraints_all AS'));
  assert.match(columns,/WHERE a\.attnum>0/);
  assert.doesNotMatch(columns,/push_preferences|attname IN/);
  assert.doesNotMatch(source,/nca_(get|set)_push_preferences/);
 });
 it('captures PK/unique/FK/check semantics, raw expressions and index descriptors',()=>{
  for(const field of ['contype','conrelid','conkey','confrelid','confkey','condeferrable','condeferred','convalidated',
   'conindid','conparentid','confupdtype','confdeltype','confmatchtype','conpfeqop','conppeqop','conffeqop','conbin',
   'indexrelid','indrelid','indnatts','indnkeyatts','indisunique','indisprimary','indnullsnotdistinct','indisvalid',
   'indisready','indislive','indkey','indclass','indcollation','indoption','indexprs','indpred'])assert.ok(source.includes(`'${field}'`),field);
  for(const value of ['k.conbin::pg_catalog.text','i.indexprs::pg_catalog.text','i.indpred::pg_catalog.text',
   'pg_catalog.pg_opclass','pg_catalog.pg_collation','c.colllocale','c.collicurules'])assert.ok(source.includes(value));
  assert.doesNotMatch(source,/colliculocale|conenforced/); // Not PostgreSQL 17 fields.
  for(const field of ['conf_schema','conf_relation','conf_columns'])assert.ok(source.includes(`'${field}'`),field);
  assert.ok(source.includes('pg_catalog.unnest(k.confkey) WITH ORDINALITY'));
 });
 it('retains every FK on requested relations for exhaustive local-tuple preflight',()=>{
  const allConstraints=source.slice(source.indexOf('constraints_all AS MATERIALIZED'),source.indexOf('indexes_all AS MATERIALIZED'));
  assert.match(allConstraints,/SELECT k\.\* FROM pg_catalog\.pg_constraint k WHERE k\.conrelid IN \(SELECT oid FROM relations_all\)/);
  assert.doesNotMatch(allConstraints,/\b(?:contype|convalidated|condeferrable|condeferred)\s*(?:=|AND|OR)/);
  const output=source.slice(source.indexOf('constraints_out AS'),source.indexOf('indexes_out AS'));
  for(const field of ['conrelid','conkey','confrelid','confkey','conf_schema','conf_relation','conf_columns',
   'confdeltype','convalidated','condeferrable','condeferred'])assert.ok(output.includes(`'${field}'`),field);
  assert.ok(output.includes('ORDER BY k.oid LIMIT (SELECT constraints FROM limits)'));
  assert.ok(source.includes("'constraints',COALESCE((SELECT pg_catalog.jsonb_agg(j ORDER BY oid) FROM constraints_out),'[]'::pg_catalog.jsonb)"));
  assert.ok(source.includes("'CAP_EXCEEDED:'||c.key"));
  assert.ok(source.includes("'catalog_evidence_complete',NOT EXISTS(SELECT 1 FROM catalog_reasons)"));
  for(const field of ['attrelid','attnum','attname'])assert.ok(source.includes(`'${field}'`),field);
 });
 it('uses dependency AND source-token discovery before any routine cap, not guessed names alone',()=>{
  const discovery=source.slice(source.indexOf('candidate_all AS'),source.indexOf('candidates AS'));
  assert.doesNotMatch(discovery,/\bLIMIT\b/);
  assert.ok(source.includes("d.classid=(SELECT oid FROM catalog_ids WHERE relname='pg_proc')"));
  assert.ok(source.includes("relname='pg_type') AND d.refobjid IN (SELECT reltype FROM relations_all)"));
  assert.ok(discovery.includes('FROM relation_edges d WHERE d.objid=p.oid'));
  assert.ok(discovery.includes('pg_catalog.strpos(pg_catalog.lower(p.prosrc),t.token)>0'));
  assert.ok(discovery.includes("n.nspname NOT IN ('pg_catalog','information_schema')"));
  assert.ok(source.includes('SELECT * FROM candidate_all ORDER BY oid LIMIT (SELECT routines FROM limits)'));
  for(const token of ['push_content_events','content_event_id','content_publication','new_story','new_chapter','push_deliveries','new_story_enabled','new_chapter_enabled'])
   assert.ok(source.includes(`('${token}')`),token);
 });
 it('discovers attached trigger routines and all attachments of discovered functions',()=>{
  assert.ok(source.includes('FROM pg_catalog.pg_trigger t WHERE t.tgrelid IN (SELECT oid FROM relations_all)'));
  assert.ok(source.includes('OR t.tgfoid IN (SELECT oid FROM candidate_all)'));
  assert.ok(source.includes('FROM attached_triggers t WHERE t.tgfoid=p.oid'));
  for(const field of ['tgrelid','relation_schema','relation_name','tgname','tgfoid','function_schema','function_name',
   'function_argtypes','tgtype','tgenabled','tgisinternal','tgconstraint','tgargs_hex','tgattr','tgqual','tgoldtable','tgnewtable'])assert.ok(source.includes(`'${field}'`));
  assert.ok(source.includes("pg_catalog.encode(t.tgargs,'hex')"));
 });
 it('preserves routine raw metadata, argument shapes, source, config and ACL evidence',()=>{
  for(const field of ['proname','pronamespace','proowner','prolang','prokind','prosecdef','provolatile','proisstrict',
   'proleakproof','proparallel','pronargs','pronargdefaults','proargnames','proargtypes','proallargtypes','proargmodes',
   'prorettype','proretset','prosupport_oid','proconfig','proacl','prosrc','prosqlbody','proargdefaults'])assert.ok(source.includes(`'${field}'`),field);
  assert.ok(source.includes("p.lanname IN ('sql','plpgsql') AS text_language"));
  assert.ok(source.includes("'prosrc',CASE WHEN s.text_language AND NOT s.source_oversized AND NOT s.sensitive_suspected THEN p.prosrc END"));
  assert.ok(source.includes("'proconfig',CASE WHEN NOT s.config_oversized AND NOT s.sensitive_suspected THEN p.proconfig END"));
  assert.ok(source.includes("'SOURCE_WITHHELD:'"));assert.ok(source.includes("'TEXT_SOURCE_INCOMPLETE:'"));
 });
 it('includes RLS policy roles/commands and raw qualification/check nodes',()=>{
  for(const field of ['polrelid','polname','polcmd','polpermissive','polroles','polqual','polwithcheck'])assert.ok(source.includes(`'${field}'`));
  assert.ok(source.includes('p.polqual::pg_catalog.text'));assert.ok(source.includes('p.polwithcheck::pg_catalog.text'));
 });
 it('captures explicit/default function EXECUTE entries, schema/table/column ACLs and owner identities',()=>{
  for(const kind of ['relation','column','routine','schema','database','default_acl'])assert.ok(source.includes(`'${kind}'`));
  assert.ok(source.includes("COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))"));
  assert.ok(source.includes("a.grantee=0 THEN 'PUBLIC'"));
  assert.ok(source.includes('g.rolname AS grantor_name'));assert.ok(source.includes('r.rolname END AS grantee_name'));
  assert.ok(source.includes("'CREATION_TIME_DEFAULTS_NOT_RETROACTIVE_AUTHORITY'"));
  assert.ok(source.includes("'EXPLICIT_OR_BUILTIN_DEFAULT_ACL_WITH_MEMBERSHIP_EVIDENCE_NOT_RUNTIME_ROLE_SIMULATION'"));
 });
 it('captures only safe role fields and correct PG17 membership options with transitive closure',()=>{
  assert.ok(source.includes("rolname ~ '^nca_push_'"));
  for(const field of ['rolname','rolsuper','rolinherit','rolcreaterole','rolcreatedb','rolcanlogin','rolreplication','rolbypassrls'])assert.ok(source.includes(`r.${field}`),field);
  assert.ok(source.includes('m.roleid,m.member,m.grantor,m.admin_option,m.inherit_option,m.set_option'));
  assert.ok(source.includes('m.member AS source,m.roleid AS destination'));assert.ok(source.includes('UNION SELECT m.roleid,m.member'));
  assert.ok(source.includes('UNION SELECT e.destination FROM role_reach r JOIN role_edges e ON e.source=r.oid'));
  assert.doesNotMatch(source,/m\.role\b/);
 });
 it('collects outgoing/incoming dependencies, current-database shared dependencies and inert rewrite nodes',()=>{
  for(const name of ['pg_depend','pg_shdepend','pg_rewrite','pg_inherits'])assert.ok(source.includes(`pg_catalog.${name}`));
  assert.ok(source.includes('JOIN database_meta db ON db.oid=d.dbid'));
  assert.ok(source.includes('x.classid=d.classid AND x.objid=d.objid'));assert.ok(source.includes('x.classid=d.refclassid AND x.objid=d.refobjid'));
  assert.ok(source.includes('x.ev_qual::pg_catalog.text'));assert.ok(source.includes('x.ev_action::pg_catalog.text'));
 });
 it('all capped sections count full discovery and deterministically order emitted evidence',()=>{
  for(const name of ['routines','columns','constraints','indexes','triggers','policies','roles','memberships',
   'dependencies','shared_dependencies','types','acl_entries','default_acls','rewrites','descriptors'])
   assert.ok(source.includes(`LIMIT (SELECT ${name} FROM limits)`),name);
  assert.ok(source.includes("'CAP_EXCEEDED:'||c.key"));assert.ok(source.includes("'ROUTINE_CAP_EXCEEDED'"));
  assert.ok(source.includes("'DESCRIPTOR_CAP_EXCEEDED'"));assert.ok(source.includes("'OUTPUT_CAP_EXCEEDED'"));
  assert.ok(source.includes('<=l.output_bytes THEN s.j END'));
  for(const match of code.matchAll(/pg_catalog\.jsonb_agg\(/g)){
   let depth=1,i=match.index+match[0].length;
   const start=i;
   while(depth&&i<code.length){if(code[i]==='(')depth++;else if(code[i]===')')depth--;i++;}
   assert.equal(depth,0);assert.match(code.slice(start,i-1),/\bORDER BY\b/,'unordered JSON evidence');
  }
 });
 it('never confuses complete bounded catalog evidence with exhaustive discovery or verified semantics',()=>{
  assert.ok(source.includes("'catalog_evidence_complete',NOT EXISTS(SELECT 1 FROM catalog_reasons)"));
  assert.ok(source.includes("'evidence_complete',NOT EXISTS(SELECT 1 FROM reasons)"));
  assert.ok(source.includes("UNION ALL SELECT 'ROUTINE_DISCOVERY_NOT_PROVABLY_COMPLETE'"));
  assert.ok(source.includes("'routine_discovery_complete',false"));
  assert.ok(source.includes("'unrecorded_or_dynamic_or_transitive_references_proven_absent',false"));
  assert.ok(source.includes("'semantics_verified',false"));assert.ok(source.includes("'manual_review_required',true"));
  assert.ok(source.includes("'classification','RAW_EVIDENCE_REQUIRES_MANUAL_INTERPRETATION'"));
  for(const question of ['first_story_publication_timestamp','chapter_publication_timestamp','draft_edit_unpublish_republish_behavior',
   'publication_event_idempotency','publication_references_and_timestamps','publication_writers','content_event_capture',
   'content_event_lease_fanout','content_claim_prepare_finish','content_event_expiry'])assert.ok(source.includes(`'${question}'`));
 });
 it('emits one final deterministic result with explicit zero runtime counters and no authorization',()=>{
  assert.equal((source.match(/CONTENT_PUSH_RAW_CONTRACT_COLLECTOR_COMPLETE/g)||[]).length,1);
  for(const field of ['application_rows_read','runtime_rpc_calls','mutations'])assert.ok(source.includes(`'${field}',0`));
  for(const field of ['installation_authorized','production_execution_authorized'])assert.ok(source.includes(`'${field}',false`));
  assert.ok(source.includes("'transaction_read_only',pg_catalog.current_setting('transaction_read_only')='on'"));
  assert.ok(source.includes("'snapshot_timestamp',pg_catalog.statement_timestamp()"));
  assert.match(code,/SELECT\s+<literal>\s+AS marker,[\s\S]+AS diagnostic\s+FROM sections s CROSS JOIN limits l;\s+ROLLBACK;/);
 });
});
