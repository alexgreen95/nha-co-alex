'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createHandler,verifyUser}=require('../server/push-api.cjs');
const {Fault}=require('../server/push-validation.cjs');
const {DBFailure}=require('../server/push-db.cjs');
const f=require('./helpers/push-api-fixture.cjs');f.guardNetwork(test);
async function invoke(fixture,body=f.operation('status'),options={}){const res=f.response();await fixture.handler(f.request(body,options),res);return res;}
const code=(res,status,expected)=>{assert.equal(res.code,status);assert.deepEqual(res.body,{ok:false,error:{code:expected}});assert.equal(res.headers['set-cookie'],undefined);};
for(const method of ['GET','HEAD','PUT','PATCH','DELETE','OPTIONS'])test(method+' is 405 before auth/DB',async()=>{const x=f.fixture(),res=await invoke(x,{}, {method});code(res,405,'METHOD_NOT_ALLOWED');assert.equal(res.headers.allow,'POST');assert.equal(x.constructed,0);assert.equal(x.auth.length,0);});
for(const Origin of [undefined,'null','','https://nha-co-alex.vercel.app/','https://nha-co-alex.vercel.app:443','http://nha-co-alex.vercel.app','https://NHA-CO-ALEX.vercel.app','https://nha-co-alex.vercel.app.evil.invalid','https://preview.vercel.app','http://localhost:3000','https://nha-co-alex.vercel.app, https://evil.invalid'])test('rejects non-exact Origin '+JSON.stringify(Origin),async()=>{const x=f.fixture();code(await invoke(x,{}, {headers:{Origin}}),403,'ORIGIN_FORBIDDEN');assert.equal(x.auth.length+x.constructed,0);});
test('duplicated exact Origin rejected before stateful work',async()=>{const x=f.fixture();code(await invoke(x,{}, {extra:['Origin','https://nha-co-alex.vercel.app']}),403,'ORIGIN_FORBIDDEN');assert.equal(x.constructed,0);});
test('exact origin/status is allowed without auth; no cookie refresh, user UUID or raw material in JSON',async()=>{
 const x=f.fixture(f.row({state:'active',user_id:f.A})),res=await invoke(x);
 assert.equal(res.code,200);assert.equal(res.body.subscription.ownership,'unverified');
 assert.deepEqual(Object.keys(res.body.subscription),['installation_id','state','binding_id','binding_version','ownership']);
 assert.equal(res.headers['set-cookie'],undefined);assert.equal(res.headers['cache-control'],'no-store');assert.equal(res.headers['x-content-type-options'],'nosniff');
 const output=JSON.stringify(res.body);for(const value of [f.A,f.RAW.toString('base64url'),f.M.endpoint,f.env.NCA_PUSH_API_DATABASE_URL,f.testCA.pem,f.testCA.base64])assert.ok(!output.includes(value));
 assert.deepEqual(x.calls.map(c=>c[0]),['get','close']);
});
for(const [body,status,error] of [[null,400,'INVALID_REQUEST'],[[],400,'INVALID_REQUEST'],[{},400,'INVALID_REQUEST'],[{operation:'unknown'},400,'INVALID_REQUEST'],[{operation:'status',installation_id:f.ID,user_id:f.A},400,'INVALID_REQUEST']])test('invalid body rejects before auth/DB',async()=>{const x=f.fixture();code(await invoke(x,body,{headers:f.authenticated}),status,error);assert.equal(x.auth.length+x.constructed,0);});
for(const [raw,expected] of [[Buffer.from('{'),400],[Buffer.from('null'),400],[Buffer.from('{} {}'),400],[Buffer.from([255]),400],[Buffer.from('\uFEFF'+JSON.stringify(f.operation('status'))),400],[Buffer.from(' '.repeat(16385)),413]])test('raw UTF8/JSON/byte bounds enforced before auth',async()=>{const x=f.fixture();const res=await invoke(x,{}, {raw,headers:f.authenticated});code(res,expected,expected===413?'PAYLOAD_TOO_LARGE':'INVALID_REQUEST');assert.equal(x.auth.length+x.constructed,0);});
test('chunked bytes counted, including whitespace; Content-Length cannot bypass bound',async()=>{
 const x=f.fixture(),chunks=[Buffer.from(JSON.stringify(f.operation('status'))),Buffer.alloc(16384,32)];
 code(await invoke(x,{}, {headers:{'Content-Length':'1'},chunks}),413,'PAYLOAD_TOO_LARGE');assert.equal(x.constructed,0);
});
test('one JSON interpretation (last duplicate member wins); pre-parsed req.body never substitutes for raw bytes',async()=>{
 const x=f.fixture(),res=f.response(),req=f.request({}, {raw:Buffer.from('{"operation":"create","operation":"status","installation_id":"'+f.ID+'"}')});
 req.body={operation:'create'};await x.handler(req,res);assert.equal(res.code,200);assert.equal(res.body.operation,'status');assert.deepEqual(x.calls.map(c=>c[0]),['get','close']);
 const consumed=f.request({});consumed.destroy();const denied=f.response();await x.handler(consumed,denied);code(denied,400,'INVALID_REQUEST');
});
for(const value of ['text/plain','application/json; charset=latin1','application/json; x=y'])test('rejects wrong Content-Type',async()=>{const x=f.fixture();code(await invoke(x,{}, {headers:{'Content-Type':value}}),415,'UNSUPPORTED_MEDIA_TYPE');assert.equal(x.constructed,0);});
test('rejects compression, accepts specified charset, no CORS escape',async()=>{
 code(await invoke(f.fixture(),{}, {headers:{'Content-Encoding':'gzip'}}),415,'UNSUPPORTED_MEDIA_TYPE');
 const res=await invoke(f.fixture(),f.operation('status'),{headers:{'Content-Type':'Application/JSON; charset=UTF-8'}});assert.equal(res.code,200);assert.equal(res.headers['access-control-allow-origin'],undefined);
});
for(const op of ['create','reserve','activate','recover'])test(op+' requires auth before DB',async()=>{const x=f.fixture();code(await invoke(x,f.operation(op)),401,'UNAUTHORIZED');assert.equal(x.constructed,0);});
for(const op of ['status','release'])test(op+' invalid supplied auth cannot fall back to anonymous',async()=>{
 for(const value of ['bearer aaa.bbb.ccc','Bearer  aaa.bbb.ccc','Bearer bad','Bearer xxx.yyy.zzz','Bearer '+ 'x'.repeat(8200)]){
 const x=f.fixture();code(await invoke(x,f.operation(op),{headers:{Authorization:value}}),401,'UNAUTHORIZED');assert.equal(x.constructed,0);}
});
test('duplicate Authorization rejected; verifier errors/invalid user fail closed without raw output',async()=>{
 const x=f.fixture();code(await invoke(x,f.operation('status'),{headers:f.authenticated,extra:['Authorization','Bearer bbb.ccc.ddd']}),400,'INVALID_REQUEST');assert.equal(x.auth.length,0);
 for(const verifyAuth of [async()=>{throw Error('PRIVATE_AUTH_TOKEN');},async()=>null,async()=>({id:f.A}),async()=>f.A.toUpperCase().replace('0001','ABCD')]){
 let db=0;const handler=createHandler({env:f.env,verifyAuth,database:()=>{db++;}}),res=f.response();await handler(f.request(f.operation('status'),{headers:f.authenticated}),res);code(res,503,'UNAVAILABLE');assert.equal(db,0);}
});
test('verified UUID only is propagated to reserve; no implicit bind on authenticated create',async()=>{
 const x=f.fixture(),res=await invoke(x,f.operation('reserve'),{headers:f.authenticated});assert.equal(res.code,200);assert.equal(res.body.subscription.ownership,'self');
 assert.deepEqual(x.calls[1].slice(0,2),['reserve',f.ID]);assert.ok(x.calls[1][2].equals(f.DIGEST));assert.equal(x.calls[1][3],f.A);assert.equal(x.calls[1][4],'0');
 const y=f.fixture();const created=await invoke(y,f.operation('create'),{headers:{...f.authenticated,Cookie:undefined}});assert.equal(created.code,201);assert.equal(created.body.subscription.state,'unbound');assert.equal(created.body.subscription.ownership,'none');assert.deepEqual(y.calls.map(c=>c[0]),['create','close']);
});
test('create default CSPRNG produces UUIDv4/32-byte token; one hash, exact HttpOnly cookie, no raw token JSON',async()=>{
 const x=f.fixture(),res=await invoke(x,f.operation('create'),{headers:{...f.authenticated,Cookie:undefined}});
 assert.equal(res.code,201);const cookie=res.headers['set-cookie'];
 assert.match(cookie,/^__Host-nca_push_installation=[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000$/);
 assert.ok(!cookie.includes('Domain=')&&!cookie.includes('Expires='));const value=cookie.split(';')[0].split('=')[1], [id,raw]=value.split('.');
 assert.equal(id,res.body.subscription.installation_id);assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]/);
 assert.ok(x.calls[0][2].equals(require('node:crypto').createHash('sha256').update(Buffer.from(raw,'base64url')).digest()));
 assert.ok(!JSON.stringify(res.body).includes(raw));
});
test('create with valid cookie is 200/rediscovers; only known GET PT403 permits one fresh create',async()=>{
 const x=f.fixture(f.row({state:'active',user_id:f.B}));let res=await invoke(x,f.operation('create'),{headers:f.authenticated});assert.equal(res.code,200);assert.equal(res.body.subscription.ownership,'other');assert.equal(res.headers['set-cookie'],undefined);assert.deepEqual(x.calls.map(c=>c[0]),['get','close']);
 const y=f.fixture(f.row(),{get:()=>{throw f.sqlError('PT403');}});res=await invoke(y,f.operation('create'),{headers:f.authenticated});assert.equal(res.code,201);assert.deepEqual(y.calls.map(c=>c[0]),['get','create','close']);
 const z=f.fixture(f.row(),{get:()=>{throw Error('PRIVATE');}});code(await invoke(z,f.operation('create'),{headers:f.authenticated}),503,'UNAVAILABLE');assert.deepEqual(z.calls.map(c=>c[0]),['get','close']);
});
test('create collision is a conflict, no UUID regeneration/retry and no issued cookie',async()=>{
 const x=f.fixture(f.row(),{create:()=>{throw f.sqlError('23505');}});code(await invoke(x,f.operation('create'),{headers:{...f.authenticated,Cookie:undefined}}),409,'STATE_CONFLICT');assert.deepEqual(x.calls.map(c=>c[0]),['create','close']);
});
test('missing/malformed/mismatching cookie is 403; duplicate invalid cookie never bootstraps',async()=>{
 for(const headers of [{Cookie:undefined},{Cookie:'__Host-nca_push_installation=bad'},{Cookie:f.COOKIE.replace(f.ID,f.OTHER_ID)}]){const x=f.fixture();code(await invoke(x,f.operation('status'),{headers}),403,'INVALID_CAPABILITY');assert.equal(x.constructed,0);}
 const x=f.fixture();code(await invoke(x,f.operation('create'),{headers:f.authenticated,extra:['Cookie',f.COOKIE]}),403,'INVALID_CAPABILITY');assert.equal(x.constructed,0);
});
test('empty fragments fail material validation before Auth/DB, including recovery',async()=>{
 for(const op of ['activate','recover'])for(const endpoint of ['https://fcm.googleapis.com/test#','https://fcm.googleapis.com/test?#']){
 const x=f.fixture(f.row({state:'reserved',user_id:f.A}));code(await invoke(x,f.operation(op,{subscription:{...f.M,endpoint}}),{headers:f.authenticated}),400,'INVALID_REQUEST');assert.equal(x.auth.length+x.constructed,0);}
});
test('Unicode-suffixed capability cookies fail without create fallback or mutation',async()=>{
 for(const op of ['create','status'])for(const suffix of ['\u00a0','\uFEFF']){
 const x=f.fixture();code(await invoke(x,f.operation(op),{headers:{...f.authenticated,Cookie:f.COOKIE+suffix}}),403,'INVALID_CAPABILITY');assert.equal(x.constructed,0);assert.equal(x.calls.length,0);}
});
test('reserve -> activate -> release mappings preserve exact pair/material and no cookie rotation',async()=>{
 const x=f.fixture();let res=await invoke(x,f.operation('reserve'),{headers:f.authenticated});assert.equal(res.code,200);let s=x.current;
 res=await invoke(x,f.operation('activate',{binding_id:s.binding_id,binding_version:s.binding_version}),{headers:f.authenticated});assert.equal(res.code,200);assert.equal(res.body.subscription.state,'active');assert.equal(res.headers['set-cookie'],undefined);
 const call=x.calls.find(c=>c[0]==='activate');assert.equal(call[3],s.binding_id);assert.equal(call[4],'1');assert.equal(call[5],f.M.endpoint);assert.equal(call[6],f.M.keys.p256dh);assert.equal(call[7],f.M.keys.auth);
 s=x.current;res=await invoke(x,f.operation('release',{binding_id:s.binding_id,binding_version:s.binding_version,disable:true}));assert.equal(res.code,200);assert.equal(res.body.subscription.state,'disabled');assert.equal(res.body.subscription.ownership,'none');assert.equal(res.headers['set-cookie'],undefined);assert.equal(x.calls.filter(c=>c[0]==='release')[0][5],true);
});
test('release is capability revocation even for different owner; account switch must explicitly unbind first',async()=>{
 const x=f.fixture(f.row({state:'active',user_id:f.B}));code(await invoke(x,f.operation('reserve'),{headers:f.authenticated}),409,'ACCOUNT_BINDING_CONFLICT');assert.ok(!x.calls.some(c=>c[0]==='reserve'));
 let res=await invoke(x,f.operation('release'),{headers:f.authenticated});assert.equal(res.code,200);const s=x.current;
 res=await invoke(x,f.operation('reserve',{binding_id:s.binding_id,binding_version:s.binding_version}),{headers:f.authenticated});assert.equal(res.code,200);assert.equal(x.current.user_id,f.A);
});
test('stale pair and account A->B->A generations never silently rebase',async()=>{
 const x=f.fixture();const initial=f.operation('reserve');await invoke(x,initial,{headers:f.authenticated});
 code(await invoke(x,initial,{headers:f.authenticated}),409,'STATE_CONFLICT');assert.equal(x.calls.filter(c=>c[0]==='reserve').length,1);
 let s=x.current;await invoke(x,f.operation('release',{binding_id:s.binding_id,binding_version:s.binding_version}));s=x.current;
 await invoke(x,f.operation('reserve',{binding_id:s.binding_id,binding_version:s.binding_version}),{headers:{Authorization:'Bearer bbb.ccc.ddd'}});s=x.current;
 await invoke(x,f.operation('release',{binding_id:s.binding_id,binding_version:s.binding_version}));s=x.current;
 await invoke(x,f.operation('reserve',{binding_id:s.binding_id,binding_version:s.binding_version}),{headers:f.authenticated});
 assert.equal(x.current.user_id,f.A);assert.equal(x.current.binding_version,'5');code(await invoke(x,initial,{headers:f.authenticated}),409,'STATE_CONFLICT');
});
for(const op of ['activate','recover'])test(op+' requires self-owned allowed state, not account authentication alone',async()=>{
 for(const initial of [f.row(),f.row({state:'active',user_id:f.B})]){const x=f.fixture(initial);code(await invoke(x,f.operation(op),{headers:f.authenticated}),409,initial.user_id===f.B?'ACCOUNT_BINDING_CONFLICT':'STATE_CONFLICT');assert.ok(!x.calls.some(c=>c[0]===op));}
});
test('recover verifies OLD capability then maps NEW digest, pair, authenticated UUID and material in exact order',async()=>{
 const x=f.fixture(f.row({state:'active',user_id:f.A}));const res=await invoke(x,f.operation('recover'),{headers:f.authenticated});assert.equal(res.code,200);assert.deepEqual(x.calls.map(c=>c[0]),['get','recover','close']);
 assert.ok(x.calls[0][2].equals(f.DIGEST));const call=x.calls[1];assert.deepEqual(call.slice(0,5),['recover',f.ID,f.BIND,'0',f.A]);assert.ok(Buffer.isBuffer(call[5])&&!call[5].equals(f.DIGEST));assert.deepEqual(call.slice(6),[f.M.endpoint,f.M.keys.p256dh,f.M.keys.auth]);
 const cookie=res.headers['set-cookie'].split(';')[0],raw=cookie.split('.')[1];assert.ok(call[5].equals(require('node:crypto').createHash('sha256').update(Buffer.from(raw,'base64url')).digest()));assert.ok(!JSON.stringify(res.body).includes(raw));
 code(await invoke(x,f.operation('recover'),{headers:f.authenticated}),403,'INVALID_CAPABILITY');assert.equal(x.calls.filter(c=>c[0]==='recover').length,1);
 const fresh=f.request(f.operation('recover'),{headers:{...f.authenticated,Cookie:cookie}}),r=f.response();await x.handler(fresh,r);code(r,409,'STATE_CONFLICT');
});
for(const [sqlstate,status,publicCode] of [['PT403',403,'INVALID_CAPABILITY'],['PT409',409,'STATE_CONFLICT'],['22023',400,'INVALID_REQUEST'],['23505',409,'ENDPOINT_CONFLICT'],['23503',409,'ACCOUNT_UNAVAILABLE'],['40001',503,'UNAVAILABLE']])test('definite DB '+sqlstate+' maps safely without retry',async()=>{
 const x=f.fixture(f.row(),{reserve:()=>{throw f.sqlError(sqlstate);}});code(await invoke(x,f.operation('reserve'),{headers:f.authenticated}),status,publicCode);assert.equal(x.calls.filter(c=>c[0]==='reserve').length,1);
});
test('pre-dispatch failures differ from ambiguous mutation; raw errors never escape/log or cause retry',async()=>{
 const privateText=[f.env.NCA_PUSH_API_DATABASE_URL,f.RAW.toString('base64url'),f.testCA.pem,'aaa.bbb.ccc'].join(' ');
 for(const error of [new DBFailure(undefined,false,false),new DBFailure(undefined,true,false),Error(privateText)]){
 const x=f.fixture(f.row(),{reserve:()=>{throw error;}}),res=await invoke(x,f.operation('reserve'),{headers:f.authenticated});code(res,503,error instanceof DBFailure&&!error.dispatched?'UNAVAILABLE':'OUTCOME_UNKNOWN');assert.equal(x.calls.filter(c=>c[0]==='reserve').length,1);assert.ok(!JSON.stringify(res.body).includes(privateText));}
});
test('invalid GET result blocks mutation; invalid post-mutation result is OUTCOME_UNKNOWN',async()=>{
 let x=f.fixture(f.row(),{get:()=>f.row({endpoint:'PRIVATE'})});code(await invoke(x,f.operation('reserve'),{headers:f.authenticated}),503,'UNAVAILABLE');assert.ok(!x.calls.some(c=>c[0]==='reserve'));
 x=f.fixture(f.row(),{reserve:()=>f.row({state:'active',user_id:f.A})});code(await invoke(x,f.operation('reserve'),{headers:f.authenticated}),503,'OUTCOME_UNKNOWN');
 x=f.fixture(f.row(),{create:()=>f.row({state:'reserved',user_id:f.A})});code(await invoke(x,f.operation('create'),{headers:{...f.authenticated,Cookie:undefined}}),503,'OUTCOME_UNKNOWN');
});
test('response write ambiguity does not retry or leave a cookie on an error response; close failure is swallowed',async()=>{
 const x=f.fixture(f.row(),{close:()=>{throw Error('PRIVATE_CLOSE');}}),res=f.response();let writes=0;res.json=function(body){if(writes++===0)throw Error('PRIVATE_WRITE');this.body=body;return this;};
 await x.handler(f.request(f.operation('create'),{headers:{...f.authenticated,Cookie:undefined}}),res);code(res,503,'OUTCOME_UNKNOWN');assert.equal(x.calls.filter(c=>c[0]==='create').length,1);
});

