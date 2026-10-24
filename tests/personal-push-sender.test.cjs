'use strict';
const {describe,it,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createECDH,randomBytes}=require('node:crypto');
const {EventEmitter}=require('node:events');
const https=require('node:https'),net=require('node:net');
// All runtime network boundaries are fakes; unexpected use fails immediately.
const originalRequest=https.request,originalConnect=net.connect;
let accidental=0;
before(()=>{https.request=()=>{accidental++;throw Error('REAL_NETWORK_FORBIDDEN');};net.connect=()=>{accidental++;throw Error('REAL_NETWORK_FORBIDDEN');};});
after(()=>{https.request=originalRequest;net.connect=originalConnect;assert.equal(accidental,0);});
const {vapidConfig,validateSubscription,createTransport}=require('../server/personal-push-transport.cjs');
const {databaseConfig,createDatabase}=require('../server/personal-push-db.cjs');
const {runWorker,payloadFor}=require('../server/personal-push-worker.cjs');
const {createHandler}=require('../api/personal-push-worker');
// Disposable test-only crypto material, generated in memory and never printed.
const key=createECDH('prime256v1');key.generateKeys();
const testCA=require('./helpers/personal-push-test-ca.cjs');
const env={NCA_PUSH_SENDER_CA_CERT_B64:testCA.base64,NCA_PERSONAL_PUSH_WORKER_ENABLED:'true',NCA_PUSH_WORKER_SECRET:'s'.repeat(48),NCA_PUSH_SENDER_DATABASE_URL:'postgresql://nca_push_sender.cwwulyrutdvuekydydew:test-only@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',NCA_PUSH_VAPID_PUBLIC_KEY:key.getPublicKey().toString('base64url'),NCA_PUSH_VAPID_PRIVATE_KEY:key.getPrivateKey().toString('base64url'),NCA_PUSH_VAPID_SUBJECT:'mailto:push@example.invalid'};
const sub=()=>({endpoint:'https://fcm.googleapis.com/fcm/send/test-only',keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}});
const item={delivery_id:'00000000-0000-4000-8000-000000000001',lease_token:'00000000-0000-4000-8000-000000000002'};
const notification={id:'9007199254740993',category:'comment_like',story_id:'1',chapter_id:null,comment_id:'9223372036854775807'};
const ready=()=>({status:'ready',notification,subscription:sub(),lease_remaining_ms:85000,event_remaining_seconds:600});
function mockedDB(overrides={}){let c=0;const calls=[];return {calls,claim:async n=>{calls.push(['claim',n]);return {status:'ok',deliveries:c++===0?[item]:[]};},prepare:async(...p)=>{calls.push(['prepare',...p]);return ready();},finish:async(...p)=>{calls.push(['finish',...p]);return {status:p[2]==='sent'?'sent':p[2].includes('subscription')?'failed':'pending'};},close:async()=>{calls.push(['close']);},...overrides};}
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;}};}
function fakeRequest(status,{error=false,hang=false,oversize=false}={}){const calls=[];let destroyed=0;const request=(url,options,cb)=>{calls.push({url,options});const req=new EventEmitter();req.destroy=()=>{destroyed++;};req.end=body=>{assert.ok(Buffer.isBuffer(body));if(hang)return;queueMicrotask(()=>{if(error){req.emit('error',Error('secret must not escape'));return;}const res=new EventEmitter();res.statusCode=status;res.resume=()=>{res.emit('data',Buffer.alloc(oversize?20000:0));res.emit('end');};cb(res);});};return req;};return {request,calls,get destroyed(){return destroyed;}};}

