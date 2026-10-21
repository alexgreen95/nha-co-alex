'use strict';
// Synthetic offline material only; no real account, credential, CA or DB connection.
const fs = require('node:fs'), {Readable} = require('node:stream');
const {createECDH, createHash} = require('node:crypto');
const testCA = require('./personal-push-test-ca.cjs');
const {DBFailure} = require('../../server/push-db.cjs');
const {createHandler} = require('../../server/push-api.cjs');
const ID='10000000-0000-4000-8000-000000000001', OTHER_ID='10000000-0000-4000-8000-000000000002';
const A='20000000-0000-4000-8000-000000000001', B='20000000-0000-4000-8000-000000000002';
const BIND='30000000-0000-4000-8000-000000000001';
const RAW=Buffer.alloc(32,17), DIGEST=createHash('sha256').update(RAW).digest();
const COOKIE='__Host-nca_push_installation='+ID+'.'+RAW.toString('base64url');
const ecdh=createECDH('prime256v1');ecdh.setPrivateKey(Buffer.alloc(32,1));
const M={endpoint:'https://fcm.googleapis.com/fcm/send/OFFLINE_ONLY',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}};
const env={NCA_PUSH_API_DATABASE_URL:'postgresql://nca_push_api.cwwulyrutdvuekydydew:OFFLINE_ONLY_PASSWORD@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',NCA_PUSH_API_CA_CERT_B64:testCA.base64,NCA_PUSH_API_AUTH_PUBLISHABLE_KEY:'sb_publishable_OFFLINE_ONLY'};
function request(body, {method='POST',headers={},raw,extra=[],chunks}={}) {
  const h={Origin:'https://nha-co-alex.vercel.app','Content-Type':'application/json',Cookie:COOKIE,...headers};
  const req=Readable.from(chunks || [raw===undefined?Buffer.from(JSON.stringify(body)):raw]);
  req.method=method;req.rawHeaders=Object.entries(h).filter(([,v])=>v!==undefined).flat().concat(extra);
  req.headers=Object.fromEntries(Object.entries(h).filter(([,v])=>v!==undefined).map(([k,v])=>[k.toLowerCase(),v]));
  return req;
}
function response() {return {headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},removeHeader(k){delete this.headers[k.toLowerCase()];},status(n){this.code=n;return this;},json(b){this.body=b;return this;}};}
function row(overrides={}) {return {status:'ok',installation_id:ID,state:'unbound',binding_id:BIND,binding_version:'0',user_id:null,...overrides};}
function sqlError(code) {return new DBFailure(code,true,true);}
function fixture(initial=row(), overrides={}) {
  let current={...initial}, hash=Buffer.from(DIGEST), sequence=1;
  const calls=[], auth=[];
  const advance=(state,user,cap=hash)=>{hash=Buffer.from(cap);current={...current,state,user_id:user,binding_id:'30000000-0000-4000-8000-'+String(++sequence).padStart(12,'0'),binding_version:String(BigInt(current.binding_version)+1n)};return {...current};};
  const capability=(id,cap)=>{if(id!==current.installation_id||!Buffer.from(cap).equals(hash))throw sqlError('PT403');};
  const pair=(binding,version)=>{if(binding!==current.binding_id||version!==current.binding_version)throw sqlError('PT409');};
  const implementations={
    get(id,cap,context){capability(id,cap);if(context!=='status')throw sqlError('22023');return {...current};},
    create(id,cap){current=row({installation_id:id});hash=Buffer.from(cap);return {...current};},
    reserve(id,cap,user,version){capability(id,cap);if(version!==current.binding_version)throw sqlError('PT409');return advance('reserved',user);},
    activate(id,cap,binding,version){capability(id,cap);pair(binding,version);return advance('active',current.user_id);},
    release(id,cap,binding,version,disable){capability(id,cap);pair(binding,version);return advance(disable?'disabled':'unbound',null);},
    recover(id,binding,version,user,newHash){if(id!==current.installation_id)throw sqlError('PT409');pair(binding,version);return advance('active',user,newHash);},
    close(){}
  };
  const db=Object.fromEntries(Object.keys(implementations).map(name=>[name,async(...args)=>{calls.push([name,...args]);return await (overrides[name]||implementations[name])(...args);} ]));
  let constructed=0;
  const handler=createHandler({env,database:()=>{constructed++;return db;},verifyAuth:async token=>{auth.push(token);if(token==='aaa.bbb.ccc')return A;if(token==='bbb.ccc.ddd')return B;throw new (require('../../server/push-validation.cjs').Fault)(401,'UNAUTHORIZED');}});
  return {calls,auth,db,handler,get constructed(){return constructed;},get current(){return {...current};},get hash(){return Buffer.from(hash);}};
}
function operation(op,overrides={}) {return {operation:op,...(op==='create'?{}:{installation_id:ID}),...(!['create','status'].includes(op)?{binding_id:BIND,binding_version:'0'}:{}),...(['activate','recover'].includes(op)?{subscription:M}:{}),...(op==='release'?{disable:false}:{}),...overrides};}
const authenticated={Authorization:'Bearer aaa.bbb.ccc'};
function guardNetwork(test) {
  const saved=[];let attempts=0,logs=[];
  test.before(()=>{
    for(const [object,name] of [[require('node:net').Socket.prototype,'connect'],[require('node:tls'),'connect'],[require('node:https'),'request'],[require('node:http'),'request'],[require('pg').Client.prototype,'connect'],[require('pg').Pool.prototype,'connect'],[global,'fetch']]){saved.push([object,name,object[name]]);object[name]=()=>{attempts++;throw Error('REAL_NETWORK_FORBIDDEN');};}
    for(const name of ['log','warn','error']){saved.push([console,name,console[name]]);console[name]=(...args)=>logs.push(args);}
  });
  test.after(()=>{for(const [object,name,value] of saved)object[name]=value;require('node:assert/strict').equal(attempts,0);require('node:assert/strict').deepEqual(logs,[]);});
}
module.exports={ID,OTHER_ID,A,B,BIND,RAW,DIGEST,COOKIE,M,env,testCA,request,response,row,sqlError,fixture,operation,authenticated,guardNetwork};
