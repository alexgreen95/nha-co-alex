const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
const chapters=[{id:11,story_id:1,chapter_number:1,published:true,title:'One'},{id:12,story_id:1,chapter_number:2,published:true,title:'Two'},{id:13,story_id:1,chapter_number:3,published:false,title:'Hidden'}];
const row={id:1,title:'Hearts',author:'Writer',published:true,baseline_views:10000,baseline_likes:1050};
function sdkUser(uid){return `(()=>{let sdk;Object.defineProperty(window,'supabase',{configurable:true,get:()=>sdk,set:v=>{sdk=v;const create=v.createClient;v.createClient=(...args)=>{const client=create(...args);client.auth.getSession=async()=>({data:{session:{user:{id:${JSON.stringify(uid)},user_metadata:{full_name:'Reader'}}}}});client.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});return client}}})})()`}
async function setup(likes=[],signed=true){
 const page=await feedPage(0,{fixtures:{stories:[row],chapters,chapter_likes:likes,nca_story_view_counts:[{story_id:1,view_count:10000}],paragraphs:[{paragraph_number:1,content:'Reader'}]}});
 const mock={rows:likes.map(r=>({...r})),calls:[],readHook:null,writeHook:null,failCounts:false,failMember:false,failWrite:false};
 await page.route(/^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/(rpc\/nca_(chapter_like_counts|my_chapter_likes)|chapter_likes)(\?|$)/,async route=>{
  const req=route.request(),u=new URL(req.url());if(req.method()==='OPTIONS')return route.fulfill({status:200,headers:H});
  const type=u.pathname.split('/').pop(),body=req.postData()?req.postDataJSON():null;
  const uid=await page.evaluate(()=>authUser?.id||null),call={type,method:req.method(),body,uid,query:u.search};mock.calls.push(call);
  let data=[],status=200;
  if(type==='chapter_likes'){
   assert.notEqual(req.method(),'GET','Must never download chapter_likes rows');
   if(mock.writeHook)await mock.writeHook(call);
   if(mock.failWrite){status=500;data={message:'Write failed'}}
   else if(req.method()==='POST'){
    if(mock.rows.some(r=>r.chapter_id===body.chapter_id&&r.user_id===body.user_id)){status=409;data={code:'23505',message:'Duplicate'}}else mock.rows.push(body);
   }else{
    const id=Number(u.searchParams.get('chapter_id').slice(3)),owner=u.searchParams.get('user_id').slice(3);
    data=mock.rows.filter(r=>r.chapter_id===id&&r.user_id===owner).map(r=>({chapter_id:r.chapter_id}));mock.rows=mock.rows.filter(r=>!(r.chapter_id===id&&r.user_id===owner));
   }
  }else{
   assert(body.p_chapter_ids.length<=1000);assert.deepEqual(Object.keys(body),['p_chapter_ids']);
   const ids=body.p_chapter_ids;
   data=type==='nca_chapter_like_counts'?ids.map(id=>({chapter_id:id,like_count:mock.rows.filter(r=>r.chapter_id===id).length})):ids.filter(id=>mock.rows.some(r=>r.chapter_id===id&&r.user_id===uid));
   if(mock.readHook)await mock.readHook(call);
   if(type==='nca_chapter_like_counts'?mock.failCounts:mock.failMember){status=500;data={message:'Temporary RPC failure'}}
  }
  await route.fulfill({status,headers:H,contentType:'application/json',body:JSON.stringify(data)});
 });
 if(signed)await page.evaluate(async A=>{authUser={id:A};updateAuthUI();await refreshChapterLikeState();currentStory=stories[0];currentChapter=0;renderChapterHeart()},A);
 mock.calls.length=0;return {page,mock};
}
async function snapshot(page){return page.evaluate(()=>({count:chapterLikes['1_0']||0,total:storyLikeTotal(stories[0]),liked:[...likedChapters],baseline:stories[0].baselineLikes}))}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}}
async function waitUntil(fn){for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}throw new Error('Mock request did not start')}

