const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const A='reader-user',B='second-user',H={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
async function wait(f){for(let i=0;i<1000;i++){if(f())return;await new Promise(r=>setTimeout(r,5))}throw Error('Request not started')}
async function setup(){
 const chapterRows=[{id:11,story_id:1,chapter_number:1,published:true},{id:12,story_id:1,chapter_number:7,published:false}];
 const calls=[],mock={chapterRows,mapHook:null,historyHook:null,fail:false,positions:{[A]:[{story_id:1,chapter_id:12,scroll_position:123}],[B]:[{story_id:1,chapter_id:11,scroll_position:456}]},saves:{[A]:[{story_id:1}],[B]:[]}};
 const page=await feedPage(0,{fixtures:{stories:[{id:1,title:'One',published:true}],chapters:chapterRows}});
 await page.route('**/rest/v1/**',async r=>{
  const req=r.request(),u=new URL(req.url()),table=u.pathname.split('/').pop();if(req.method()==='OPTIONS')return r.fulfill({status:200,headers:H});
  if(!['chapters','reading_progress','saved_stories'].includes(table))return r.fallback();
  const owner=(u.searchParams.get('user_id')||'eq.none').slice(3),call={table,owner,method:req.method(),query:u.search};calls.push(call);
  assert.equal(req.method(),'GET','Map/history hydration must not write');
  const data=table==='chapters'?mock.chapterRows.slice(Number(u.searchParams.get('offset')||0),Number(u.searchParams.get('offset')||0)+Number(u.searchParams.get('limit')||1000)).map(r=>({...r})):table==='reading_progress'?(mock.positions[owner]||[]):(mock.saves[owner]||[]),fail=table==='chapters'&&mock.fail;
  if(table==='chapters'&&mock.mapHook)await mock.mapHook(call);if(table!=='chapters'&&mock.historyHook)await mock.historyHook(call);
  return r.fulfill({status:fail?400:200,headers:H,json:fail?{message:'map failed'}:data});
 });
 await page.evaluate(A=>{authUser={id:A};activateMemberSync()},A);return {page,calls,mock};
}
const state=p=>p.evaluate(()=>({owner:memberSyncOwner,progress,saved,map:cloudChapterMap,ready:activateMemberSync()?.progressReady}));
test('two concurrent same-account histories share one current map; repeated completed load remains fresh',async()=>{
 const {page,calls,mock}=await setup(),g=gate();let maps=0;
 try{mock.mapHook=()=>{maps++;return g.promise};await page.evaluate(()=>{window.loads=[loadCloudMemberState(),loadCloudMemberState()]});await wait(()=>maps===1);g.resolve();await page.evaluate(()=>Promise.all(loads));
 assert.deepEqual(calls.map(c=>c.table),['chapters','saved_stories','reading_progress']);assert.equal((await state(page)).progress[1].chapter,6);
 mock.mapHook=null;calls.length=0;await page.evaluate(()=>loadCloudMemberState());assert.equal(calls.length,3,'No completed-map cache: later explicit hydration still gets fresh metadata');assert.deepEqual(page.errors,[]);
 }finally{g.resolve();await page.close()}
});
test('map failure releases flight and blocks false-ready history; normal retry succeeds without writes',async()=>{
 const {page,calls,mock}=await setup();try{mock.fail=true;await page.evaluate(()=>loadCloudMemberState());assert.equal(calls.length,1);assert.equal((await state(page)).ready,false);assert.equal(await page.evaluate(()=>memberChapterMapFlights.size),0);
 mock.fail=false;await page.evaluate(()=>loadCloudMemberState());assert.equal(calls.length,4);assert.deepEqual((await state(page)).progress,{1:{chapter:6,scroll:123}});assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
for(const scenario of ['A-to-B','A-to-B-to-A','logout'])test(`held A map cannot apply after ${scenario}`,async()=>{
 const {page,calls,mock}=await setup(),g=gate();let maps=0;
 try{mock.mapHook=()=>{maps++;return g.promise};await page.evaluate(()=>{window.oldLoad=loadCloudMemberState()});await wait(()=>maps===1);mock.mapHook=null;
 if(scenario==='logout')await page.evaluate(()=>{authUser=null;activateMemberSync()});
 else{await page.evaluate(async B=>{authUser={id:B};activateMemberSync();await loadCloudMemberState()},B);if(scenario==='A-to-B-to-A'){mock.positions[A]=[{story_id:1,chapter_id:11,scroll_position:789}];await page.evaluate(async A=>{authUser={id:A};activateMemberSync();await loadCloudMemberState()},A)}}
 const expected=await state(page);g.resolve();await page.evaluate(()=>oldLoad);assert.deepEqual(await state(page),expected);assert.equal(calls.filter(c=>c.owner===A&&c.table==='reading_progress').length,scenario==='A-to-B-to-A'?1:0);assert.deepEqual(page.errors,[]);
 }finally{g.resolve();await page.close()}
});
test('older metadata map cannot replace newer map; non-equivalent generation cannot join old work',async()=>{
 const {page,calls,mock}=await setup(),g=gate();let maps=0;
 try{mock.mapHook=()=>{maps++;return g.promise};await page.evaluate(()=>{window.oldGenerationLoad=loadCloudMemberState()});await wait(()=>maps===1);
 mock.mapHook=null;mock.chapterRows=[{id:22,story_id:1,chapter_number:9,published:false}];mock.positions[A]=[{story_id:1,chapter_id:22,scroll_position:88}];
 await page.evaluate(async()=>{publicMetadataRevision++;await loadCloudMemberState()});assert.equal(calls.filter(c=>c.table==='chapters').length,2);assert.deepEqual((await state(page)).map,{'1_8':22});
 g.resolve();await page.evaluate(()=>oldGenerationLoad);assert.deepEqual((await state(page)).map,{'1_8':22});assert.deepEqual((await state(page)).progress,{1:{chapter:8,scroll:88}});assert.deepEqual(page.errors,[]);
 }finally{g.resolve();await page.close()}
});
test('map remains bound to history read; metadata invalidation automatically retries latest map/history',async()=>{
 const {page,mock}=await setup(),g=gate();let history=0;
 try{mock.historyHook=()=>{history++;return g.promise};await page.evaluate(()=>{window.oldHistory=loadCloudMemberState()});await wait(()=>history===2);
 mock.positions[A]=[{story_id:1,chapter_id:12,scroll_position:789}];mock.historyHook=null;await page.evaluate(()=>{publicMetadataRevision++});g.resolve();await page.evaluate(()=>oldHistory);assert.equal((await state(page)).ready,true);
 assert.deepEqual((await state(page)).progress,{1:{chapter:6,scroll:789}});assert.deepEqual(page.errors,[]);
 }finally{g.resolve();await page.close()}
});
test('hidden valid chapter not in public subset preserves numeric resume and saved results; empty map/history valid',async()=>{
 const {page,calls,mock}=await setup();try{
 assert.deepEqual(await page.evaluate(()=>stories[0].chapters.map(c=>c.id)),[11]);await page.evaluate(()=>loadCloudMemberState());assert.deepEqual((await state(page)).progress,{1:{chapter:6,scroll:123}});assert.deepEqual((await state(page)).saved,[1]);assert.equal(calls[0].query.includes('select=id%2Cstory_id%2Cchapter_number'),true);
 mock.chapterRows=[];mock.positions[A]=[];mock.saves[A]=[];await page.evaluate(()=>loadCloudMemberState());const empty=await state(page);assert.deepEqual(empty.map,{});assert.deepEqual(empty.progress,{});assert.deepEqual(empty.saved,[]);assert.equal(empty.ready,true);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('current initialization retries automatically if metadata changes during held map read',async()=>{
 const {page,calls,mock}=await setup(),g=gate();let maps=0;
 try{mock.mapHook=()=>{maps++;return g.promise};await page.evaluate(()=>{window.initialMapLoad=loadCloudMemberState()});await wait(()=>maps===1);
 mock.mapHook=null;mock.chapterRows=[{id:22,story_id:1,chapter_number:9}];mock.positions[A]=[{story_id:1,chapter_id:22,scroll_position:88}];await page.evaluate(()=>{publicMetadataRevision++});g.resolve();await page.evaluate(()=>initialMapLoad);
 assert.equal(calls.filter(c=>c.table==='chapters').length,2);assert.equal((await state(page)).ready,true);assert.deepEqual((await state(page)).progress,{1:{chapter:8,scroll:88}});assert.deepEqual(page.errors,[]);
 }finally{g.resolve();await page.close()}
});
test('shared map query retains full 1000-row pagination and hidden final-page chapter',async()=>{
 const {page,calls,mock}=await setup();try{
 mock.chapterRows=Array.from({length:1001},(_,i)=>({id:100+i,story_id:1,chapter_number:i+1,published:false}));mock.positions[A]=[{story_id:1,chapter_id:1100,scroll_position:999}];
 await page.evaluate(()=>Promise.all([loadCloudMemberState(),loadCloudMemberState()]));assert.equal(calls.filter(c=>c.table==='chapters').length,2);assert.equal(calls.length,4);assert.equal(Object.keys((await state(page)).map).length,1001);assert.deepEqual((await state(page)).progress,{1:{chapter:1000,scroll:999}});assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
for(const phase of ['map','history'])test(`repeated metadata invalidation during ${phase} stops after one recovery; later top-level load retries`,async()=>{
 const {page,calls,mock}=await setup();let invalidations=0;
 try{
 const invalidate=async()=>{if(invalidations++<2)await page.evaluate(()=>{publicMetadataRevision++})};
 if(phase==='map')mock.mapHook=invalidate;
 else mock.historyHook=async call=>{if(call.table==='reading_progress')await invalidate()};
 await page.evaluate(()=>loadCloudMemberState());
 assert.equal(calls.filter(c=>c.table==='chapters').length,2,'Exactly two attempts, never a third');
 assert.equal(calls.length,phase==='map'?2:6,'Bounded request budget');
 const stopped=await state(page);assert.equal(stopped.ready,false);assert.deepEqual(stopped.progress,{});assert.deepEqual(stopped.saved,[]);
 assert.equal(await page.evaluate(()=>activateMemberSync().savedReady),false);
 mock.mapHook=null;mock.historyHook=null;calls.length=0;
 await page.evaluate(()=>loadCloudMemberState());assert.equal(calls.length,3);assert.equal((await state(page)).ready,true);
 assert.deepEqual((await state(page)).progress,{1:{chapter:6,scroll:123}});assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
for(const scenario of ['superseded','switch','logout'])test(`held recovery cannot apply or retry after ${scenario}`,async()=>{
 const {page,calls,mock}=await setup(),g=gate();let maps=0;
 try{
 mock.mapHook=async()=>{maps++;if(maps===1)await page.evaluate(()=>{publicMetadataRevision++});else if(maps===2)await g.promise};
 await page.evaluate(()=>{window.recoveryLoad=loadCloudMemberState()});await wait(()=>maps===2);
 mock.mapHook=null;
 if(scenario==='logout')await page.evaluate(()=>{authUser=null;activateMemberSync()});
 else await page.evaluate(async({owner})=>{authUser={id:owner};activateMemberSync();publicMetadataRevision++;await loadCloudMemberState()},{owner:scenario==='switch'?B:A});
 const expected=await state(page),before=calls.length;g.resolve();await page.evaluate(()=>recoveryLoad);
 assert.equal(calls.length,before,'Obsolete recovery does not start more work');assert.deepEqual(await state(page),expected);assert.deepEqual(page.errors,[]);
 }finally{g.resolve();await page.close()}
});
