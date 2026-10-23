'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const migration=fs.readFileSync('database/migrations/20261023_content_push_fanout_runtime_bridge.sql','utf8');
const collector=fs.readFileSync('database/verification/20261023_content_push_fanout_runtime_bridge_collector.sql','utf8');
const fn=name=>migration.match(new RegExp('CREATE FUNCTION public\\.'+name+'[\\s\\S]*?AS \\$fn\\$([\\s\\S]*?)\\$fn\\$;'))?.[1];
const canon=s=>s.replace(/\r\n/g,'\n').replace(/\r/g,'\n');

test('bridge is a separate fail-closed transaction with an explicit no-password runner',()=>{
 assert.match(migration,/^BEGIN;[\s\S]*SELECT 'CONTENT_PUSH_FANOUT_RUNTIME_BRIDGE_INSTALLED' AS result;\s*COMMIT;\s*$/);
 assert.match(migration,/CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'/);
 assert.match(migration,/current_setting\('server_version_num'\)<>'170011'/);
 assert.match(migration,/CREATE ROLE nca_push_fanout_runner LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS\s+NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD NULL/);
 assert.match(migration,/nca_push_fanout_runner.*roleid=runner|roleid=runner.*nca_push_fanout_runner/s);
 assert.match(migration,/NCA_FANOUT_BRIDGE_RUNNER_MEMBERSHIP/);
 assert.match(migration,/NCA_FANOUT_BRIDGE_RELATION_PRIVILEGE/);
 assert.match(migration,/NCA_FANOUT_BRIDGE_DIRECT_EXECUTE/);
 assert.match(migration,/NCA_FANOUT_BRIDGE_FANOUT_BOUNDARY/);
 assert.doesNotMatch(migration,/CREATE OR REPLACE|ALTER ROLE|PASSWORD\s+'[^']+'/i);
});

test('wrappers are fixed SECURITY DEFINER delegates with bounded settings and newline-only source fingerprints',()=>{
 const expected={nca_runner_claim_content_push_events:'c9166747a4412ac9341898bc4951de0c',
  nca_runner_fanout_content_push_event_page:'477ca15b8dad2e2e56215e0c11a1eebb'};
 assert.equal((migration.match(/CREATE FUNCTION public\.nca_runner_/g)||[]).length,2);
 for(const [name,hash] of Object.entries(expected)){
  const body=fn(name);assert.ok(body,name);assert.equal(createHash('md5').update(canon(body)).digest('hex'),hash,name);
  assert.equal(createHash('md5').update(canon(body.replace(/\n/g,'\r\n'))).digest('hex'),hash,name+' CRLF');
  assert.notEqual(createHash('md5').update(canon(body.replace('SELECT','SELECT '))).digest('hex'),hash,name+' substantive edit');
  const decl=migration.match(new RegExp('CREATE FUNCTION public\\.'+name+'[\\s\\S]*?AS \\$fn\\$'))[0];
  for(const part of ['LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=\'\' SET lock_timeout=\'2s\' SET statement_timeout=\'5s\''])assert(decl.includes(part));
 }
 assert.match(migration,/md5\(pg_catalog\.replace\(pg_catalog\.replace\(r\.prosrc,E'\\r\\n',E'\\n'\),E'\\r',E'\\n'\)\)/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.nca_runner_claim_content_push_events\(integer\) TO nca_push_fanout_runner/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.nca_runner_fanout_content_push_event_page\(bigint,uuid,integer\) TO nca_push_fanout_runner/);
});

test('bridge final verifier preserves all six base routines and the original fanout role ACL boundary',()=>{
 for(const token of ['nca_capture_content_first_publication','nca_claim_content_push_events','nca_fanout_content_push_event_page',
  'nca_finish_content_push_delivery','nca_claim_content_push_deliveries','nca_prepare_content_push_delivery',
  'NCA_FANOUT_BRIDGE_BASE_ROUTINE_DRIFT','NCA_FANOUT_BRIDGE_BASE_ROUTINE_COUNT',
  'NCA_FANOUT_BRIDGE_UNRELATED_EXECUTE',
  'NOT rolcanlogin AND NOT rolinherit','member<>installer','a.is_grantable',
  'NOT pg_catalog.has_function_privilege(runner,'])assert(migration.includes(token),token);
 assert.match(migration,/allowed:=CASE WHEN r\.proname IN \('nca_claim_content_push_events','nca_fanout_content_push_event_page'\) THEN fanout/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.nca_runner_claim_content_push_events[^;]*FROM PUBLIC,anon,authenticated,service_role,authenticator,nca_push_api,nca_push_sender,nca_push_fanout,nca_push_fanout_runner/);
});

test('bridge verifier pins exact argument and return types for all six base routines',()=>{
 const signatures={nca_capture_content_first_publication:'',nca_claim_content_push_events:'23',
  nca_fanout_content_push_event_page:'20 2950 23',nca_finish_content_push_delivery:'2950 2950 25',
  nca_claim_content_push_deliveries:'23',nca_prepare_content_push_delivery:'2950 2950'};
 for(const [name,args] of Object.entries(signatures))
  assert.ok(migration.includes(`(r.proname='${name}' AND r.proargtypes::pg_catalog.text IS DISTINCT FROM '${args}')`),name);
 assert.match(migration,/r\.proname='nca_capture_content_first_publication' AND r\.prorettype IS DISTINCT FROM 'pg_catalog\.trigger'::pg_catalog\.regtype/);
 assert.match(migration,/r\.proname<>'nca_capture_content_first_publication' AND r\.prorettype IS DISTINCT FROM 'pg_catalog\.jsonb'::pg_catalog\.regtype/);
});

test('collector is read-only, catalog-only, bounded, and returns deterministic evidence plus completion marker',()=>{
 assert.match(collector,/^BEGIN;\s*SET TRANSACTION READ ONLY;/);
 assert.match(collector,/statement_timeout='5s'/);assert.match(collector,/lock_timeout='2s'/);
 assert.match(collector,/CONTENT_PUSH_FANOUT_RUNTIME_BRIDGE_COLLECTOR_COMPLETE/);assert.match(collector,/ROLLBACK;\s*$/);
 assert.match(collector,/runner_role/);assert.match(collector,/runner_memberships/);assert.match(collector,/runner_relations/);
 assert.match(collector,/wrappers/);assert.match(collector,/underlying_fanout_routines/);assert.match(collector,/relevant_dependencies/);
 const executable=collector.replace(/'(?:''|[^'])*'/g,"''");
 assert.doesNotMatch(executable,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|CALL|PERFORM)\b/i);
 assert.doesNotMatch(collector,/SELECT\s+(?:public\.)?nca_(?:runner_)?(?:claim|fanout)/i);
});
