'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const v=require('../server/push-validation.cjs');
const f=require('./helpers/push-api-fixture.cjs');f.guardNetwork(test);
test('all six exact schemas accepted; versions retain bigint decimal precision',()=>{
  for(const op of ['create','status','reserve','activate','release','recover'])assert.equal(v.validateBody(f.operation(op)).operation,op);
  assert.ok(v.version('9007199254740993'));assert.ok(v.version('9223372036854775807'));
});
for(const op of ['create','status','reserve','activate','release','recover'])test(op+' rejects every missing field, extra user authority and arrays',()=>{
  const body=f.operation(op);for(const key of Object.keys(body)){const bad={...body};delete bad[key];assert.throws(()=>v.validateBody(bad));}
  for(const key of ['user_id','p_user_id','capability','digest','context','sql','extra'])assert.throws(()=>v.validateBody({...body,[key]:f.A}));
  assert.throws(()=>v.validateBody([]));assert.throws(()=>v.validateBody(null));
});
for(const value of ['','01','+1','-1','1.0','1e1',' 1','1 ','9223372036854775808',1,null,{},'1'.repeat(100)])test('rejects noncanonical or out-of-range version '+JSON.stringify(value).slice(0,30),()=>assert.throws(()=>v.validateBody(f.operation('reserve',{binding_version:value}))));
for(const value of [f.ID.toUpperCase().replace('0001','ABCD'),'not-uuid',f.ID.replace('-4000-','-1000-'),f.ID+' ',null,{}])test('rejects invalid installation spelling',()=>assert.throws(()=>v.validateBody(f.operation('status',{installation_id:value}))));
test('subscription accepts all approved mobile/desktop providers only',()=>{
  for(const host of ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns2.notify.windows.com'])assert.doesNotThrow(()=>v.material({...f.M,endpoint:'https://'+host+'/test'}));
});
for(const endpoint of ['http://fcm.googleapis.com/test','https://localhost/test','https://127.0.0.1/test','https://169.254.169.254/test','https://fcm.googleapis.com.evil.invalid/test','https://a.b.notify.windows.com/test','https://notify.windows.com/test','https://fcm.googleapis.com:443/test','https://fcm.googleapis.com:444/test','https://u:p@fcm.googleapis.com/test','https://FCM.GOOGLEAPIS.COM/test','https://fcm.googleapis.com/test#x','https://fcm.googleapis.com/test\n','https://fcm.googleapis.com/a b','https://fcm.googleapis.com/é','https://fcm.googleapis.com/'+ 'a'.repeat(2048)])test('rejects unsafe/noncanonical endpoint ('+endpoint.length+' chars)',()=>assert.throws(()=>v.material({...f.M,endpoint})));
test('strict subscription/key shapes and canonical crypto lengths/points',()=>{
  for(const bad of [{...f.M,expirationTime:null},{...f.M,keys:{...f.M.keys,extra:'x'}},{...f.M,keys:null},null,[]])assert.throws(()=>v.material(bad));
  for(const field of ['p256dh','auth'])for(const value of ['',f.M.keys[field]+'=',f.M.keys[field]+' ',null,Buffer.alloc(16).toString('base64')])assert.throws(()=>v.material({...f.M,keys:{...f.M.keys,[field]:value}}));
  assert.throws(()=>v.material({...f.M,keys:{...f.M.keys,p256dh:Buffer.alloc(65,4).toString('base64url')}}));
  const canonical=f.M.keys.auth,alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const alias=canonical.slice(0,-1)+alphabet[alphabet.indexOf(canonical.at(-1))+1];
  assert.ok(Buffer.from(alias,'base64url').equals(Buffer.from(canonical,'base64url')));
  assert.throws(()=>v.material({...f.M,keys:{...f.M.keys,auth:alias}}));
});
test('empty literal fragment delimiters are forbidden; encoded path data is not a fragment',()=>{
 for(const endpoint of ['https://fcm.googleapis.com/test#','https://fcm.googleapis.com/test?#'])assert.throws(()=>v.material({...f.M,endpoint}));
 assert.doesNotThrow(()=>v.material({...f.M,endpoint:'https://fcm.googleapis.com/test%23data'}));
});
test('cookie hash is SHA256 of decoded raw bytes exactly once; unrelated cookies ignored',()=>{
  const cap=v.cookie(f.request({}, {headers:{Cookie:'nha_gate=UNRELATED; '+f.COOKIE+'; other=x'}}));
  assert.equal(cap.id,f.ID);assert.ok(cap.digest.equals(f.DIGEST));
  assert.ok(!cap.digest.equals(require('node:crypto').createHash('sha256').update(f.DIGEST).digest()));
  assert.deepEqual(Object.keys(cap),['id','digest']);
});
for(const suffix of ['', '='+f.ID+'.bad', '='+f.ID+'.'+f.RAW.toString('base64url')+'=', '="'+f.ID+'.'+f.RAW.toString('base64url')+'"', '='+f.ID+'.'+f.RAW.toString('base64url')+'.extra', '='+f.ID+'.'+f.RAW.toString('base64url')+'%20'])test('malformed target cookie never becomes absent bootstrap',()=>assert.throws(()=>v.cookie(f.request({}, {headers:{Cookie:'__Host-nca_push_installation'+suffix}})),e=>e.code==='INVALID_CAPABILITY'));
test('duplicate cookie and oversized cookie header rejected; no decode fallback',()=>{
 assert.throws(()=>v.cookie(f.request({}, {extra:['Cookie',f.COOKIE]})),e=>e.code==='INVALID_CAPABILITY');
 assert.throws(()=>v.cookie(f.request({}, {headers:{Cookie:'a='.repeat(9000)}})),e=>e.status===431);
 assert.equal(v.cookie(f.request({}, {headers:{Cookie:undefined}})),null);
});
test('only HTTP OWS is stripped around cookie pairs; NBSP and BOM suffixes never canonicalize',()=>{
 for(const suffix of ['\u00a0','\uFEFF'])assert.throws(()=>v.cookie(f.request({}, {headers:{Cookie:f.COOKIE+suffix}})),e=>e.code==='INVALID_CAPABILITY');
 assert.equal(v.cookie(f.request({}, {headers:{Cookie:' \t'+f.COOKIE+'\t '}})).id,f.ID);
});
for(const op of ['create','status','reserve','activate','release','recover'])test(op+' required/optional Authorization matrix',()=>{
  const req=f.request({},{headers:{Authorization:undefined}});
  if(['status','release'].includes(op))assert.equal(v.authorization(req,op),null);else assert.throws(()=>v.authorization(req,op),e=>e.status===401);
  assert.equal(v.authorization(f.request({}, {headers:f.authenticated}),op),'aaa.bbb.ccc');
  assert.throws(()=>v.authorization(f.request({}, {extra:['Authorization','Bearer aaa.bbb.ccc','Authorization','Bearer aaa.bbb.ccc']}),op),e=>e.status===400);
});
test('strict status result shape/redaction prerequisites',()=>{
 assert.equal(v.validateResult(f.row()).binding_version,'0');
 for(const bad of [f.row({endpoint:'PRIVATE'}),f.row({binding_version:1}),f.row({state:'active'}),f.row({user_id:f.A}),f.row({installation_id:'bad'}),null])assert.throws(()=>v.validateResult(bad),e=>e.status===503);
});
