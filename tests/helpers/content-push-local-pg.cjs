'use strict';
// Dedicated existing network-none scratch only. Never inherit DB credentials.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync,spawn}=require('node:child_process');
const socket='/tmp/nca-pg17-guard-witness-62kuw392/socket';
const client='/tmp/nca-pg17-guard-witness-62kuw392/bin/psql';
const env={PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',HOME:'/nonexistent-nca-content-test',
 PGPASSFILE:'/dev/null',PGSERVICEFILE:'/dev/null',PGSYSCONFDIR:'/nonexistent-nca-content-test',PGCONNECT_TIMEOUT:'3',PGAPPNAME:'nca_content_local'};
function args(user){
 assert(path.isAbsolute(socket)&&!socket.includes(',')&&!socket.startsWith('//')&&!socket.includes('\0'));
 assert(fs.statSync(path.join(socket,'.s.PGSQL.5432')).isSocket());assert(/^[a-z_][a-z0-9_]*$/.test(user));
 const adapter=fs.readFileSync(client,'utf8');assert(adapter.includes('--host=unix:///var/run/docker.sock'));assert(adapter.includes('nca-pg17-guard-witness env -i'));
 return ['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h',socket,'-p','5432','-d','nca_guard_witness','-U',user];
}
const roles='nca_push_sender,nca_push_fanout,nca_push_api,postgres,anon,authenticated,service_role,authenticator';
function localPG(){
 const inspect=spawnSync('docker',['--host=unix:///var/run/docker.sock','inspect','--format','{{.HostConfig.NetworkMode}}','nca-pg17-guard-witness'],{env,encoding:'utf8'});
 assert.equal(inspect.status,0);assert.equal(inspect.stdout.trim(),'none');
 function run(text,user='nca_guard_witness_admin',ok=true){
  const r=spawnSync(client,args(user),{input:text,env,encoding:'utf8',timeout:25000,maxBuffer:4e6});assert.ifError(r.error);if(ok)assert.equal(r.status,0,r.stderr);return r;
 }
 const q=(text,user)=>{
  const value=run(text,user).stdout.trim();
  if(value==='')return null;if(value==='t')return true;if(value==='f')return false;
  try{return JSON.parse(value);}catch{return value;}
 };
 assert.deepEqual(q("SELECT json_build_object('version',current_setting('server_version_num'),'local',inet_server_addr() IS NULL,'db',current_database(),'user',current_user);"),
  {version:'170011',local:true,db:'nca_guard_witness',user:'nca_guard_witness_admin'});
 return {run,q,bootstrap(){
  assert.equal(q("SELECT count(*) FROM pg_roles WHERE rolname IN ('postgres','nca_push_sender','nca_push_fanout','nca_push_api','anon','authenticated','service_role','authenticator');"),0);
  assert.equal(q("SELECT count(*) FROM pg_namespace WHERE nspname='auth';"),0);
  let grants='';for(const sig of ['nca_claim_personal_push_deliveries(integer)','nca_prepare_personal_push_delivery(uuid,uuid)','nca_finish_personal_push_delivery(uuid,uuid,text)'])
   grants+=`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC,anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION public.${sig} TO nca_push_sender;`;
  run('BEGIN;'+fs.readFileSync('tests/helpers/content-push-foundation.sql','utf8')+fs.readFileSync('tests/helpers/personal-push-sender-baseline.sql','utf8')+grants+'COMMIT;');
 },cleanup(){
  run(`DROP OWNED BY ${roles} CASCADE; DROP ROLE ${roles};`);
  assert.equal(q("SELECT count(*) FROM pg_namespace WHERE nspname='auth';"),0);
  assert.equal(q("SELECT count(*) FROM pg_roles WHERE rolname IN ('postgres','nca_push_sender','nca_push_fanout','nca_push_api');"),0);
 },concurrent(text){
  const child=spawn(client,args('nca_guard_witness_admin'),{env,stdio:['pipe','pipe','pipe']});
  let output='',errors='',readyResolve,readyReject;
  const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
  child.stdout.on('data',b=>{output+=b;if(output.includes('BARRIER_READY'))readyResolve();});child.stderr.on('data',b=>errors+=b);
  const timer=setTimeout(()=>{readyReject(Error('LOCAL_BARRIER_TIMEOUT'));child.kill();},5000);
  const done=new Promise((r,j)=>{child.on('error',e=>{readyReject(e);j(e);});child.on('close',code=>{clearTimeout(timer);if(code){const e=Error(errors);readyReject(e);j(e);}else r(output);});});
  done.catch(()=>{});child.stdin.end(text);return {ready,done};
 }};
}
module.exports={localPG};
