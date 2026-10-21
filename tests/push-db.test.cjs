'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {execFileSync}=require('node:child_process');
const {DatabaseError}=require('pg');
const {databaseConfig,createDatabase,DBFailure,ROUTINES}=require('../server/push-db.cjs');
const f=require('./helpers/push-api-fixture.cjs');f.guardNetwork(test);
const good=f.env.NCA_PUSH_API_DATABASE_URL;
test('exact API Session Pooler config with explicit verified CA, TLS floor, bounds and no sender identity',()=>{
 const c=databaseConfig(f.env);assert.equal(c.user,'nca_push_api.cwwulyrutdvuekydydew');assert.equal(c.host,'aws-0-ap-northeast-2.pooler.supabase.com');assert.equal(c.port,5432);assert.equal(c.database,'postgres');assert.equal(c.ssl.rejectUnauthorized,true);assert.equal(c.ssl.minVersion,'TLSv1.2');assert.ok(c.ssl.ca===f.testCA.pem);assert.equal(c.max,1);assert.equal(c.connectionTimeoutMillis,2000);assert.equal(c.idleTimeoutMillis,1000);assert.equal(c.query_timeout,7000);assert.equal(c.client_encoding,'UTF8');assert.equal(c.options,undefined);assert.equal(c.connectionString,undefined);assert.equal(c.replication,undefined);
});
for(const [label,url] of [
 ['alias protocol',good.replace('postgresql:','postgres:')],['direct host',good.replace('aws-0-ap-northeast-2.pooler.supabase.com','db.cwwulyrutdvuekydydew.supabase.co')],['other region',good.replace('ap-northeast-2','ap-southeast-1')],['transaction port',good.replace(':5432/',':6543/')],['implicit port',good.replace(':5432/','/')],['other port',good.replace(':5432/',':5433/')],['other db',good.replace('/postgres','/other')],['encoded db',good.replace('/postgres','/%70ostgres')],['unsuffixed user',good.replace('.cwwulyrutdvuekydydew:',':')],['sender user',good.replace('nca_push_api.','nca_push_sender.')],['admin user',good.replace('nca_push_api.','postgres.')],['wrong project',good.replace('.cwwulyrutdvuekydydew:','.other:')],['encoded user',good.replace('nca_push_api.','nca_push_api%2e')],['host list',good.replace('.com:5432','.com,remote.invalid:5432')],['lookalike host',good.replace('.com:5432','.com.evil.invalid:5432')],['TLS override',good+'?sslmode=disable'],['options',good+'?options=role%3Dpostgres'],['empty query',good+'?'],['fragment',good+'#ignored'],['empty fragment',good+'#'],['whitespace',good+'\n'],['empty password',good.replace('OFFLINE_ONLY_PASSWORD','')],['control password',good.replace('OFFLINE_ONLY_PASSWORD','%00')]
])test('rejects '+label+' with sanitized config error before connection',()=>assert.throws(()=>databaseConfig({...f.env,NCA_PUSH_API_DATABASE_URL:url}),e=>e instanceof DBFailure&&e.message==='LIFECYCLE_DB_FAILED'&&!e.message.includes(url)));
test('password URL reserved characters are data, never query/options',()=>{const c=databaseConfig({...f.env,NCA_PUSH_API_DATABASE_URL:good.replace('OFFLINE_ONLY_PASSWORD','test%40%3A%2F%3F%23%25')});assert.equal(c.password,'test@:/?#%');assert.equal(c.host,'aws-0-ap-northeast-2.pooler.supabase.com');});
for(const value of [undefined,'',' '+f.testCA.base64,f.testCA.base64+'\n','!!!!','Zh==','A'.repeat(16388),Buffer.from(f.testCA.pem+f.testCA.pem).toString('base64'),Buffer.from('junk'+f.testCA.pem).toString('base64'),Buffer.from(f.testCA.pem+'junk').toString('base64'),Buffer.from(f.testCA.pem.replaceAll('CERTIFICATE','PRIVATE KEY')).toString('base64')])test('API CA invalid input never selects fallback TLS',()=>assert.throws(()=>databaseConfig({...f.env,NCA_PUSH_API_CA_CERT_B64:value}),e=>e instanceof DBFailure&&e.message==='LIFECYCLE_DB_FAILED'));
test('pinned Client ignores inherited PG identity/TLS/options/startup settings without changing global env',()=>{
 const inherited={PGUSER:'postgres',PGPASSWORD:'PRIVATE_INHERITED',PGDATABASE:'wrong',PGHOST:'evil.invalid',PGPORT:'6543',PGSSLMODE:'no-verify',PGOPTIONS:'-c role=postgres',PGREPLICATION:'database',PGAPPNAME:'untrusted',PGCLIENT_ENCODING:'SQL_ASCII'},saved={};
 for(const [k,value] of Object.entries(inherited)){saved[k]=process.env[k];process.env[k]=value;}
 try{const c=databaseConfig(f.env),client=new c.Client(c);assert.deepEqual(client.getStartupConf(),{user:c.user,database:'postgres'});assert.equal(client.host,c.host);assert.equal(client.port,5432);assert.equal(client.user,c.user);assert.equal(client.ssl.rejectUnauthorized,true);assert.ok(client.ssl.ca===f.testCA.pem);const wire=require('pg-protocol').serialize.startup(client.getStartupConf()).toString();assert.ok(wire.includes('client_encoding\0UTF8'));for(const value of ['options','replication','statement_timeout','PRIVATE_INHERITED','untrusted','role=postgres','SQL_ASCII'])assert.ok(!wire.includes(value));for(const [k,value] of Object.entries(inherited))assert.equal(process.env[k],value);}
 finally{for(const [k,value] of Object.entries(saved)){if(value===undefined)delete process.env[k];else process.env[k]=value;}}
});
function adapter({identity={current_user:'nca_push_api',session_user:'nca_push_api'},settings={},failAt=0,holdAt=0,error=Error('PRIVATE_DB_URI_AND_TOKEN'),now=()=>1000,deadline=26000}={}){
 const calls=[],clients=[];let releaseGate,current,created;
 class Pool extends EventEmitter {
  constructor(config){super();this.options={...config};created=this;}
  async connect(){calls.push(['connect',this.options.connectionTimeoutMillis]);if(failAt==='connect')throw error;if(current)return current;const client={count:0,async query(config){calls.push(['query',config]);client.count++;if(holdAt===client.count)await new Promise(resolve=>{releaseGate=resolve;});if(failAt===client.count)throw error;if(config.text.startsWith('SELECT current_user'))return {rows:[identity]};if(config.text.startsWith('SET '))return {};if(config.text.startsWith('SELECT pg_catalog'))return {rows:[{statement_timeout:'5s',lock_timeout:'2s',search_path:'pg_catalog',read_only:'off',application_name:'nca_push_subscription_api',...settings}]};return {rows:[{result:{status:'ok'}}]};},release(failed){calls.push(['release',failed]);if(failed)current=null;}};clients.push(client);current=client;return client;}
  async end(){calls.push(['end']);}
 }
 return {db:createDatabase(databaseConfig(f.env),{Pool,now,deadline}),calls,clients,get pool(){return created;},unblock(){releaseGate();},replace(){current=null;}};
}
test('all six typed parameterized routine boundaries; only awaited identity/settings precede them',async()=>{
 const x=adapter();
 const args={get:[f.ID,f.DIGEST,'status'],create:[f.ID,f.DIGEST],reserve:[f.ID,f.DIGEST,f.A,'9007199254740993'],activate:[f.ID,f.DIGEST,f.BIND,'0',f.M.endpoint,f.M.keys.p256dh,f.M.keys.auth],release:[f.ID,f.DIGEST,f.BIND,'0',false],recover:[f.ID,f.BIND,'0',f.A,f.DIGEST,f.M.endpoint,f.M.keys.p256dh,f.M.keys.auth]};
 for(const op of Object.keys(args))await x.db[op](...args[op]);
 const queries=x.calls.filter(c=>c[0]==='query').map(c=>c[1]);assert.equal(queries.length,9);assert.match(queries[0].text,/^SELECT current_user/);assert.match(queries[1].text,/SET statement_timeout = '5s'; SET lock_timeout = '2s'; SET search_path = pg_catalog;/);assert.match(queries[2].text,/^SELECT pg_catalog.current_setting/);
 for(const [i,op] of Object.keys(args).entries()){const [name,types]=ROUTINES[op];assert.equal(queries[i+3].text,`SELECT public.${name}(${types.map((t,n)=>'$'+(n+1)+'::'+t).join(',')}) AS result`);assert.deepEqual(queries[i+3].values,args[op]);assert.equal(queries[i+3].query_timeout,7000);}
 assert.equal(x.clients.length,1);assert.deepEqual(x.calls.filter(c=>c[0]==='release').map(c=>c[1]),[false,false,false,false,false,false]);await x.db.close();assert.deepEqual(x.calls.at(-1),['end']);
});
for(const field of ['current_user','session_user'])test('wrong '+field+' stops without any lifecycle call',async()=>{const x=adapter({identity:{current_user:'nca_push_api',session_user:'nca_push_api',[field]:'postgres'}});await assert.rejects(x.db.get(f.ID,f.DIGEST,'status'),e=>e instanceof DBFailure&&!e.dispatched);assert.equal(x.calls.filter(c=>c[0]==='query').length,1);assert.deepEqual(x.calls.at(-1),['release',true]);await x.db.close();});
for(const [field,value] of [['statement_timeout','0'],['lock_timeout','0'],['search_path','public'],['read_only','on'],['application_name','wrong']])test('unapplied '+field+' blocks all RPCs and destroys connection',async()=>{const x=adapter({settings:{[field]:value}});await assert.rejects(x.db.create(f.ID,f.DIGEST),e=>e instanceof DBFailure&&!e.dispatched);assert.ok(!x.calls.some(c=>c[0]==='query'&&c[1].text.includes('SELECT public.')));assert.deepEqual(x.calls.at(-1),['release',true]);await x.db.close();});
for(const failAt of ['connect',1,2,3,4])test('failure at '+failAt+' sanitized and not retried',async()=>{const x=adapter({failAt});await assert.rejects(x.db.create(f.ID,f.DIGEST),e=>e instanceof DBFailure&&e.message==='LIFECYCLE_DB_FAILED'&&e.dispatched===(failAt===4)&&!JSON.stringify(e).includes('PRIVATE'));assert.equal(x.calls.filter(c=>c[0]==='connect').length,1);assert.equal(x.calls.filter(c=>c[0]==='query'&&c[1].text.includes('SELECT public.')).length,failAt===4?1:0);await x.db.close();});
for(const holdAt of [1,2,3])test('awaited initialization '+holdAt+' cannot race ahead into RPC',async()=>{const x=adapter({holdAt});const promise=x.db.get(f.ID,f.DIGEST,'status');await new Promise(resolve=>setImmediate(resolve));assert.ok(!x.calls.some(c=>c[0]==='query'&&c[1].text.includes('SELECT public.')));x.unblock();await promise;await x.db.close();});
test('physical replacement must pass fresh identity/session initialization',async()=>{const x=adapter();await x.db.get(f.ID,f.DIGEST,'status');x.replace();await x.db.get(f.ID,f.DIGEST,'status');assert.equal(x.clients.length,2);assert.equal(x.calls.filter(c=>c[0]==='query'&&c[1].text.startsWith('SELECT current_user')).length,2);await x.db.close();});
for(const sqlstate of ['PT403','PT409','22023','23505','23503','40001','08006','57P01'])test('native SQL error '+sqlstate+' safe definite/unknown classification, never retry',async()=>{
 const error=new DatabaseError('PRIVATE_DB_PASSWORD',10,'error');error.code=sqlstate;const x=adapter({failAt:4,error});await assert.rejects(x.db.create(f.ID,f.DIGEST),e=>e.sqlstate===sqlstate&&e.dispatched&&e.definite===!['08006','57P01'].includes(sqlstate)&&e.message==='LIFECYCLE_DB_FAILED'&&!JSON.stringify(e).includes('PRIVATE'));assert.equal(x.calls.filter(c=>c[0]==='query').length,4);await x.db.close();
});
test('remaining deadline bounds connection/query waits; mutation not dispatched below seven seconds',async()=>{
 let time=1000;const x=adapter({now:()=>time,deadline:9000});await x.db.get(f.ID,f.DIGEST,'status');time=2500;
 await assert.rejects(x.db.create(f.ID,f.DIGEST),e=>e instanceof DBFailure&&!e.dispatched);assert.ok(!x.calls.some(c=>c[0]==='query'&&c[1].text.includes('nca_create_')));await x.db.close();
 const y=adapter({now:()=>1000,deadline:1050});await y.db.get(f.ID,f.DIGEST,'status');assert.equal(y.calls[0][1],50);assert.ok(y.calls.filter(c=>c[0]==='query').every(c=>c[1].query_timeout===50));await y.db.close();
 const z=adapter({now:()=>1000,deadline:1000});await assert.rejects(z.db.get(f.ID,f.DIGEST,'status'));assert.equal(z.calls.length,0);await z.db.close();
});
test('deployment config is three placeholders; example is allowlisted, private env remains ignored',()=>{
 const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'.env.push-subscriptions.example'),'utf8');
 const lines=source.split('\n').filter(l=>l&&!l.startsWith('#'));assert.deepEqual(lines.map(l=>l.split('=')[0]),['NCA_PUSH_API_DATABASE_URL','NCA_PUSH_API_CA_CERT_B64','NCA_PUSH_API_AUTH_PUBLISHABLE_KEY']);for(const line of lines)assert.match(line,/=<[A-Z_]+>$/);
 assert.throws(()=>execFileSync('git',['check-ignore','--no-index','.env.push-subscriptions.example'],{cwd:root,stdio:'ignore'}));
 assert.equal(execFileSync('git',['check-ignore','--no-index','.env.push-subscriptions.local'],{cwd:root,encoding:'utf8'}).trim(),'.env.push-subscriptions.local');
 const entry=fs.readFileSync(path.join(root,'api/push-subscriptions.js'),'utf8');assert.match(entry,/require\('\.\.\/server\/push-api.cjs'\)\.createHandler\(\)/);
});
test('source boundary has only six fixed RPC names, no direct DML/role adoption/SQLSTATE retry',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../server/push-db.cjs'),'utf8');
 assert.deepEqual(Object.keys(ROUTINES),['get','create','reserve','activate','release','recover']);assert.doesNotMatch(source,/\b(?:INSERT|UPDATE|DELETE|MERGE|COPY|CREATE|ALTER|DROP|GRANT|REVOKE)\b|SET ROLE|BEGIN;|COMMIT;|ROLLBACK;/);
 assert.doesNotMatch(source,/rejectUnauthorized\s*:\s*false|console\./);
 const sql=fs.readFileSync(path.join(__dirname,'../database/migrations/20261020_push_subscription_lifecycle_install_v4.sql'));
 assert.equal(require('node:crypto').createHash('sha256').update(sql).digest('hex'),'6b6a4ae9336651f8f45c025e8884db9f657c14ffa470284b2bde7f9ab8b1fa7f');
 for(const [name,types] of Object.values(ROUTINES)){const signature=new RegExp('CREATE FUNCTION public\\.'+name+'\\(([^\\n]+)\\) RETURNS');const match=sql.toString().match(signature);assert.ok(match);assert.deepEqual(match[1].split(',').map(arg=>arg.trim().split(' ')[1]),types);}
});