describe('Explicit sender CA trust, offline only',()=>{
 const encode=s=>Buffer.from(s).toString('base64');
 it('pins the exact decoded single CA without startup/filesystem TLS fallback',()=>{
  for(const pem of [testCA.pem,testCA.pem.trimEnd(),testCA.pem.replace(/\n/g,'\r\n')]){
   const config=databaseConfig({...env,NCA_PUSH_SENDER_CA_CERT_B64:encode(pem)});
   assert.equal(config.ssl.rejectUnauthorized,true);assert.ok(config.ssl.ca===pem);
   const client=new config.Client(config);assert.equal(client.ssl.rejectUnauthorized,true);assert.ok(client.ssl.ca===pem);
  }
 });
 const invalid=[['missing',undefined],['empty',''],['non-string',{}],['leading space',' '+testCA.base64],['trailing newline',testCA.base64+'\n'],['embedded whitespace',testCA.base64.slice(0,8)+'\t'+testCA.base64.slice(8)],['invalid alphabet','!!!!'],['extra padding',testCA.base64+'='],['oversized','A'.repeat(16388)],['two certificates',encode(testCA.pem+testCA.pem)],['prefix junk',encode('junk\n'+testCA.pem)],['suffix junk',encode(testCA.pem+'junk')],['extra blank line',encode(testCA.pem+'\n')],['control character',encode(testCA.pem.replace('\n','\n\x00'))],['BOM',encode('\uFEFF'+testCA.pem)],['invalid UTF8',Buffer.concat([Buffer.from([255]),Buffer.from(testCA.pem)]).toString('base64')],['not a certificate',encode('not a certificate')],['wrong PEM type',encode(testCA.pem.replaceAll('CERTIFICATE','PRIVATE KEY'))],['invalid DER',encode('-----BEGIN CERTIFICATE-----\nVEVTVA==\n-----END CERTIFICATE-----\n')]];
 for(const [label,value] of invalid)it('rejects '+label+' CA with a content-free error before connection',()=>{
  let error;try{databaseConfig({...env,NCA_PUSH_SENDER_CA_CERT_B64:value});}catch(e){error=e;}
  assert.ok(error);assert.equal(error.message,'INVALID_SENDER_CA_CERT');
  assert.ok(!error.stack.includes(testCA.base64)&&!error.stack.includes(testCA.pem));
 });
 it('rejects unused padding bits even when permissive base64 decoding yields the same PEM',()=>{
  let pem=testCA.pem;while(Buffer.byteLength(pem)%3===0)pem=pem.slice(0,-1);
  const canonical=encode(pem),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',at=canonical.indexOf('=')-1;
  const alias=canonical.slice(0,at)+alphabet[alphabet.indexOf(canonical[at])+1]+canonical.slice(at+1);
  assert.ok(Buffer.from(alias,'base64').equals(Buffer.from(canonical,'base64')));
  assert.throws(()=>databaseConfig({...env,NCA_PUSH_SENDER_CA_CERT_B64:alias}),/^Error: INVALID_SENDER_CA_CERT$/);
 });
 it('rejects DER trailing data hidden inside a syntactically single certificate block',()=>{
  const body=testCA.pem.split('\n').slice(1,-2).join('');
  const der=Buffer.concat([Buffer.from(body,'base64'),Buffer.from('junk')]).toString('base64');
  assert.throws(()=>databaseConfig({...env,NCA_PUSH_SENDER_CA_CERT_B64:encode('-----BEGIN CERTIFICATE-----\n'+der+'\n-----END CERTIFICATE-----\n')}),/^Error: INVALID_SENDER_CA_CERT$/);
 });
 it('invalid CA fails the authenticated worker boundary without initialization or disclosure',async()=>{
  let initialized=0;const res=response();await createHandler({env:{...env,NCA_PUSH_SENDER_CA_CERT_B64:testCA.base64+'!'},database:()=>{initialized++;}})({method:'POST',headers:{authorization:'Bearer '+env.NCA_PUSH_WORKER_SECRET},body:{}},res);
  assert.equal(res.code,503);assert.equal(initialized,0);assert.deepEqual(res.body,{ok:false});
 });
});