test('bounded budget is independent of 0/100/1k/10k/100k history, anonymous and signed membership',async()=>{
 const results=[];
 for(const n of [0,100,1000,10000,100000])for(const state of ['anonymous','signed_no_likes','signed_many_likes']){
  const mine=state==='signed_many_likes'?Math.min(n,100):0;
  const ch=Array.from({length:100},(_,i)=>({id:11+i,story_id:1,chapter_number:i+1,published:true,title:'Chapter'}));
  const likes=Array.from({length:n},(_,i)=>({chapter_id:i<mine?11+i:11,user_id:i<mine?A:'00000000-0000-0000-0001-'+String(i).padStart(12,'0')}));
  const calls=[];
  const page=await feedPage(0,{fixtures:{stories:[row],chapters:ch,chapter_likes:likes,nca_story_view_counts:[{story_id:1,view_count:10000}]},initScript:state==='anonymous'?undefined:sdkUser(A),onRequest:(url,req)=>{if(url.pathname.startsWith('/rest/v1/'))calls.push({type:url.pathname.split('/').pop(),body:req.postData()?req.postDataJSON():null})}});
  try{
   const counts=()=>calls.filter(c=>c.type==='nca_chapter_like_counts').length,member=()=>calls.filter(c=>c.type==='nca_my_chapter_likes').length;
   assert.equal(await page.evaluate(()=>storyLikeTotal(stories[0])),1050+n);assert.equal(await page.evaluate(()=>likedChapters.length),mine);
   assert.equal(counts(),1);assert.equal(member(),state==='anonymous'?0:1);assert(!calls.some(c=>c.type==='chapter_likes'||c.type==='story_likes'));
   const bootstrap={rest:calls.length,counts:counts(),membership:member()};calls.length=0;
   await page.evaluate(()=>refreshPublicStoryCloudFields());assert.equal(counts(),1);assert.equal(member(),state==='anonymous'?0:1);
   const hydration={rest:calls.length,counts:counts(),membership:member()};
   results.push({history:n,state,mine,bootstrap,hydration,transferred_count_entries:100,transferred_membership_ids:mine});
   assert.deepEqual(page.errors,[]);
  }finally{await page.close()}
 }
 fs.writeFileSync('/tmp/nca-step3-local-budget.json',JSON.stringify(results,null,2));
});

