'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/freshness-ui.js'),'utf8');
const start=source.indexOf('  function reload(){'),end=source.indexOf('\n  function boot(){',start);
assert(start>=0&&end>start);
function fixture(owner=null){
  const pending=[],events=[];
  const context={authUser:owner?{id:owner}:null,controller:{reset:()=>events.push('reset'),load:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))},configureNotificationRoleTab:()=>events.push('role'),queueFreshnessRefresh:()=>events.push('refresh'),scheduleExpiryReload:()=>events.push('expiry'),console:{warn:()=>events.push('warning')}};
  vm.createContext(context);vm.runInContext('let reloadFlight=null,activeCompletion=null;'+source.slice(start,end)+';this.reload=reload;',context);
  return {context,pending,events,reload:context.reload};
}
for(const owner of [null,'reader'])test('same-account startup/auth callbacks join one freshness load: '+owner,async()=>{
  const f=fixture(owner),a=f.reload(),b=f.reload();assert.equal(a,b);assert.equal(f.pending.length,1);
  f.pending[0].resolve();await a;assert.deepEqual(f.events,['reset','role','refresh','expiry']);
  const next=f.reload();assert.notEqual(next,a);assert.equal(f.pending.length,2);f.pending[1].resolve();await next;
});
test('account change starts fresh work and the stale finalizer cannot clear it',async()=>{
  const f=fixture('A'),a=f.reload();f.context.authUser={id:'B'};const b=f.reload();assert.notEqual(a,b);assert.equal(f.pending.length,2);
  f.pending[0].resolve();await a;assert.equal(f.reload(),b);assert.deepEqual(f.events,['reset','reset']);
  f.pending[1].resolve();await b;assert.deepEqual(f.events,['reset','reset','role','refresh','expiry']);
});
test('failed load releases the flight for retry',async()=>{
  const f=fixture(),a=f.reload();f.pending[0].reject(Error('fixture failure'));await a;
  const b=f.reload();assert.notEqual(a,b);assert.equal(f.pending.length,2);f.pending[1].resolve();await b;
});
test('logout prevents old-account completion from refreshing UI',async()=>{
  const f=fixture('reader'),a=f.reload();f.context.authUser=null;f.pending[0].resolve();await a;
  assert.deepEqual(f.events,['reset']);const b=f.reload();f.pending[1].resolve();await b;
});