describe('Personal sender config and server boundary',()=>{
 it('requires environment-only matching VAPID pair and valid subject',()=>{assert.equal(vapidConfig(env).publicKey,env.NCA_PUSH_VAPID_PUBLIC_KEY);for(const name of ['NCA_PUSH_VAPID_PUBLIC_KEY','NCA_PUSH_VAPID_PRIVATE_KEY','NCA_PUSH_VAPID_SUBJECT'])assert.throws(()=>vapidConfig({...env,[name]:''}));assert.throws(()=>vapidConfig({...env,NCA_PUSH_VAPID_PRIVATE_KEY:randomBytes(32).toString('base64url')}));});
 it('accepts only the approved Session routing profile with verified TLS and bounded queries',()=>{const c=databaseConfig(env);assert.equal(c.user,'nca_push_sender.cwwulyrutdvuekydydew');assert.equal(c.host,'aws-0-ap-northeast-2.pooler.supabase.com');assert.equal(c.port,5432);assert.equal(c.database,'postgres');assert.equal(c.ssl.rejectUnauthorized,true);assert.ok(c.ssl.ca===testCA.pem);assert.equal(c.max,1);assert.equal(c.query_timeout,7000);assert.equal(c.connectionTimeoutMillis,2000);assert.equal(c.statement_timeout,undefined);assert.equal(c.options,undefined);assert.equal(c.replication,undefined);});
 it('disabled route and unauthenticated browser never initialize DB/transport',async()=>{let creates=0;const factory=()=>{creates++;throw Error();};for(const [e,req,code] of [[{}, {method:'POST',headers:{}},401],[env,{method:'GET',headers:{}},405],[env,{method:'POST',headers:{}},401],[env,{method:'POST',headers:{authorization:'Bearer wrong'}},401]]){const res=response();await createHandler({env:e,database:factory,transport:factory})(req,res);assert.equal(res.code,code);}assert.equal(creates,0);});
 it('rejects supplied parameters; valid authorized route returns aggregate counters only and closes DB',async()=>{let db;const h=createHandler({env,database:()=>db=mockedDB(),transport:()=>({send:async()=> 'sent'})});let res=response();await h({method:'POST',headers:{authorization:'Bearer '+env.NCA_PUSH_WORKER_SECRET},body:{recipient:'arbitrary'}},res);assert.equal(res.code,400);assert.equal(db,undefined);res=response();await h({method:'POST',headers:{authorization:'Bearer '+env.NCA_PUSH_WORKER_SECRET},body:{}},res);assert.equal(res.code,200);assert.equal(res.body.result.sent,1);assert.equal(res.headers['Cache-Control'],'no-store');assert.deepEqual(db.calls.at(-1),['close']);assert.ok(!JSON.stringify(res.body).includes(notification.id));});
 it('invalid configuration and worker DB failure expose no raw errors or secrets',async()=>{for(const e of [{...env,NCA_PUSH_VAPID_PUBLIC_KEY:''},env]){const h=createHandler({env:e,database:()=>mockedDB({claim:async()=>{throw Error('PRIVATE_ENDPOINT_AND_PASSWORD');}}),transport:()=>({send:async()=> 'sent'})});const res=response();await h({method:'POST',headers:{authorization:'Bearer '+env.NCA_PUSH_WORKER_SECRET}},res);assert.equal(res.code,503);assert.ok(!JSON.stringify(res.body).includes('PRIVATE'));}});
});

// No real Pool/client connection: checkout and all SQL replies are controlled here.
function adapterFixture({identity={current_user:'nca_push_sender',session_user:'nca_push_sender'},settings={},failAt=0,holdAt=0}={}) {
 const calls=[],clients=[];let unblock;
 function makeClient(){const client={calls:0,async query(sql,args){calls.push([sql,args]);client.calls++;if(client.calls===holdAt)await new Promise(resolve=>{unblock=resolve;});if(client.calls===failAt)throw Error('TEST_PRIVATE_DB_FAILURE');if(sql.startsWith('SELECT current_user'))return {rows:[identity]};if(sql.startsWith('SET '))return {};if(sql.startsWith('SELECT pg_catalog.current_setting'))return {rows:[{statement_timeout:'5s',search_path:'pg_catalog',read_only:'off',application_name:'nca_personal_push_sender',...settings}]};return {rows:[{result:{status:'ok'}}]};},release(destroy){calls.push(['release',destroy]);if(destroy)current=null;}};clients.push(client);return client;}
 let current=null;
 class Pool {constructor(config){this.config=config;}on(){}async connect(){return current||(current=makeClient());}async end(){calls.push(['end']);}}
 return {db:createDatabase(databaseConfig(env),Pool),calls,clients,replace(){current=null;},unblock(){unblock();}};
}

