const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');before(startBrowser);after(stopBrowser);
const A='00000000-0000-0000-0000-000000000001';
const row={id:1,title:'Baseline story',author:'Writer',published:true,status:'writing',baseline_views:10000,baseline_likes:1050};
const chapters=[{id:11,story_id:1,chapter_number:1,title:'First',published:true},{id:12,story_id:1,chapter_number:2,title:'Second',published:true},{id:13,story_id:1,chapter_number:3,title:'Hidden',published:false}];
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
function fixtures(realViews=0,likes=[]){return{stories:[row],chapters,paragraphs:[{paragraph_number:1,content:'Reader text'}],chapter_likes:likes,nca_story_view_counts:[{story_id:1,view_count:10000+realViews}]}}
async function setup(realViews=0,likes=[]){const traffic=[];const page=await feedPage(0,{fixtures:fixtures(realViews,likes),onRequest:u=>traffic.push(u)});return{page,traffic}}
async function summary(page){return page.evaluate(()=>({views:stories[0].views,baselineViews:stories[0].baselineViews,baselineLikes:stories[0].baselineLikes,total:storyLikeTotal(stories[0]),liked:likedChapters}))}
test('zero real events: same totals on home/detail/saved/profile; chapter is real-only; request budget unchanged',async()=>{
 const {page,traffic}=await setup();try{
  assert.deepEqual(await summary(page),{views:10000,baselineViews:10000,baselineLikes:1050,total:1050,liked:[]});
  const get=sel=>page.locator(sel).allTextContents();
  assert.deepEqual((await get('#stories .stats .stat')).map(x=>x.trim()),['10K','1.05K','7']);
  await page.evaluate(()=>{openStory(1);saved=[1];renderSaved();renderProfileStoryShelf('saved');currentStory=stories[0];currentChapter=0;renderChapterHeart()});
  assert.deepEqual((await get('#introStats .stat')).map(x=>x.trim()),['10K','1.05K','7']);
  assert.deepEqual((await get('#saved .stats .stat')).map(x=>x.trim()),['10K','1.05K','7']);
  assert.deepEqual((await get('.profile-story-stats span')).map(x=>x.trim()),['10K','1.05K','7']);
  assert.equal(await page.locator('#chapterHeartRow button span').count(),0);assert.equal(await page.locator('#chapterHeartRow button').getAttribute('aria-pressed'),'false');
  assert.equal(traffic.filter(u=>u.pathname.startsWith('/rest/v1/')).length,11);
  assert(!traffic.some(u=>u.pathname.endsWith('/story_likes')||u.pathname.endsWith('/story_views')));assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('existing activity + hydration/reload/RPC refresh compose baseline exactly once and keep comment hearts/counts',async()=>{
 const likes=[{chapter_id:11,user_id:A},{chapter_id:12,user_id:'other'},{chapter_id:13,user_id:'hidden'}];const {page}=await setup(8,likes);try{
  assert.equal((await summary(page)).views,10008);assert.equal((await summary(page)).total,1052);
  const before=await page.evaluate(()=>JSON.stringify({comments,reviews,progress}));
  await page.evaluate(async()=>{await refreshPublicStoryCloudFields();await refreshPublicStoryCloudFields();await refreshStoryViewCounts([1]);render()});
  assert.equal((await summary(page)).views,10008);assert.equal((await summary(page)).total,1052);assert.equal(await page.evaluate(()=>JSON.stringify({comments,reviews,progress})),before);
  await page.reload({waitUntil:'networkidle'});assert.equal((await summary(page)).views,10008);assert.equal((await summary(page)).total,1052);
  await page.evaluate(async A=>{authUser={id:A};await refreshPublicStoryCloudFields()},A);assert.deepEqual((await summary(page)).liked,['1_0']);assert.equal((await summary(page)).total,1052);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('baseline floor is present before delayed RPC; authoritative RPC replaces it without readdition',async()=>{
 const {page}=await setup();let release;try{
  await page.route('**/rest/v1/rpc/nca_story_view_counts',async route=>{await new Promise(r=>release=r);await route.fulfill({status:200,headers,contentType:'application/json',body:'[{"story_id":1,"view_count":10004}]'})});
  await page.evaluate(async()=>{await loadCloudStories();window.pendingStats=refreshPublicStoryCloudFields()});
  while(!release)await new Promise(r=>setTimeout(r,10));assert.equal((await summary(page)).views,10000);
  release();await page.evaluate(()=>window.pendingStats);assert.equal((await summary(page)).views,10004);assert.deepEqual(page.errors,[]);
 }finally{release?.();await page.close()}
});
test('normal real view +1, RPC fallback and cached requests preserve Step 1 totals',async()=>{
 const {page,traffic}=await setup(8);let total=10008,fail=false,rpcCalls=0;const writes=[];try{
  await page.route('**/rest/v1/story_views**',async route=>{assert.equal(route.request().method(),'POST');writes.push(route.request().postDataJSON());total++;await route.fulfill({status:201,headers,contentType:'application/json',body:'[]'})});
  await page.route('**/rest/v1/rpc/nca_story_view_counts',route=>{rpcCalls++;return route.fulfill({status:fail?500:200,headers,contentType:'application/json',body:fail?'{"message":"temporary"}':JSON.stringify([{story_id:1,view_count:total}])})});
  traffic.length=0;await page.evaluate(()=>read(1,0));assert.equal((await summary(page)).views,10009);assert.equal(writes.length,1);assert.equal(writes[0].user_id,null);
  assert.equal(traffic.filter(u=>u.pathname.startsWith('/rest/v1/')).length+2,4);
  traffic.length=0;await page.evaluate(()=>read(1,0));assert.equal((await summary(page)).views,10010);assert.equal(traffic.filter(u=>u.pathname.startsWith('/rest/v1/')).length+2,2);
  fail=true;await page.evaluate(()=>recordStoryView(1));assert.equal((await summary(page)).views,10011);
  fail=false;await page.evaluate(()=>refreshStoryViewCounts([1]));assert.equal((await summary(page)).views,10011);
  const priorWrites=writes.length,priorRpc=rpcCalls;traffic.length=0;await page.reload({waitUntil:'networkidle'});assert.equal((await summary(page)).views,10012);assert.equal(writes.length-priorWrites,1);assert.equal(traffic.filter(u=>u.pathname.startsWith('/rest/v1/')).length+writes.length-priorWrites+rpcCalls-priorRpc,15);
  assert.equal((await summary(page)).baselineViews,10000);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('signed-in chapter like/unlike changes only real count; every story stat updates, no story_likes',async()=>{
 const {page}=await setup();const calls=[];try{
  await page.route('**/rest/v1/chapter_likes**',async route=>{const req=route.request();calls.push({method:req.method(),query:new URL(req.url()).search,body:req.postData()?req.postDataJSON():null});let affected=[];if(req.method()==='POST')page.mockFixtures.chapter_likes.push(req.postDataJSON());else if(req.method()==='DELETE'){affected=page.mockFixtures.chapter_likes.splice(0).map(r=>({chapter_id:r.chapter_id}))}await route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(affected)})});
  await page.evaluate(A=>{authUser={id:A};activateMemberSync();openStory(1);saved=[1];renderSaved();renderProfileStoryShelf('saved');currentStory=stories[0];currentChapter=0;renderChapterHeart()},A);
  await page.evaluate(()=>toggleChapterLike());assert.equal((await summary(page)).total,1051);assert.deepEqual((await summary(page)).liked,['1_0']);
  assert.equal(await page.locator('#chapterHeartRow button span').count(),0);assert.equal(await page.locator('#chapterHeartRow button').getAttribute('aria-pressed'),'true');
  for(const sel of ['#stories .stats .stat:nth-child(2)','#saved .stats .stat:nth-child(2)','#introStats .stat:nth-child(2)','.profile-story-stats span:nth-child(2)'])assert.equal((await page.locator(sel).textContent()).trim(),'1.05K');
  await page.evaluate(()=>toggleChapterLike());assert.equal((await summary(page)).total,1050);assert.deepEqual((await summary(page)).liked,[]);assert.equal(await page.locator('#chapterHeartRow button span').count(),0);assert.equal(await page.locator('#chapterHeartRow button').getAttribute('aria-pressed'),'false');
  assert.deepEqual(calls.map(c=>c.method),['POST','DELETE']);assert.deepEqual(calls[0].body,{chapter_id:11,user_id:A});assert(calls[1].query.includes('chapter_id=eq.11')&&calls[1].query.includes('user_id=eq.'+A));assert.equal((await summary(page)).baselineLikes,1050);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('view sorting uses total; missing baselines default zero; admin metadata never writes baseline fields',async()=>{
 const {page}=await setup(8);const calls=[];try{
  const order=await page.evaluate(()=>{stories.push(mapStoryBaselines({id:2,title:'Other',author:'Writer',chapters:[],views:20000},{baseline_views:0,baseline_likes:0}));storyFilter.views='views_desc';render();return [...document.querySelectorAll('#stories .story-card')].map(e=>e.getAttribute('onclick'))});assert.deepEqual(order,['openStory(2)','openStory(1)']);
  assert.deepEqual(await page.evaluate(()=>mapStoryBaselines({views:3},{})),{views:3,baselineViews:0,baselineLikes:0});
  await page.route('**/rest/v1/stories**',async route=>{const req=route.request();calls.push({method:req.method(),body:req.postData()?req.postDataJSON():null});await route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(req.method()==='GET'?row:[])})});
  await page.evaluate(A=>{authUser={id:A,user_metadata:{full_name:'Alex'}};memberProfile={id:A,display_name:'Alex',role:'admin'};activateMemberSync();openStoryComposer(1,'published')},A);
  await page.evaluate(()=>saveManagedStory('published'));
  assert.equal((await summary(page)).baselineViews,10000);assert.equal((await summary(page)).baselineLikes,1050);assert.equal((await summary(page)).views,10008);
  const patches=calls.filter(c=>c.method==='PATCH');assert(patches.length>=1);assert(patches.every(c=>!Object.keys(c.body).some(k=>k.includes('baseline')||['views','likes'].includes(k))));assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
