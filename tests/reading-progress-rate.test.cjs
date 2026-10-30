'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const browser=require('./helpers/performance-browser.cjs');before(browser.start);after(browser.stop);
const path='/truyen/audit-story/chuong-1';
async function setup({signed=true,secondStory=false}={}){
 const f=await browser.fixture({signed}),writes=[],stored=new Map(),control={hold:null};
 if(secondStory){f.fixtures.stories.push({id:2,title:'Other Story',published:true,status:'ongoing'});f.fixtures.chapters.push({id:3,story_id:2,chapter_number:1,title:'Other',published:true});}
 await f.context.route(url=>url.pathname.endsWith('/reading_progress'),async r=>{
  if(r.request().method()!=='POST')return r.fallback();
  const rows=r.request().postDataJSON();writes.push({at:Date.now(),rows});if(control.hold)await control.hold;
  for(const row of rows)stored.set(row.user_id+':'+row.story_id,row);
  await r.fulfill({status:200,contentType:'application/json',body:'[]'});
 });
 await f.page.goto(f.base+path);await f.page.waitForFunction(()=>!NcaReaderPosition.isRestoring()&&document.querySelector('#reader:not(.hidden) #chapter .para'));
 if(signed)await f.page.waitForFunction(()=>activateMemberSync().progressReady&&!activateMemberSync().dirty.size&&!activateMemberSync().progressFlight);
 return Object.assign(f,{writes,stored,control});
}
async function drained(p,timeout=12000){await p.waitForFunction(()=>!activateMemberSync().dirty.size&&!activateMemberSync().progressFlight,null,{timeout});}
function gaps(writes){return writes.slice(1).map((w,i)=>w.at-writes[i].at)}
async function scroll(p,interval,step){return p.evaluate(async({interval,step})=>{const start=performance.now(),initial=scrollY;let n=0;await new Promise(resolve=>{const timer=setInterval(()=>{if(performance.now()-start>=60000){clearInterval(timer);resolve();return}scrollTo({top:initial+step*(++n),behavior:'instant'})},interval)});return {gestures:n,final:scrollY};},{interval,step});}
test('60-second request budgets: idle, continuous scroll, 39 gestures, and two same-account tabs',async()=>{
 await Promise.all([
  (async()=>{const f=await setup();try{const n=f.writes.length;await f.page.waitForTimeout(60000);assert.equal(f.writes.length-n,0);console.log(JSON.stringify({scenario:'idle60',additionalPosts:0}));assert.deepEqual(f.errors,[]);}finally{await f.close()}})(),
  (async()=>{const f=await setup();try{const n=f.writes.length,result=await scroll(f.page,33,2);assert.equal(f.writes.length-n,0);await f.page.waitForTimeout(1000);await drained(f.page);assert.equal(f.writes.length-n,1);assert.equal(f.stored.get('reader:1').scroll_position,result.final);console.log(JSON.stringify({scenario:'continuous60',activePosts:0,trailingPosts:1,final:result.final}));assert.deepEqual(f.errors,[]);}finally{await f.close()}})(),
  (async()=>{const f=await setup();try{const n=f.writes.length,result=await scroll(f.page,1500,150);await f.page.waitForTimeout(1000);await drained(f.page);const writes=f.writes.slice(n);assert(writes.length<=14);assert(writes.length>0);assert(gaps(writes).every(ms=>ms>=4990));assert.equal(f.stored.get('reader:1').scroll_position,result.final);console.log(JSON.stringify({scenario:'gestures60',...result,routinePosts:writes.length,minGap:Math.min(...gaps(writes)),stored:f.stored.get('reader:1').scroll_position}));assert.deepEqual(f.errors,[]);}finally{await f.close()}})(),
  (async()=>{const f=await setup();try{const other=await f.context.newPage();await other.goto(f.base+path);await other.waitForFunction(()=>document.querySelector('#reader:not(.hidden) #chapter .para')&&!NcaReaderPosition.isRestoring()&&activateMemberSync().progressReady);await drained(other);const n=f.writes.length;const positions=await Promise.all([scroll(f.page,1500,100),scroll(other,1500,80)]);await f.page.waitForTimeout(1000);await Promise.all([drained(f.page),drained(other)]);const writes=f.writes.slice(n);assert(writes.length<=14,JSON.stringify(writes));assert(gaps(writes).every(ms=>ms>=4990));assert(positions.some(p=>p.final===f.stored.get('reader:1').scroll_position));console.log(JSON.stringify({scenario:'twoTabsGestures60',routinePosts:writes.length,minGap:Math.min(...gaps(writes)),finals:positions.map(p=>p.final)}));assert.deepEqual(f.errors,[]);}finally{await f.close()}})()
 ]);
});
test('20 routine updates inside a window send only the latest value',async()=>{
 const f=await setup();try{const n=f.writes.length;await f.page.evaluate(()=>{for(let y=701;y<=720;y++)setReadingProgress(1,0,y)});await f.page.waitForTimeout(700);assert.equal(f.writes.length,n);await drained(f.page);assert.equal(f.writes.length-n,1);assert.equal(f.stored.get('reader:1').scroll_position,720);assert.deepEqual(f.errors,[]);}finally{await f.close()}
});
test('in-flight successful open does not let accumulated routine dirty values bypass the interval',async()=>{
 const f=await setup();let release;f.control.hold=new Promise(r=>release=r);try{
  const n=f.writes.length;await f.page.evaluate(()=>{setReadingProgress(1,0,700,true);void saveCloudMemberState()});await f.page.waitForFunction(()=>activateMemberSync().sending.has(1));
  await f.page.evaluate(()=>{for(let y=701;y<=720;y++)setReadingProgress(1,0,y)});f.control.hold=null;release();await f.page.waitForTimeout(700);assert.equal(f.writes.length-n,1);
  await drained(f.page);assert.equal(f.writes.length-n,2);assert(gaps(f.writes.slice(n))[0]>=4990);assert.equal(f.stored.get('reader:1').scroll_position,720);assert.deepEqual(f.errors,[]);
 }finally{release();await f.close()}
});
test('Next/Prev/TOC keep one explicit open write each without waiting five seconds',async()=>{
 const f=await setup();try{let n=f.writes.length;for(const action of ['moveChapter(1)','moveChapter(-1)','goChapter(1)']){await f.page.evaluate(action);await drained(f.page);assert.equal(f.writes.length-n,1);assert.equal(f.writes.at(-1).rows[0].scroll_position,0);n=f.writes.length;}assert.deepEqual(f.errors,[]);}finally{await f.close()}
});
test('per-story budget does not block another story and account switch cancels old trailing work',async()=>{
 const f=await setup({secondStory:true});try{
  const n=f.writes.length;await f.page.evaluate(()=>{setReadingProgress(1,0,700);setReadingProgress(2,0,200);void saveCloudMemberState()});await f.page.waitForTimeout(350);
  assert.deepEqual(f.writes.slice(n).flatMap(w=>w.rows.map(r=>r.story_id)),[2]);
  await f.page.evaluate(async()=>{applyAuthUser({id:'other',user_metadata:{}});await loadCloudMemberState();setReadingProgress(1,0,300,true);await saveCloudMemberState()});
  assert.equal(f.writes.at(-1).rows[0].user_id,'other');assert.equal(f.writes.at(-1).rows[0].scroll_position,300);await f.page.waitForTimeout(5100);
  assert.equal(f.writes.slice(n).flatMap(w=>w.rows).filter(r=>r.user_id==='reader'&&r.story_id===1).length,0);assert.deepEqual(f.errors,[]);
 }finally{await f.close()}
});
test('guest position changes stay local',async()=>{
 const f=await setup({signed:false});try{await f.page.evaluate(()=>{for(let y=1;y<=20;y++)setReadingProgress(1,0,y)});await f.page.waitForTimeout(800);assert.equal(f.writes.length,0);assert.deepEqual(f.errors,[]);}finally{await f.close()}
});