describe('Session pooler connection contract, mocked boundaries only',()=>{
 const good=env.NCA_PUSH_SENDER_DATABASE_URL;
 const invalid=[
  ['postgres protocol alias',good.replace('postgresql:','postgres:')],
  ['old direct URI','postgresql://nca_push_sender:test-only@db.cwulyrutdvuekydydew.supabase.co:5432/postgres'],
  ['direct host with approved wire user',good.replace('aws-0-ap-northeast-2.pooler.supabase.com','db.cwulyrutdvuekydydew.supabase.co')],
  ['wrong pooler region',good.replace('ap-northeast-2','ap-southeast-1')],
  ['wrong nontransaction port',good.replace(':5432/',':5433/')],
  ['missing password field',good.replace(':test-only@','@')],
  ['unsuffixed user',good.replace('.cwwulyrutdvuekydydew:',':')],
  ['wrong project',good.replace('.cwwulyrutdvuekydydew:','.other_project:')],
  ['multiple suffixes',good.replace('.cwwulyrutdvuekydydew:','.cwwulyrutdvuekydydew.extra:')],
  ['encoded routing user',good.replace('nca_push_sender.','nca_push_sender%2e')],
  ['admin routing user',good.replace('nca_push_sender.','postgres.')],
  ['other host',good.replace('aws-0-ap-northeast-2','aws-1-ap-northeast-2')],
  ['lookalike host',good.replace('supabase.com','supabase.com.evil.invalid')],
  ['host list',good.replace('.com:5432','.com,remote.invalid:5432')],
  ['transaction port',good.replace(':5432/',':6543/')],
  ['implicit port',good.replace(':5432/','/')],
  ['wrong database',good.replace('/postgres','/scratch')],
  ['encoded database',good.replace('/postgres','/%70ostgres')],
  ['TLS option',good+'?sslmode=disable'],['empty query',good+'?'],
  ['startup option',good+'?options=-c%20role=postgres'],['fragment',good+'#ignored'],['empty fragment',good+'#'],
  ['empty password',good.replace('test-only','')],['NUL password',good.replace('test-only','%00')],
  ['URI newline',good+'\n'],['non PostgreSQL protocol',good.replace('postgresql:','https:')]
 ];
 for(const [label,url] of invalid)it('rejects '+label+' before constructing a connection',()=>{assert.throws(()=>databaseConfig({...env,NCA_PUSH_SENDER_DATABASE_URL:url}));});
 it('reserved password characters remain password data, never connection options',()=>{const c=databaseConfig({...env,NCA_PUSH_SENDER_DATABASE_URL:good.replace('test-only','test%40%3A%2F%3F%23%25')});assert.equal(c.password,'test@:/?#%');assert.equal(c.host,'aws-0-ap-northeast-2.pooler.supabase.com');});
 it('pinned JS Client emits only approved wire identity/database despite inherited PG settings',()=>{const inherited={PGUSER:'postgres',PGPASSWORD:'TEST_INHERITED',PGDATABASE:'other',PGHOST:'remote.invalid',PGPORT:'6543',PGSSLMODE:'no-verify',PGOPTIONS:'-c role=postgres -c search_path=public',PGREPLICATION:'database',PGAPPNAME:'untrusted',PGCLIENT_ENCODING:'SQL_ASCII',PGCONNECT_TIMEOUT:'99'};const saved={};for(const [k,v] of Object.entries(inherited)){saved[k]=process.env[k];process.env[k]=v;}try{const c=databaseConfig(env),client=new c.Client(c);assert.deepEqual(client.getStartupConf(),{user:c.user,database:'postgres'});assert.equal(client.host,c.host);assert.equal(client.port,5432);assert.equal(client.password,'test-only');assert.equal(client.ssl.rejectUnauthorized,true);assert.ok(client.ssl.ca===testCA.pem);assert.equal(client.connectionParameters.query_timeout,7000);assert.equal(client.connectionParameters.connect_timeout,2);assert.equal(client.connectionParameters.client_encoding,'UTF8');const {serialize}=require('pg-protocol');const wire=serialize.startup(client.getStartupConf()).toString();assert.ok(wire.includes('client_encoding\0UTF8'));for(const value of ['options','replication','statement_timeout','TEST_INHERITED','untrusted','role=postgres','SQL_ASCII'])assert.ok(!wire.includes(value),value);}finally{for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}});
 it('awaits identity and settings, then reuses an initialized physical connection for only three parameterized RPCs',async()=>{const f=adapterFixture();await f.db.claim(1);await f.db.prepare(item.delivery_id,item.lease_token);await f.db.finish(item.delivery_id,item.lease_token,'sent');await f.db.close();const sql=f.calls.filter(x=>x[0]!=='release'&&x[0]!=='end');assert.equal(sql.length,6);assert.match(sql[0][0],/^SELECT current_user/);assert.match(sql[1][0],/^SET statement_timeout = '5s'; SET search_path = pg_catalog; SET default_transaction_read_only = off;/);assert.match(sql[2][0],/^SELECT pg_catalog.current_setting/);assert.equal(sql[3][0],'SELECT public.nca_claim_personal_push_deliveries($1) AS result');assert.deepEqual(sql[5][1],[item.delivery_id,item.lease_token,'sent']);assert.equal(f.clients.length,1);assert.deepEqual(f.calls.filter(x=>x[0]==='release').map(x=>x[1]),[false,false,false]);assert.deepEqual(f.calls.at(-1),['end']);assert.ok(!sql.some(x=>/BEGIN|COMMIT|ROLLBACK/.test(x[0])));});
 for(const field of ['current_user','session_user'])it(field+' mismatch discards the connection without any RPC',async()=>{const f=adapterFixture({identity:{current_user:'nca_push_sender',session_user:'nca_push_sender',[field]:'postgres'}});await assert.rejects(f.db.claim(1),/INVALID_SENDER_DATABASE_IDENTITY/);assert.equal(f.calls.filter(x=>x[0].startsWith('SELECT public.')).length,0);assert.deepEqual(f.calls.at(-1),['release',true]);await f.db.close();});
 for(const failAt of [1,2,3])it('initialization query '+failAt+' failure discards without RPC or blind retry',async()=>{const f=adapterFixture({failAt});await assert.rejects(f.db.claim(1),/TEST_PRIVATE_DB_FAILURE/);assert.equal(f.clients.length,1);assert.equal(f.calls.filter(x=>x[0].startsWith('SELECT public.')).length,0);assert.deepEqual(f.calls.at(-1),['release',true]);await f.db.close();});
 for(const [field,value] of [['statement_timeout','0'],['search_path','public'],['read_only','on'],['application_name','other']])it('unapplied '+field+' setting fails closed',async()=>{const f=adapterFixture({settings:{[field]:value}});await assert.rejects(f.db.claim(1),/INVALID_SENDER_DATABASE_SESSION/);assert.equal(f.calls.filter(x=>x[0].startsWith('SELECT public.')).length,0);assert.deepEqual(f.calls.at(-1),['release',true]);await f.db.close();});
 for(const holdAt of [1,2,3])it('pending initialization stage '+holdAt+' cannot race an RPC',async()=>{const f=adapterFixture({holdAt});const pending=f.db.claim(1);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.filter(x=>x[0].startsWith('SELECT public.')).length,0);f.unblock();await pending;assert.equal(f.calls.filter(x=>x[0].startsWith('SELECT public.')).length,1);await f.db.close();});
 it('a replacement physical connection receives fresh identity and settings checks',async()=>{const f=adapterFixture();await f.db.claim(1);f.replace();await f.db.claim(1);assert.equal(f.clients.length,2);assert.equal(f.calls.filter(x=>x[0].startsWith('SELECT current_user')).length,2);assert.equal(f.calls.filter(x=>x[0].startsWith('SET ')).length,2);await f.db.close();});
 it('a replacement identity cannot inherit an earlier connection approval',async()=>{const identity={current_user:'nca_push_sender',session_user:'nca_push_sender'},f=adapterFixture({identity});await f.db.claim(1);f.replace();identity.session_user='postgres';await assert.rejects(f.db.claim(1),/INVALID_SENDER_DATABASE_IDENTITY/);assert.equal(f.calls.filter(x=>x[0].startsWith('SELECT public.')).length,1);assert.deepEqual(f.calls.at(-1),['release',true]);await f.db.close();});
 it('real pg Pool max=1 serializes simultaneous checkouts behind awaited initialization, using fake clients only',async()=>{const calls=[];let created=0,unblock;class Client extends EventEmitter{constructor(){super();created++;this._queryable=true;}connect(cb){queueMicrotask(cb);}async query(sql){calls.push(sql);if(sql.startsWith('SELECT current_user')){await new Promise(resolve=>{unblock=resolve;});return {rows:[{current_user:'nca_push_sender',session_user:'nca_push_sender'}]};}if(sql.startsWith('SET '))return {};if(sql.startsWith('SELECT pg_catalog.current_setting'))return {rows:[{statement_timeout:'5s',search_path:'pg_catalog',read_only:'off',application_name:'nca_personal_push_sender'}]};return {rows:[{result:{status:'ok'}}]};}end(cb){this.emit('end');if(cb)cb();}}const db=createDatabase({...databaseConfig(env),Client});try{const first=db.claim(1),second=db.claim(1);await new Promise(resolve=>setImmediate(resolve));assert.equal(created,1);assert.equal(calls.length,1);unblock();await Promise.all([first,second]);assert.equal(calls.filter(x=>x.startsWith('SELECT current_user')).length,1);assert.equal(calls.filter(x=>x.startsWith('SELECT public.')).length,2);assert.equal(calls.length,5);}finally{await db.close();}});
 it('initialization errors are redacted by the existing worker route and the failed pool is closed',async()=>{const f=adapterFixture({failAt:2}),res=response(),messages=[];const saved={};for(const name of ['log','warn','error']){saved[name]=console[name];console[name]=(...x)=>messages.push(x);}try{await createHandler({env,database:()=>f.db,transport:()=>({send:async()=>{throw Error('MUST_NOT_SEND');}})})({method:'POST',headers:{authorization:'Bearer '+env.NCA_PUSH_WORKER_SECRET},body:{}},res);assert.equal(res.code,503);assert.deepEqual(messages,[]);assert.ok(!JSON.stringify(res.body).includes('TEST_PRIVATE_DB_FAILURE'));assert.deepEqual(f.calls.at(-1),['end']);assert.equal(f.calls.filter(x=>x[0].startsWith('SELECT public.')).length,0);}finally{for(const [name,value] of Object.entries(saved))console[name]=value;}});
 it('RPC failure destroys the connection and stops without retry',async()=>{const f=adapterFixture({failAt:4});await assert.rejects(f.db.claim(1),/TEST_PRIVATE_DB_FAILURE/);assert.equal(f.calls.filter(x=>x[0].startsWith('SELECT public.')).length,1);assert.deepEqual(f.calls.at(-1),['release',true]);await f.db.close();});
 it('failed checkout performs no initialization or RPC',async()=>{let queries=0;class Pool{on(){}async connect(){throw Error('TEST_CONNECT_FAILED');}async query(){queries++;}async end(){}}const db=createDatabase(databaseConfig(env),Pool);await assert.rejects(db.claim(1),/TEST_CONNECT_FAILED/);assert.equal(queries,0);await db.close();});
});