function authRequest({status=200,body={id:f.A},raw,error=false,hang=false,oversize=false}={}){
 const calls=[];let destroyed=0;
 const request=(url,options,cb)=>{calls.push({url,options});const req=new EventEmitter();req.destroy=()=>{destroyed++;};req.end=()=>{if(hang)return;queueMicrotask(()=>{if(error)return req.emit('error',Error('PRIVATE_AUTH_ERROR'));const res=new EventEmitter();res.statusCode=status;res.destroy=()=>{};cb(res);res.emit('data',oversize?Buffer.alloc(32769):raw||Buffer.from(JSON.stringify(body)));res.emit('end');});};return req;};
 return {request,calls,get destroyed(){return destroyed;}};
}
test('genuine Auth boundary uses exactly fixed project GET, verified TLS, bounded response and authoritative UUID',async()=>{
 const x=authRequest();assert.equal(await verifyUser('aaa.bbb.ccc',f.env.NCA_PUSH_API_AUTH_PUBLISHABLE_KEY,{...x,deadline:Date.now()+25000}),f.A);
 assert.equal(x.calls.length,1);assert.equal(x.calls[0].url,'https://cwwulyrutdvuekydydew.supabase.co/auth/v1/user');assert.equal(x.calls[0].options.method,'GET');assert.equal(x.calls[0].options.rejectUnauthorized,true);assert.equal(x.calls[0].options.headers.Authorization,'Bearer aaa.bbb.ccc');assert.equal(x.calls[0].options.headers.apikey,f.env.NCA_PUSH_API_AUTH_PUBLISHABLE_KEY);assert.equal(x.calls[0].options.headers.Cookie,undefined);
});
for(const status of [400,401,403,302,429,500])test('Auth HTTP '+status+' is fail-closed with zero retries',async()=>{const x=authRequest({status});await assert.rejects(verifyUser('aaa.bbb.ccc',f.env.NCA_PUSH_API_AUTH_PUBLISHABLE_KEY,{...x,deadline:Date.now()+2000}),e=>e instanceof Fault&&e.status===([400,401,403].includes(status)?401:503));assert.equal(x.calls.length,1);});
for(const bad of [{body:{}},{body:{id:'bad'}},{body:[]},{raw:Buffer.from([255])},{raw:Buffer.from('not JSON')},{raw:Buffer.from('\uFEFF{}')},{oversize:true},{error:true}])test('Auth malformed/oversized/error response cannot create identity',async()=>{const x=authRequest(bad);await assert.rejects(verifyUser('aaa.bbb.ccc',f.env.NCA_PUSH_API_AUTH_PUBLISHABLE_KEY,{...x,deadline:Date.now()+2000}),e=>e.status===503&&e.message==='UNAVAILABLE');assert.equal(x.calls.length,1);});
test('Auth timeout is absolute and destroys request; invalid config never opens request',async()=>{
 const x=authRequest({hang:true});await assert.rejects(verifyUser('aaa.bbb.ccc',f.env.NCA_PUSH_API_AUTH_PUBLISHABLE_KEY,{...x,deadline:Date.now()+10}),e=>e.status===503);assert.ok(x.destroyed>0);assert.equal(x.calls.length,1);
 for(const key of [undefined,'','sb_secret_NOT_PUBLIC','aaa.bbb.ccc','sb_publishable_bad\n','x'.repeat(513)])assert.throws(()=>verifyUser('aaa.bbb.ccc',key,{request:()=>assert.fail('MUST_NOT_CONNECT'),deadline:Date.now()+2000}),e=>e.status===503);
});
