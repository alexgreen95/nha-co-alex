const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
async function setup(n=1){
 const chapters=Array.from({length:Math.max(n,2)},(_,i)=>({id:101+i,story_id:1+i,chapter_number:1,title:'First',published:true}));chapters.push({id:201,story_id:1,chapter_number:2,title:'Second',published:true});
 const page=await feedPage(0,{fixtures:{chapters,paragraphs:[{paragraph_number:1,content:'Reader content'}]}});
 const mock={calls:[],rows:new Map(),saved:new Set(),writeHook:null,readHook:null,fail:false,duplicate:false,active:0,maxActive:0};
 for(let i=1;i<=n;i++)mock.rows.set(A+':'+i,{user_id:A,story_id:i,chapter_id:i+100,scroll_position:10});
 await page.route(/^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/(reading_progress|saved_stories)(\?|$)/,async route=>{
  const req=route.request(),u=new URL(req.url()),table=u.pathname.split('/').pop();if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});
  const uid=(u.searchParams.get('user_id')||'eq.'+A).slice(3),body=req.postData()?JSON.parse(req.postData()):null;
  const call={table,method:req.method(),body,query:u.search,prefer:req.headers().prefer||''};mock.calls.push(call);
  let data=[],status=200;
  if(req.method()==='GET'){
   data=table==='reading_progress'?[...mock.rows.values()].filter(r=>r.user_id===uid).map(r=>({...r})):[...mock.saved].filter(k=>k.startsWith(uid+':')).map(k=>({story_id:Number(k.split(':')[1])}));
   const ids=u.searchParams.get('story_id');if(ids?.startsWith('in.')){const allowed=ids.slice(4,-1).split(',').map(Number);data=data.filter(r=>allowed.includes(r.story_id))}
   if(mock.readHook)await mock.readHook(call);
  }else{
   mock.active++;mock.maxActive=Math.max(mock.maxActive,mock.active);
   try{
    if(mock.writeHook)await mock.writeHook(call);
    if(mock.fail){status=500;data={code:'XX000',message:'Retry me'}}
    else if(table==='reading_progress'){assert(call.prefer.includes('merge-duplicates'));assert.equal(u.searchParams.get('on_conflict'),'story_id,user_id');for(const row of body)mock.rows.set(row.user_id+':'+row.story_id,row)}
    else if(req.method()==='POST'){
     assert(!call.prefer.includes('merge-duplicates'),'Saved stories must never use DO UPDATE');
     if(mock.duplicate||body.some(r=>mock.saved.has(r.user_id+':'+r.story_id))){status=409;data={code:'23505',message:'Duplicate primary key'}}else for(const row of body)mock.saved.add(row.user_id+':'+row.story_id);
    }else if(req.method()==='DELETE'){const ids=u.searchParams.get('story_id').slice(4,-1).split(',').map(Number);for(const id of ids)mock.saved.delete(uid+':'+id)}
   }finally{mock.active--}
  }
  try{await route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)})}catch(error){if(!/closed|handled|disposed/i.test(error.message))throw error}
 });
 await page.evaluate(async A=>{authUser={id:A};activateMemberSync();await loadCloudMemberState()},A);mock.calls.length=0;
 return {page,mock};
}
const writes=mock=>mock.calls.filter(c=>c.table==='reading_progress'&&c.method==='POST');
test('1/10/50 histories: only changed story is sent; unchanged/admin saves are no-ops; K rows batch',async()=>{
 for(const n of [1,10,50]){
  const {page,mock}=await setup(n);
  try{
   await page.evaluate(async()=>{setReadingProgress(1,0,120);await saveCloudMemberState()});
   assert.equal(mock.calls.length,1);assert.deepEqual(writes(mock)[0].body.map(r=>r.story_id),[1]);
   assert.equal(writes(mock)[0].body[0].scroll_position,120);
   mock.calls.length=0;await page.evaluate(async()=>{setReadingProgress(1,0,120);persistManaged();save();await saveCloudMemberState()});await page.waitForTimeout(600);assert.equal(mock.calls.length,0);
   if(n===50){await page.evaluate(async()=>{for(const id of [1,2,3])setReadingProgress(id,0,300);await saveCloudMemberState()});assert.equal(mock.calls.length,1);assert.equal(writes(mock)[0].body.length,3)}
   assert.deepEqual(page.errors,[]);
  }finally{await page.close()}
 }
});
test('single-flight retains newer generation and errors retain dirty work for retry',async()=>{
 const {page,mock}=await setup();let release;
 try{
  mock.writeHook=()=>new Promise(r=>release=r);
  await page.evaluate(()=>{setReadingProgress(1,0,100);window.firstFlush=saveCloudMemberState()});await page.waitForFunction(()=>memberSyncAccounts.get(authUser.id).sending.has(1));
  const same=await page.evaluate(()=>{setReadingProgress(1,0,200);return saveCloudMemberState()===window.firstFlush});assert(same);
  while(!release)await new Promise(r=>setTimeout(r,10));mock.writeHook=null;release();await page.evaluate(()=>window.firstFlush);
  assert.deepEqual(writes(mock).map(c=>c.body[0].scroll_position),[100,200]);assert.equal(mock.maxActive,1);
  assert.equal(await page.evaluate(()=>activateMemberSync().dirty.size),0);
  mock.fail=true;await page.evaluate(async()=>{setReadingProgress(1,0,300);await saveCloudMemberState()});assert.equal(await page.evaluate(()=>activateMemberSync().dirty.size),1);
  mock.fail=false;await page.evaluate(()=>saveCloudMemberState());assert.equal(mock.rows.get(A+':1').scroll_position,300);
 }finally{release?.();await page.close()}
});
test('rapid scroll coalesces; delayed scroll cannot use another story/account or null reader',async()=>{
 const {page,mock}=await setup();
 try{
  await page.evaluate(()=>{currentStory=stories[0];currentChapter=0;for(let i=0;i<20;i++){Object.defineProperty(window,'scrollY',{configurable:true,value:400+i});window.dispatchEvent(new Event('scroll'))}});
  await page.waitForTimeout(1000);assert.equal(writes(mock).length,1);assert.equal(writes(mock)[0].body[0].scroll_position,419);
  mock.calls.length=0;
  await page.evaluate(()=>{window.dispatchEvent(new Event('scroll'));currentStory=null});await page.waitForTimeout(700);assert.equal(mock.calls.length,0);
  await page.evaluate(()=>{currentStory=stories[0];window.dispatchEvent(new Event('scroll'));currentStory={id:2,chapters:[]}});await page.waitForTimeout(700);assert.equal(mock.calls.length,0);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('account switch cancels timers; old requests/loads never acknowledge or write into new account',async()=>{
 const {page,mock}=await setup();let release;
 try{
  await page.evaluate(()=>{setReadingProgress(1,0,200);authUser=null;activateMemberSync()});await page.waitForTimeout(600);assert.equal(writes(mock).length,0);
  await page.evaluate(async A=>{authUser={id:A};await loadCloudMemberState()},A);mock.calls.length=0;
  mock.writeHook=()=>new Promise(r=>release=r);await page.evaluate(()=>{setReadingProgress(1,0,222);window.oldFlush=saveCloudMemberState()});while(!release)await new Promise(r=>setTimeout(r,10));
  await page.evaluate(async B=>{authUser={id:B};activateMemberSync();await loadCloudMemberState();setReadingProgress(1,0,333)},B);
  mock.writeHook=null;release();await page.evaluate(async()=>{await window.oldFlush;await saveCloudMemberState()});
  assert.deepEqual(writes(mock).map(c=>[c.body[0].user_id,c.body[0].scroll_position]),[[A,222],[B,333]]);
  assert.equal(mock.rows.get(B+':1').scroll_position,333);assert.equal(await page.evaluate(()=>progress[1].scroll),333);
  await page.evaluate(()=>{setReadingProgress(1,0,444);authUser={id:'third-account'};activateMemberSync()});await page.waitForTimeout(600);assert.equal(writes(mock).length,2);
  assert.deepEqual(page.errors,[]);
 }finally{release?.();await page.close()}
});
test('late hydration cannot overwrite acknowledged progress/saved changes; later refresh can see remote state',async()=>{
 const {page,mock}=await setup();const releases=[];
 try{
  mock.readHook=()=>new Promise(r=>releases.push(r));await page.evaluate(()=>{window.loading=loadCloudMemberState()});while(releases.length<2)await new Promise(r=>setTimeout(r,10));
  await page.evaluate(async()=>{setReadingProgress(1,0,777);toggleSave(1);await Promise.all([saveCloudMemberState(),saveCloudSavedStories()])});
  mock.readHook=null;for(const release of releases)release();await page.evaluate(()=>window.loading);
  assert.equal(await page.evaluate(()=>progress[1].scroll),777);assert.deepEqual(await page.evaluate(()=>saved),[1]);
  mock.rows.get(A+':1').scroll_position=888;await page.evaluate(()=>loadCloudMemberState());assert.equal(await page.evaluate(()=>progress[1].scroll),888);
 }finally{for(const release of releases)release();await page.close()}
});
test('saved INSERT/DELETE is independent; remote saves survive; duplicate retry never uses UPDATE',async()=>{
 const {page,mock}=await setup(50);
 try{
  mock.saved.add(A+':2');
  await page.evaluate(async()=>{setReadingProgress(1,0,40);toggleSave(1);await Promise.all([saveCloudMemberState(),saveCloudSavedStories()])});
  assert.equal(mock.calls.length,2);assert.equal(mock.calls.filter(c=>c.table==='saved_stories').length,1);assert(mock.saved.has(A+':2'));
  mock.calls.length=0;await page.evaluate(async()=>{toggleSave(1);await saveCloudSavedStories()});assert.equal(mock.calls.length,1);assert.equal(mock.calls[0].method,'DELETE');assert(mock.saved.has(A+':2'));
  mock.calls.length=0;await page.evaluate(async()=>{toggleSave(2);await saveCloudSavedStories()});assert.equal(mock.calls.length,2);assert.deepEqual(mock.calls.map(c=>c.method),['POST','GET']);assert(mock.calls[1].query.includes('story_id=in.'));
 }finally{await page.close()}
});
test('resume preserves chapter/pixel, explicit chapter resets scroll; slow switch sends changed story only; anon stays RAM-only',async()=>{
 const {page,mock}=await setup(10);
 try{
  await page.evaluate(async()=>{setReadingProgress(1,1,240);await saveCloudMemberState();await read(1)});
  assert.equal(await page.evaluate(()=>currentChapter),1);assert.equal(await page.evaluate(()=>progress[1].scroll),240);
  await page.evaluate(async()=>{await read(1,0)});assert.equal(await page.evaluate(()=>progress[1].scroll),0);
  await page.evaluate(()=>saveCloudMemberState());mock.calls.length=0;
  await page.route('**/rest/v1/paragraphs**',async route=>{await new Promise(r=>setTimeout(r,700));await route.fulfill({status:200,headers,contentType:'application/json',body:'[{"paragraph_number":1,"content":"Slow chapter"}]'})});
  await page.evaluate(()=>{currentStory.chapters[1]._parasLoaded=false});await page.evaluate(()=>moveChapter(1));await page.waitForTimeout(900);
  assert(writes(mock).length<=2);assert(writes(mock).every(c=>c.body.length===1&&c.body[0].story_id===1));
  await page.evaluate(()=>{authUser=null;activateMemberSync();setReadingProgress(1,0,90);toggleSave(1)});mock.calls.length=0;await page.waitForTimeout(800);
  assert.equal(mock.calls.length,0);assert.equal(await page.evaluate(()=>progress[1].scroll),90);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('saved reversal during flight retains final intent; different-story remote progress is not rewritten',async()=>{
 const {page,mock}=await setup(50);let release;
 try{
  mock.writeHook=call=>call.table==='saved_stories'?new Promise(r=>release=r):undefined;
  await page.evaluate(()=>{toggleSave(1);window.savedFlush=saveCloudSavedStories()});while(!release)await new Promise(r=>setTimeout(r,10));
  await page.evaluate(()=>toggleSave(1));mock.writeHook=null;release();await page.evaluate(()=>window.savedFlush);
  assert(!mock.saved.has(A+':1'));assert.deepEqual(mock.calls.map(c=>c.method),['POST','DELETE']);
  mock.calls.length=0;mock.rows.get(A+':2').scroll_position=999;
  await page.evaluate(async()=>{setReadingProgress(1,0,80);await saveCloudMemberState()});assert.equal(mock.rows.get(A+':2').scroll_position,999);
  // No revision exists: same-story writes are still last accepted write, not newest-device wins.
  mock.rows.get(A+':1').scroll_position=1000;
  await page.evaluate(async()=>{setReadingProgress(1,0,70);await saveCloudMemberState()});assert.equal(mock.rows.get(A+':1').scroll_position,70);
 }finally{release?.();await page.close()}
});
test('refresh restores acknowledged chapter/pixel from cloud without rewriting history',async()=>{
 const {page,mock}=await setup(10);
 try{
  await page.evaluate(async()=>{setReadingProgress(1,1,240);await saveCloudMemberState()});mock.calls.length=0;
  await page.reload({waitUntil:'networkidle'});
  await page.evaluate(async A=>{authUser={id:A};activateMemberSync();await loadCloudMemberState();await read(1)},A);
  assert.equal(await page.evaluate(()=>currentChapter),1);assert.equal(await page.evaluate(()=>progress[1].scroll),240);
  assert.equal(writes(mock).length,0);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('fast chapter switches coalesce to final chapter; delayed account hydration is discarded',async()=>{
 const {page,mock}=await setup(10);const releases=[];
 try{
  await page.evaluate(async()=>{await read(1,0);await saveCloudMemberState()});mock.calls.length=0;
  await page.evaluate(async()=>{await moveChapter(1);await moveChapter(-1);await moveChapter(1);await saveCloudMemberState()});
  assert.equal(mock.rows.get(A+':1').chapter_id,201);assert.equal(writes(mock).length,1);
  mock.readHook=()=>new Promise(r=>releases.push(r));await page.evaluate(()=>{window.oldLoad=loadCloudMemberState()});while(releases.length<2)await new Promise(r=>setTimeout(r,10));
  mock.readHook=null;mock.rows.set(B+':1',{user_id:B,story_id:1,chapter_id:101,scroll_position:555});
  await page.evaluate(async B=>{authUser={id:B};activateMemberSync();await loadCloudMemberState()},B);
  for(const release of releases)release();await page.evaluate(()=>window.oldLoad);
  assert.equal(await page.evaluate(()=>progress[1].scroll),555);assert.equal(await page.evaluate(()=>progress[1].chapter),0);assert.deepEqual(page.errors,[]);
 }finally{for(const release of releases)release();await page.close()}
});
