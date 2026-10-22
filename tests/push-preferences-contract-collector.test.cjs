'use strict';
// Static only: no SQL client, database connection, network or application import.
const {describe,it}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../database/verification/20261022_push_preferences_contract_collector.sql'),'utf8');

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
  assert.notEqual(text[i],'$','no executable dollar quoting');
  assert.notEqual(text[i],'"','no executable quoted identifiers');
  out+=text[i++];
 }
 return out;
}
const code=executable(source);
const catalogs=new Set(['pg_class','pg_namespace','pg_attribute','pg_attrdef','pg_constraint','pg_policy',
 'pg_depend','pg_proc','pg_language','pg_roles','pg_auth_members','pg_type','pg_index',
 'pg_default_acl','pg_shdepend','pg_database']);
const functions=new Set(['lower','btrim','octet_length','unnest','aclexplode','acldefault','jsonb_build_object',
 'jsonb_agg','to_jsonb','count','statement_timestamp','current_setting','current_database']);

describe('raw push preference catalog collector static contract',()=>{
 it('one read-only transaction with bounded local settings and final rollback',()=>{
  const statements=code.split(';').map(x=>x.trim()).filter(Boolean);
  assert.equal(statements.length,9);
  assert.equal(statements[0],'BEGIN');assert.equal(statements[1],'SET TRANSACTION READ ONLY');
  assert.match(statements[7],/^WITH RECURSIVE\b/);assert.equal(statements[8],'ROLLBACK');
  for(const [setting,value] of [['search_path',''],['statement_timeout','15s'],['lock_timeout','2s'],
   ['idle_in_transaction_session_timeout','20s'],['transaction_timeout','30s']])
   assert.ok(source.includes(`SET LOCAL ${setting} = '${value}';`));
 });
 it('has no mutation, dynamic execution, impersonation, row locks or backend controls',()=>{
  assert.doesNotMatch(code,/\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO|EXECUTE|COPY|PREPARE|LOCK|LISTEN|NOTIFY|VACUUM|ANALYZE|INTO|COMMENT|LABEL)\b/i);
  assert.doesNotMatch(code,/SET\s+(LOCAL\s+)?(ROLE|SESSION AUTHORIZATION)|FOR\s+(SHARE|UPDATE)|pg_(cancel_backend|terminate_backend|sleep|advisory|reload_conf|notify)/i);
  assert.doesNotMatch(code,/\bpublic\s*\.|\bnca_\w*\s*\(/i);
 });
 it('all qualified row sources are approved catalogs, never application relations',()=>{
  const sources=[...code.matchAll(/\b(?:FROM|JOIN)\s+(?:LATERAL\s+)?(\w+)\.(\w+)/gi)];
  assert.ok(sources.length>20);
  for(const [,schema,name] of sources)assert.ok(schema==='pg_catalog'&&(catalogs.has(name)||functions.has(name)),`${schema}.${name}`);
  assert.doesNotMatch(code,/pg_authid|pg_shadow|information_schema|dblink|postgres_fdw/i);
  assert.ok(source.includes("n.nspname='public'"));
  assert.ok(source.includes("JOIN schema_meta n ON n.oid=c.relnamespace\n WHERE c.relname='push_preferences'"));
 });
 it('only approved builtins can be called and the checker rejects an app call',()=>{
  const validate=text=>{
   for(const [,schema,name] of text.matchAll(/\b(\w+)\.(\w+)\s*\(/g))
    assert.ok(schema==='pg_catalog'&&functions.has(name),`${schema}.${name}`);
  };
  validate(code);
  assert.throws(()=>validate('SELECT public.nca_set_push_preferences(1)'));
  assert.throws(()=>validate('SELECT pg_catalog.pg_terminate_backend(1)'));
 });
 it('discovery scans every public candidate before a deterministic cap',()=>{
  const discovery=source.slice(source.indexOf('candidate_all AS MATERIALIZED'),source.indexOf('default_acls_all AS MATERIALIZED'));
  assert.ok(discovery.includes('JOIN schema_meta n ON n.oid=p.pronamespace'));
  assert.doesNotMatch(discovery.slice(0,discovery.indexOf('candidates AS MATERIALIZED')),/\bLIMIT\b/);
  assert.ok(discovery.includes("LIKE '%push%'"));assert.ok(discovery.includes("LIKE '%prefer%'"));
  assert.ok(discovery.includes("'(^|[^a-z0-9_$])push_preferences([^a-z0-9_$]|$)'"));
  assert.ok(discovery.includes('FROM relation_edges d WHERE d.objid=p.oid'));
  assert.ok(discovery.includes('SELECT * FROM candidate_all ORDER BY oid LIMIT'));
  assert.ok(source.includes("relname='pg_type') AND d.refobjid=t.reltype"));
  assert.ok(source.includes("'discovery_outside_rule_proven_absent',false"));
 });
 it('uses no executable deparsers, formatted identity casts or privilege re-resolution',()=>{
  assert.doesNotMatch(code,/pg_get_|format_type|regprocedure|regtype|regrole|regclass|has_(function|table|column|schema)_privilege/);
  for(const field of ['executable_deparsers_used','function_definitions_collected'])assert.ok(source.includes(`'${field}',false`));
  for(const [,cast] of code.matchAll(/::pg_catalog\.(\w+)/g))assert.ok(['text','oid','int2','jsonb'].includes(cast),cast);
  assert.doesNotMatch(source,/REQUIRED_DEPARSED_DEFINITIONS_NOT_COLLECTED/);
 });
 it('captures exact raw relation, attribute/default, constraint and policy fields',()=>{
  for(const field of ['oid','relname','relowner','relrowsecurity','relforcerowsecurity','relacl',
   'attnum','attname','atttypid','atttypmod','attnotnull','atthasdef','attidentity','attgenerated',
   'attrdef_oid','adrelid','adnum','adbin','conname','contype','conkey','confkey','confrelid',
   'condeferrable','condeferred','convalidated','polcmd','polroles','polpermissive','polqual','polwithcheck'])
   assert.ok(source.includes(`'${field}'`),field);
  assert.ok(source.includes('d.adbin::pg_catalog.text'));
  assert.ok(source.includes('c.conbin::pg_catalog.text'));
 });
 it('captures raw index identity, key/uniqueness flags and expression nodes',()=>{
  assert.ok(source.includes('FROM pg_catalog.pg_index i JOIN target t ON t.oid=i.indrelid'));
  for(const field of ['indexrelid','indrelid','indisunique','indisprimary','indnullsnotdistinct','indkey','indclass',
   'indcollation','indoption','indisvalid','indisready','indexprs','indpred'])assert.ok(source.includes(`'${field}'`),field);
 });
 it('preserves raw routine headers, source and raw type/language identities',()=>{
  for(const field of ['oid','proname','pronamespace','proowner','prolang','prokind','provolatile','proparallel',
   'proisstrict','prosecdef','proleakproof','proretset','prorettype','pronargs','pronargdefaults',
   'proargtypes','proallargtypes','proargmodes','proargnames','proconfig','proacl','prosrc','probin',
   'prosqlbody','proargdefaults','protrftypes'])assert.ok(source.includes(`'${field}',p.${field}`),field);
  assert.ok(source.includes('JOIN pg_catalog.pg_type t ON t.oid=x.oid'));
  assert.ok(source.includes('JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace'));
  assert.ok(source.includes('LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang'));
  assert.ok(source.includes("'protransform_catalog_field_available',false"));
 });
 it('marks unsupported source representations incomplete without deparsing',()=>{
  for(const check of ["p.lanname IN ('sql','plpgsql')",'p.prosqlbody IS NULL','p.probin IS NULL',
   "pg_catalog.btrim(p.prosrc)<>''",'source_evidence_complete','SOURCE_REPRESENTATION_INCOMPLETE:'])assert.ok(source.includes(check));
  assert.ok(source.includes("'prosqlbody',p.prosqlbody::pg_catalog.text"));
  assert.ok(source.includes("'TEXT_SQL_OR_PLPGSQL_BODY_AND_BUILTIN_SIGNATURE_NOT_TRANSITIVE_SEMANTICS'"));
 });
 it('preserves raw ACL/default ACL evidence and bidirectional PG17 memberships',()=>{
  for(const value of ['pg_catalog.aclexplode','pg_catalog.acldefault',"a.grantee=0 THEN 'PUBLIC'",
   'm.roleid,m.member,m.grantor,m.admin_option,m.inherit_option,m.set_option',
   'FROM pg_catalog.pg_default_acl a','a.defaclrole','a.defaclnamespace','x.defaclobjtype','r.rolsuper','r.rolinherit','r.rolbypassrls',
   "'anon','authenticated','service_role','authenticator','nca_push_api','postgres'"])
   assert.ok(source.includes(value),value);
  assert.doesNotMatch(code,/rolpassword|rolsecret/);
  assert.ok(source.includes('m.member AS source,m.roleid AS destination'));
  assert.ok(source.includes('UNION SELECT m.roleid,m.member FROM pg_catalog.pg_auth_members m'));
  assert.ok(source.includes('JOIN role_edges e ON e.source=r.oid'));
  assert.ok(source.includes("'CREATION_TIME_DEFAULTS_NOT_RETROACTIVE_EXISTING_OBJECT_AUTHORITY'"));
  assert.ok(source.includes("'proacl_is_null',p.proacl IS NULL"));

 });
 it('fails collection completeness on missing/capped/omitted evidence and never claims semantics',()=>{
  for(const reason of ['RELATION_MISSING_OR_UNSUPPORTED','NO_CANDIDATE_ROUTINES','CANDIDATE_CAP_EXCEEDED',
   'COLUMN_CAP_EXCEEDED','CONSTRAINT_CAP_EXCEEDED','INDEX_CAP_EXCEEDED','POLICY_CAP_EXCEEDED','ROLE_CAP_EXCEEDED',
   'MEMBERSHIP_CAP_EXCEEDED','DEPENDENCY_CAP_EXCEEDED','SHARED_DEPENDENCY_CAP_EXCEEDED',
   'TYPE_CAP_EXCEEDED','DEFAULT_ACL_CAP_EXCEEDED','ACL_CAP_EXCEEDED','OUTPUT_CAP_EXCEEDED'])assert.ok(source.includes(`'${reason}'`));
  assert.ok(source.includes("'evidence_complete',NOT EXISTS(SELECT 1 FROM reasons)"));
  assert.ok(source.includes("'semantics_verified',false"));assert.ok(source.includes("'manual_review_required',true"));
  assert.ok(source.includes("'COMPLETE_RAW_CATALOG_EVIDENCE_UNDER_STATED_RULE_NOT_VERIFIED_SEMANTICS'"));
  assert.ok(source.includes('<=l.output_bytes THEN s.j END'));
 });
 it('collects bounded raw ordinary/shared dependencies in the current database only',()=>{
  assert.ok(source.includes('FROM pg_catalog.pg_depend d'));
  assert.ok(source.includes('FROM pg_catalog.pg_shdepend d'));
  assert.ok(source.includes('db.oid=d.dbid AND db.datname=pg_catalog.current_database()'));
  for(const key of ['dependencies','shared_dependencies','catalog_ids'])assert.ok(source.includes(`'${key}'`)||source.includes(`AS ${key}`));
  assert.ok(source.includes("relname='pg_proc') AND d.objid IN (SELECT oid FROM candidate_all)"));
 });
 it('emits one explicit safety marker and counters with no runtime authorization',()=>{
  assert.equal((source.match(/PUSH_PREFERENCES_RAW_CONTRACT_COLLECTOR_COMPLETE/g)||[]).length,1);
  for(const field of ['runtime_rpc_calls','application_rows_read','mutations'])assert.ok(source.includes(`'${field}',0`));
  for(const field of ['production_execution_authorized','installation_authorized','transport_authorized'])assert.ok(source.includes(`'${field}',false`));
  for(const field of ['relation_catalog_collected','candidate_discovery_complete_under_stated_rule','raw_routine_metadata_collected',
   'raw_routine_source_collected','raw_contract_evidence_collected','function_definitions_collected',
   'acl_evidence_collected','dependency_evidence_collected','snapshot_timestamp','incomplete_reasons'])assert.ok(source.includes(`'${field}'`));
 });
});