test('like/unlike authoritative counts, all UI surfaces, baseline, hidden chapter and anonymous gate',async()=>{
 const {page,mock}=await setup([{chapter_id:12,user_id:B},{chapter_id:13,user_id:A}]);try{
  await page.evaluate(()=>{openStory(1);saved=[1];renderSaved();renderProfileStoryShelf('saved');currentStory=stories[0];currentChapter=0;renderChapterHeart()});assert.equal((await snapshot(page)).total,1051);assert.deepEqual((await snapshot(page)).liked,[]);
  await page.evaluate(()=>toggleChapterLike());assert.deepEqual(await snapshot(page),{count:1,total:1052,liked:['1_0'],baseline:1050});
  assert.equal(await page.locator('#chapterHeartRow button span').count(),0);
  for(const sel of ['#stories .stats .stat:nth-child(2)','#saved .stats .stat:nth-child(2)','#introStats .stat:nth-child(2)','.profile-story-stats span:nth-child(2)'])assert.equal((await page.locator(sel).textContent()).trim(),'1.05K');
  assert.deepEqual(mock.calls.map(c=>c.type),['chapter_likes','nca_chapter_like_counts','nca_my_chapter_likes']);
  mock.calls.length=0;await page.evaluate(()=>toggleChapterLike());assert.deepEqual(await snapshot(page),{count:0,total:1051,liked:[],baseline:1050});assert.equal(mock.calls.length,3);
  await page.evaluate(()=>{authUser=null;updateAuthUI()});mock.calls.length=0;await page.evaluate(()=>toggleChapterLike());assert.equal(mock.calls.length,0);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});

test('coalesced concurrent hydration and concurrent unlike cannot double decrement; zero-row DELETE reconciles',async()=>{
 const {page,mock}=await setup([{chapter_id:11,user_id:A},{chapter_id:11,user_id:B}]);try{
  await page.evaluate(()=>Promise.all([refreshChapterLikeState(),refreshChapterLikeState(),refreshChapterLikeState()]));assert.equal(mock.calls.length,2);assert.equal((await snapshot(page)).count,2);
  mock.calls.length=0;mock.writeHook=()=>new Promise(r=>setTimeout(r,70));
  await page.evaluate(()=>Promise.all([toggleChapterLike(),toggleChapterLike(),toggleChapterLike()]));assert.equal(mock.calls.filter(c=>c.type==='chapter_likes').length,1);assert.equal((await snapshot(page)).count,1);
  mock.rows.push({chapter_id:11,user_id:A});await page.evaluate(()=>refreshChapterLikeState());mock.rows=mock.rows.filter(r=>r.user_id!==A);
  mock.calls.length=0;await page.evaluate(()=>toggleChapterLike());assert.equal((await snapshot(page)).count,1);assert.deepEqual((await snapshot(page)).liked,[]);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});

test('old hydration cannot overwrite new like/unlike, and newer reads supersede older ones',async()=>{
 const {page,mock}=await setup();let block=deferred(),waiting=0;try{
  mock.readHook=()=>{waiting++;return block.promise};await page.evaluate(()=>{window.oldLikes=refreshChapterLikeState()});await waitUntil(()=>waiting===2);
  mock.readHook=null;await page.evaluate(()=>toggleChapterLike());assert.equal((await snapshot(page)).count,1);
  block.resolve();await page.evaluate(()=>window.oldLikes);assert.equal((await snapshot(page)).count,1);assert.deepEqual((await snapshot(page)).liked,['1_0']);
  block=deferred();waiting=0;mock.readHook=()=>{waiting++;return block.promise};await page.evaluate(()=>{window.oldLikes=refreshChapterLikeState()});await waitUntil(()=>waiting===2);
  mock.readHook=null;await page.evaluate(()=>toggleChapterLike());block.resolve();await page.evaluate(()=>window.oldLikes);assert.equal((await snapshot(page)).count,0);assert.deepEqual((await snapshot(page)).liked,[]);
  assert.deepEqual(page.errors,[]);
 }finally{block.resolve();await page.close()}
});

test('account switch/logout reject pending membership and old-account write acknowledgements; navigation safe',async()=>{
 const {page,mock}=await setup([{chapter_id:12,user_id:B}]);let block=deferred(),waiting=0;try{
  mock.readHook=call=>{if(call.type==='nca_my_chapter_likes'){waiting++;return block.promise}};
  await page.evaluate(()=>{window.oldMember=refreshChapterLikeState()});await waitUntil(()=>waiting===1);
  mock.readHook=null;await page.evaluate(async B=>{authUser={id:B};updateAuthUI();await refreshChapterLikeState()},B);assert.deepEqual((await snapshot(page)).liked,['1_1']);
  block.resolve();await page.evaluate(()=>window.oldMember);assert.deepEqual((await snapshot(page)).liked,['1_1']);
  await page.evaluate(async A=>{authUser={id:A};updateAuthUI();await refreshChapterLikeState()},A);
  block=deferred();waiting=0;mock.writeHook=()=>{waiting++;return block.promise};await page.evaluate(()=>{window.oldWrite=toggleChapterLike()});await waitUntil(()=>waiting===1);
  await page.evaluate(async B=>{authUser={id:B};updateAuthUI();currentStory=null;await refreshChapterLikeState()},B);block.resolve();await page.evaluate(()=>window.oldWrite);assert.deepEqual((await snapshot(page)).liked,['1_1']);
  assert.equal(mock.rows.find(r=>r.chapter_id===11).user_id,A);
  await page.evaluate(()=>{authUser=null;updateAuthUI();currentStory=stories[0];currentChapter=1;renderChapterHeart()});assert.deepEqual((await snapshot(page)).liked,[]);assert(!(await page.locator('#chapterHeartRow button').getAttribute('class')).includes('liked'));
  mock.calls.length=0;await page.evaluate(()=>refreshChapterLikeState());assert.equal(mock.calls.filter(c=>c.type==='nca_my_chapter_likes').length,0);assert.deepEqual(page.errors,[]);
 }finally{block.resolve();await page.close()}
});

test('RPC failure retains known state, retry recovers, duplicate INSERT and write failure reconcile safely',async()=>{
 const {page,mock}=await setup([{chapter_id:11,user_id:A}]);try{
  mock.failCounts=true;mock.failMember=true;await page.evaluate(()=>refreshChapterLikeState());assert.equal((await snapshot(page)).count,1);assert.deepEqual((await snapshot(page)).liked,['1_0']);
  mock.rows.push({chapter_id:11,user_id:B});mock.failCounts=false;mock.failMember=false;await page.evaluate(()=>refreshChapterLikeState());assert.equal((await snapshot(page)).count,2);
  mock.failWrite=true;await page.evaluate(()=>toggleChapterLike());assert.equal((await snapshot(page)).count,2);assert.deepEqual((await snapshot(page)).liked,['1_0']);
  mock.failWrite=false;await page.evaluate(()=>toggleChapterLike());assert.equal((await snapshot(page)).count,1);
  mock.rows.push({chapter_id:11,user_id:A});await page.evaluate(()=>toggleChapterLike());assert.equal((await snapshot(page)).count,2);assert.deepEqual((await snapshot(page)).liked,['1_0']);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});

test('1001+ loaded chapters batch counts/membership, skip hidden/duplicates, remap stable chapter IDs',async()=>{
 const {page,mock}=await setup();try{
  mock.rows=[{chapter_id:11,user_id:A},{chapter_id:1500,user_id:A}];
  await page.evaluate(async()=>{stories[0].chapters=Array.from({length:2001},(_,i)=>({id:11+i,title:'Loaded'}));stories[0].chapters.push({id:11,title:'Duplicate'});await refreshChapterLikeState()});
  assert.equal(mock.calls.filter(c=>c.type==='nca_chapter_like_counts').length,3);assert.equal(mock.calls.filter(c=>c.type==='nca_my_chapter_likes').length,3);
  assert.deepEqual(mock.calls.filter(c=>c.type==='nca_chapter_like_counts').map(c=>c.body.p_chapter_ids.length),[1000,1000,1]);
  assert.equal(await page.evaluate(()=>chapterLikes['1_1489']),1);
  await page.evaluate(async()=>{stories[0].chapters=[{id:1500},{id:11}];await refreshChapterLikeState()});assert.equal(await page.evaluate(()=>chapterLikes['1_0']),1);assert.equal(await page.evaluate(()=>chapterLikes['1_1']),1);assert.deepEqual((await snapshot(page)).liked,['1_0','1_1']);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});

test('overlapping bounded reads respect latest chapter snapshot; UI updates before reconcile completes',async()=>{
 const {page,mock}=await setup();let block=deferred(),waiting=0;try{
  mock.readHook=call=>{if(call.body.p_chapter_ids.length===2){waiting++;return block.promise}};
  await page.evaluate(()=>{window.oldBatch=refreshChapterLikeState()});await waitUntil(()=>waiting===2);
  mock.rows.push({chapter_id:11,user_id:A});await page.evaluate(()=>refreshChapterLikeState([11]));assert.equal((await snapshot(page)).count,1);
  block.resolve();await page.evaluate(()=>window.oldBatch);assert.equal((await snapshot(page)).count,1);assert.deepEqual((await snapshot(page)).liked,['1_0']);
  block=deferred();waiting=0;mock.readHook=()=>{waiting++;return block.promise};
  await page.evaluate(()=>{window.unlikeAndReconcile=toggleChapterLike()});await waitUntil(()=>waiting===2);
  assert.equal((await snapshot(page)).count,0);assert.equal(await page.locator('#chapterHeartRow button span').count(),0);assert.deepEqual((await snapshot(page)).liked,[]);
  block.resolve();await page.evaluate(()=>window.unlikeAndReconcile);assert.equal((await snapshot(page)).count,0);assert.deepEqual(page.errors,[]);
 }finally{block.resolve();await page.close()}
});

test('auth refresh uses bounded RPCs, keeps other systems unchanged, and reload restores membership',async()=>{
 const traffic=[];
 const page=await feedPage(0,{initScript:sdkUser(A),fixtures:{stories:[row],chapters,chapter_likes:[{chapter_id:11,user_id:A}],nca_story_view_counts:[{story_id:1,view_count:10000}]},onRequest:(u,req)=>{if(u.pathname.startsWith('/rest/v1/'))traffic.push({type:u.pathname.split('/').pop(),method:req.method()})}});
 try{
  assert.deepEqual((await snapshot(page)).liked,['1_0']);traffic.length=0;
  const unchanged=await page.evaluate(()=>JSON.stringify({comments,reviews,progress}));
  await page.evaluate(async()=>{const original=refreshPublicStoryCloudFields;let job;refreshPublicStoryCloudFields=(...args)=>(job=original(...args));try{await syncProfile(authUser);await job}finally{refreshPublicStoryCloudFields=original}});
  assert.equal(traffic.filter(c=>c.type==='nca_chapter_like_counts').length,1);assert.equal(traffic.filter(c=>c.type==='nca_my_chapter_likes').length,1);assert(!traffic.some(c=>c.type==='chapter_likes'||c.type==='story_likes'));
  assert.equal(await page.evaluate(()=>JSON.stringify({comments,reviews,progress})),unchanged);
  await page.reload({waitUntil:'networkidle'});assert.deepEqual((await snapshot(page)).liked,['1_0']);assert.equal((await snapshot(page)).total,1051);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});

test('chapter switch while write is pending updates original chapter without changing active chapter heart',async()=>{
 const {page,mock}=await setup([{chapter_id:12,user_id:B}]);const block=deferred();let waiting=0;try{
  mock.writeHook=()=>{waiting++;return block.promise};await page.evaluate(()=>{window.originalLike=toggleChapterLike()});await waitUntil(()=>waiting===1);
  await page.evaluate(()=>{currentChapter=1;renderChapterHeart()});block.resolve();await page.evaluate(()=>window.originalLike);
  assert.equal(await page.evaluate(()=>currentChapter),1);assert.equal((await snapshot(page)).count,1);assert.equal(await page.locator('#chapterHeartRow button span').count(),0);
  assert(!(await page.locator('#chapterHeartRow button').getAttribute('class')).includes('liked'));assert.equal((await snapshot(page)).total,1052);assert.deepEqual(page.errors,[]);
 }finally{block.resolve();await page.close()}
});
