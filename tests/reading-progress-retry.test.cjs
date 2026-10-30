'use strict';const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const browser=require('./helpers/performance-browser.cjs');before(browser.start);after(browser.stop);const path='/truyen/audit-story/chuong-1';
async function setup(){const f=await browser.fixture({signed:true}),calls=[],mode={status:200},stored=[];await f.context.route(u=>u.pathname.endsWith('/reading_progress'),async r=>{if(r.request().method()!=='POST')return r.fallback();const rows=r.request().postDataJSON(),status=mode.status;calls.push({at:Date.now(),status,rows});if(mode.hold)await mode.hold;if(status==='network')return r.abort('failed');if(status===200)stored.push(...rows);return r.fulfill({status,contentType:'application/json',body:status===200?'[]':JSON.stringify({code:status===403?'42501':'fixture',message:'Fixture rejected progress'})});});await f.page.goto(f.base+path);await f.page.waitForFunction(()=>activateMemberSync().progressReady&&!NcaReaderPosition.isRestoring()&&!activateMemberSync().dirty.size&&!activateMemberSync().progressFlight);return Object.assign(f,{calls,mode,stored});}
async function failure(p){await p.waitForFunction(()=>activateMemberSync().progressRetry.failures>0&&!activateMemberSync().progressFlight);}
async function drained(p){await p.waitForFunction(()=>!activateMemberSync().dirty.size&&!activateMemberSync().progressFlight,null,{timeout:12000});}
test('real 60s terminal/transient budgets: 400/401/403, 429/500/503/network, and two tabs',async()=>{
 await Promise.all([400,401,403,429,500,503,'network','two-tabs'].map(async status=>{
  const f=await setup();try{
   let other;if(status==='two-tabs'){other=await f.context.newPage();await other.goto(f.base+path);await other.waitForFunction(()=>activateMemberSync().progressReady&&!NcaReaderPosition.isRestoring()&&document.querySelector('#reader:not(.hidden)'));await drained(other);}
   const n=f.calls.length;f.mode.status=status==='two-tabs'?503:status;await f.page.evaluate(()=>setReadingProgress(1,0,700,true));if(other)await other.evaluate(()=>setReadingProgress(1,0,350,true));await f.page.waitForTimeout(60000);const writes=f.calls.slice(n);
   if([400,401,403].includes(status)){assert.equal(writes.length,1);assert.equal(await f.page.evaluate(()=>activateMemberSync().progressRetry.blocked),true);}else{assert(writes.length<=(other?10:5),JSON.stringify(writes));assert(writes.length>=(other?6:3));}
   assert(await f.page.evaluate(()=>activateMemberSync().dirty.size>0));console.log(JSON.stringify({scenario:'retry60',status,posts:writes.length,dirtyRetained:true}));assert.deepEqual(f.errors,[]);
  }finally{await f.close()}
 }));
});
test('new dirty values cannot bypass backoff; successful recovery sends the latest value once',async()=>{
 const f=await setup();try{f.mode.status=503;const n=f.calls.length;await f.page.evaluate(()=>setReadingProgress(1,0,700,true));await failure(f.page);const next=await f.page.evaluate(()=>activateMemberSync().progressRetry.nextAt);await f.page.evaluate(()=>{for(let y=701;y<=720;y++)setReadingProgress(1,0,y);void saveCloudMemberState()});await f.page.waitForTimeout(500);assert.equal(f.calls.length-n,1);assert.equal(await f.page.evaluate(()=>activateMemberSync().progressRetry.nextAt),next);f.mode.status=200;await drained(f.page);assert.equal(f.calls.length-n,2);assert.equal(f.stored.at(-1).scroll_position,720);assert.equal(await f.page.evaluate(()=>activateMemberSync().progressRetry.failures),0);assert.deepEqual(f.errors,[]);}finally{await f.close()}
});
test('offline avoids attempts and online recovery preserves the latest dirty position',async()=>{
 const f=await setup();try{const n=f.calls.length;await f.page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});setReadingProgress(1,0,750,true);void saveCloudMemberState()});await f.page.waitForTimeout(1000);assert.equal(f.calls.length,n);await f.page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});dispatchEvent(new Event('online'))});await drained(f.page);assert.equal(f.calls.length-n,1);assert.equal(f.stored.at(-1).scroll_position,750);assert.deepEqual(f.errors,[]);}finally{await f.close()}
});
test('exhausted retry window retains dirty state until later meaningful activity',async()=>{
 const f=await setup();try{
  await f.page.evaluate(()=>{window.retryClock=Date.now();Date.now=()=>retryClock});
  f.mode.status=503;const n=f.calls.length;await f.page.evaluate(()=>setReadingProgress(1,0,700,true));await failure(f.page);
  await f.page.evaluate(()=>{retryClock+=120001;void saveCloudMemberState()});await f.page.waitForTimeout(500);
  assert.equal(f.calls.length-n,1);assert.equal(await f.page.evaluate(()=>activateMemberSync().progressRetry.blocked),true);assert.equal(await f.page.evaluate(()=>activateMemberSync().dirty.size),1);
  f.mode.status=200;await f.page.evaluate(()=>{retryClock+=60000;setReadingProgress(1,0,800)});await drained(f.page);
  assert.equal(f.calls.length-n,2);assert.equal(f.stored.at(-1).scroll_position,800);assert.deepEqual(f.errors,[]);
 }finally{await f.close()}
});
test('hidden failed writers pause and visibility recovery honors the pending deadline',async()=>{
 const f=await setup();try{f.mode.status=503;const n=f.calls.length;await f.page.evaluate(()=>setReadingProgress(1,0,700,true));await failure(f.page);await f.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});await f.page.waitForTimeout(4000);assert.equal(f.calls.length-n,1);f.mode.status=200;await f.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});await drained(f.page);assert.equal(f.calls.length-n,2);assert.deepEqual(f.errors,[]);}finally{await f.close()}
});
test('terminal state wakes on auth recovery; logout/account switch cancels the old retry',async()=>{
 const f=await setup();try{f.mode.status=401;const n=f.calls.length;await f.page.evaluate(()=>setReadingProgress(1,0,700,true));await failure(f.page);await f.page.evaluate(()=>setReadingProgress(1,0,710));await f.page.waitForTimeout(700);assert.equal(f.calls.length-n,1);f.mode.status=200;await f.page.evaluate(()=>handleAuthState('TOKEN_REFRESHED',{user:{id:'reader',user_metadata:{}}}));await drained(f.page);assert.equal(f.calls.length-n,2);assert.equal(f.stored.at(-1).scroll_position,710);
 f.mode.status=503;await f.page.evaluate(()=>setReadingProgress(1,0,800,true));await failure(f.page);const before=f.calls.length;await f.page.evaluate(()=>{applyAuthUser(null);activateMemberSync()});await f.page.waitForTimeout(3500);assert.equal(f.calls.length,before);await f.page.evaluate(async()=>{applyAuthUser({id:'other',user_metadata:{}});await loadCloudMemberState();setReadingProgress(1,0,300,true)});f.mode.status=200;await drained(f.page);assert.equal(f.calls.at(-1).rows[0].user_id,'other');assert.equal(f.calls.at(-1).rows[0].scroll_position,300);assert.deepEqual(f.errors,[]);
 }finally{await f.close()}
});

test('an old-token terminal response cannot undo an auth recovery while it was in flight',async()=>{
 const f=await setup();let release;try{
  const n=f.calls.length;f.mode.status=401;f.mode.hold=new Promise(r=>release=r);await f.page.evaluate(()=>setReadingProgress(1,0,700,true));await f.page.waitForFunction(()=>activateMemberSync().sending.has(1));await f.page.waitForTimeout(100);assert.equal(f.calls.length-n,1);
  await f.page.evaluate(()=>handleAuthState('TOKEN_REFRESHED',{user:{id:'reader',user_metadata:{}}}));f.mode.status=200;f.mode.hold=null;release();await drained(f.page);
  assert.equal(f.calls.length-n,2);assert.equal(f.stored.at(-1).scroll_position,700);assert.equal(await f.page.evaluate(()=>activateMemberSync().progressRetry.blocked),false);assert.deepEqual(f.errors,[]);
 }finally{release?.();await f.close()}
});