describe('Personal sender encrypted transport, no network',()=>{
 it('accepts Android/iOS/Firefox/Windows providers and rejects SSRF/redirect targets',()=>{for(const host of ['fcm.googleapis.com','web.push.apple.com','updates.push.services.mozilla.com','wns2.notify.windows.com'])assert.equal(validateSubscription({...sub(),endpoint:'https://'+host+'/test'}),true);for(const endpoint of ['https://127.0.0.1/x','https://169.254.169.254/x','https://fcm.googleapis.com.evil.invalid/x','https://fcm.googleapis.com:444/x','http://fcm.googleapis.com/x','https://u:p@fcm.googleapis.com/x'])assert.equal(validateSubscription({...sub(),endpoint}),false);});
 for(const [status,outcome] of [[201,'sent'],[404,'invalid_subscription'],[410,'invalid_subscription'],[500,'transient'],[429,'transient'],[403,'transient'],[302,'transient'],[400,'malformed_subscription']])it('HTTP '+status+' -> '+outcome,async()=>{const f=fakeRequest(status);assert.equal(await createTransport(vapidConfig(env),f).send(sub(),payloadFor(notification),30),outcome);assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.headers['Content-Encoding'],'aes128gcm');});
 it('malformed material never calls request',async()=>{const f=fakeRequest(201);assert.equal(await createTransport(vapidConfig(env),f).send({...sub(),keys:{p256dh:'bad',auth:'bad'}},{},30),'malformed_subscription');assert.equal(f.calls.length,0);});
 it('network error and absolute timeout are bounded and destroy the request',async()=>{let f=fakeRequest(201,{error:true});assert.equal(await createTransport(vapidConfig(env),f).send(sub(),{},30),'network');f=fakeRequest(201,{hang:true});assert.equal(await createTransport(vapidConfig(env),{...f,timeoutMs:15}).send(sub(),{},30),'network');assert.equal(f.destroyed,1);});
 it('oversized provider response is not accumulated or exposed',async()=>{const f=fakeRequest(201,{oversize:true});assert.equal(await createTransport(vapidConfig(env),f).send(sub(),{},30),'network');assert.equal(f.destroyed,1);});
});

describe('Personal sender worker safety',()=>{
 it('payload preserves decimal bigint route metadata and contains no actor/body/UUID',()=>{const p=payloadFor(notification);assert.equal(p.data.comment_id,notification.comment_id);assert.equal(p.tag,'nca-notification-'+notification.id);assert.deepEqual(Object.keys(p.data),['notification_id','category','story_id','chapter_id','comment_id']);assert.throws(()=>payloadFor({...notification,id:9}));});
 it('success revalidates directly before send and finalizes once',async()=>{const db=mockedDB();const order=[];const original=db.prepare;db.prepare=async(...x)=>{order.push('prepare');return original(...x);};const r=await runWorker({db,transport:{send:async()=>{order.push('send');return 'sent';}}});assert.deepEqual(order,['prepare','send']);assert.equal(r.sent,1);assert.equal(db.calls.filter(x=>x[0]==='finish').length,1);});
 for(const status of ['gone','cancelled'])it('unlike/source or preference/binding suppression ('+status+') never calls transport',async()=>{let sends=0;const db=mockedDB({prepare:async()=>({status})});const r=await runWorker({db,transport:{send:async()=>{sends++;}}});assert.equal(r.suppressed,1);assert.equal(sends,0);assert.equal(db.calls.filter(x=>x[0]==='finish').length,0);});
 for(const outcome of ['transient','network','invalid_subscription','malformed_subscription'])it('finalizes outcome '+outcome+' without a blind transport retry',async()=>{const db=mockedDB();let sends=0;await runWorker({db,transport:{send:async()=>{sends++;return outcome;}}});assert.equal(sends,1);assert.equal(db.calls.find(x=>x[0]==='finish')[3],outcome);});
 it('lost lease before prepare or finalize stops work without resending',async()=>{for(const where of ['prepare','finish']){let sends=0;const db=mockedDB({[where]:async()=>{throw Object.assign(Error('lease'),{code:'PT409'});}});const r=await runWorker({db,transport:{send:async()=>{sends++;return 'sent';}}});assert.equal(sends,where==='prepare'?0:1);assert.equal(r.errors,1);}});
 it('delayed prepare or insufficient lease/event lifetime never sends',async()=>{for(const field of ['delay','lease','expiry']){let t=0,sends=0;const db=mockedDB({prepare:async()=>{const r=ready();if(field==='delay')t=2500;if(field==='lease')r.lease_remaining_ms=100;if(field==='expiry')r.event_remaining_seconds=0;return r;}});await runWorker({db,now:()=>t,transport:{send:async()=>{sends++;}}});assert.equal(sends,0);assert.equal(db.calls.find(x=>x[0]==='finish')[3],'network');}});
 it('transport throw becomes network-uncertain and finite invocation claims at most five',async()=>{let claims=0,sends=0;const db=mockedDB({claim:async()=>{claims++;return {status:'ok',deliveries:[item]};}});const r=await runWorker({db,transport:{send:async()=>{sends++;throw Error('timeout');}}});assert.equal(r.deferred,5);assert.equal(claims,5);assert.equal(sends,5);});
});

const fs=require('node:fs'),path=require('node:path');
describe('Current sender boundary source contract',()=>{it('has no scheduler and keeps worker enabled gate/auth before DB',()=>{const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../vercel.json'),'utf8'));assert.equal(config.crons,undefined);const source=fs.readFileSync(path.join(__dirname,'../api/personal-push-worker.js'),'utf8');assert.ok(source.includes("NCA_PERSONAL_PUSH_WORKER_ENABLED !== 'true'"));assert.ok(!source.includes('console.'));});});
