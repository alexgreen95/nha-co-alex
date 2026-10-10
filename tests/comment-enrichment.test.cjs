const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const rows=()=>Array.from({length:7},(_,i)=>({id:i+1,user_id:i%2?'B':'A',content:'Comment '+i,scope:i<3?'story':i===3?'chapter':'paragraph',story_id:1,chapter_index:i<3?null:0,paragraph_index:i<4?null:0,parent_id:i===1?1:null,created_at:'2026-10-10T00:00:00Z'}));
async function setup(){
 const calls=[],page=await feedPage(0,{fixtures:{comments:rows(),comment_likes:[{comment_id:1,user_id:'A'},{comment_id:1,user_id:'B'}]}}),mock={calls,hook:null,fail:null};
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop(),method=req.method();if(method==='OPTIONS')return route.fulfill({status:200,headers,body:''});
  if(!['nca_story_comment_counts','nca_chapter_comment_counts','nca_profile_comment_count','nca_comment_like_counts','nca_my_comment_likes'].includes(name)&&!['comments','comment_likes'].includes(name))return route.fallback();
  const body=req.postDataJSON(),call={name,body,method};calls.push(call);
  const snapshot=await page.evaluate(()=>({owner:authUser?.id,rows:Object.values(comments).flat().map(c=>({id:c.id,userId:c.userId}))}));
  if(mock.hook){const response=await mock.hook(call,snapshot);if(response!==undefined)return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(response)})}
  if(mock.fail===name)return route.fulfill({status:500,headers,contentType:'application/json',body:JSON.stringify({message:'mock fail'})});
  let data;
  if(name==='nca_story_comment_counts')data=body.p_story_ids.filter(id=>String(id)==='1').map(id=>({story_id:Number(id),comment_count:40}));
  if(name==='nca_profile_comment_count')data=body.p_user_id==='A'?31:17;
  if(name==='nca_chapter_comment_counts')data={story_id:Number(body.p_story_id),chapter_index:body.p_chapter_index,chapter_comment_count:9,paragraph_counts:body.p_paragraph_indices.map(pi=>({paragraph_index:pi,comment_count:pi===0?12:0}))};
  if(name==='nca_comment_like_counts')data=body.p_comment_ids.filter(id=>String(id)==='1').map(id=>({comment_id:Number(id),like_count:page.mockFixtures.comment_likes.filter(l=>String(l.comment_id)===String(id)).length}));
  if(name==='nca_my_comment_likes')data=body.p_comment_ids.filter(id=>page.mockFixtures.comment_likes.some(l=>String(l.comment_id)===String(id)&&l.user_id===snapshot.owner)).map(Number);
  if(name==='comment_likes'){
   if(method==='POST')page.mockFixtures.comment_likes.push(body);
   if(method==='DELETE'){const id=url.searchParams.get('comment_id').slice(3),owner=url.searchParams.get('user_id').slice(3);page.mockFixtures.comment_likes=page.mockFixtures.comment_likes.filter(l=>!(String(l.comment_id)===id&&l.user_id===owner))}
   data=[];
  }
  if(name==='comments'){
   if(method==='POST'){data={...body,id:8,created_at:new Date().toISOString()};page.mockFixtures.comments.push(data)}
   else if(method==='DELETE'){const id=url.searchParams.get('id').slice(3);page.mockFixtures.comments=page.mockFixtures.comments.filter(c=>String(c.id)!==id);data=[{id:Number(id)}]}
   else data=page.mockFixtures.comments;
  }
  return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(data)});
 });
 return {page,mock};
}
async function account(page,owner){await page.evaluate(owner=>{authUser=owner?{id:owner}:null;resetAuthAccount(owner);syncCommentHeartAccount()},owner);await page.waitForLoadState('networkidle')}
async function settle(page){await page.waitForLoadState('networkidle')}

test('authoritative counts remain exact despite incomplete global content; UI/profile/markers use RPC',async()=>{
 const {page,mock}=await setup();try{
 await page.evaluate(async()=>{await refreshStoryCommentCounts([1],{force:true});await refreshChapterCommentCounts(1,0,[0,1]);await refreshProfileCommentCount('A');currentStory=stories[0];currentChapter=0;currentStory.chapters[0].paras=['First','Second'];renderChapter();});await settle(page);
 assert.equal(await page.evaluate(()=>storyCommentCount(stories[0])),40);assert.equal(await page.evaluate(()=>profileLocalCounts('A').commentCount),31);assert.equal(await page.evaluate(()=>chapterGeneralCommentTotal(stories[0],0)),9);
 assert.equal(await page.locator('#para_1_0_0 .comment-btn span').textContent(),'12');assert.equal(await page.locator('#para_1_0_1 .comment-btn').count(),0);
 assert(!mock.calls.some(c=>c.name==='nca_my_comment_likes'));assert.equal(await page.evaluate(()=>Object.values(comments).flat().length),7);
 }finally{await page.close()}
});
test('signed membership uses current account only; logout clears UI membership; no raw like history GET',async()=>{
 const {page,mock}=await setup();try{await account(page,'A');await page.evaluate(()=>refreshCommentLikeEnrichment([1]));assert.equal(await page.evaluate(()=>commentHeartState(1).liked),true);
 await account(page,null);assert.equal(await page.evaluate(()=>commentHeartState(1).liked),false);assert(!mock.calls.some(c=>c.name==='comment_likes'&&c.method==='GET'));
 }finally{await page.close()}
});
for(const kind of ['like','membership'])test(`${kind}: old held normal → forced failure → retry cannot join obsolete flight`,async()=>{
 const {page,mock}=await setup(),hold=deferred();let held=false;try{await account(page,'A');
 const rpc=kind==='like'?'nca_comment_like_counts':'nca_my_comment_likes';mock.hook=async c=>{if(c.name===rpc&&!held){held=true;await hold.promise;return kind==='like'?[{comment_id:1,like_count:999}]:[]}};
 await page.evaluate(()=>{window.oldWork=refreshCommentLikeEnrichment([1])});while(!held)await new Promise(r=>setTimeout(r,5));mock.fail=rpc;
 assert.equal(await page.evaluate(()=>refreshCommentLikeEnrichment([1],{force:true})),false);mock.fail=null;
 assert.equal(await page.evaluate(()=>refreshCommentLikeEnrichment([1])),true);assert.equal(await page.evaluate(()=>commentStats.likes.get('1')),2);assert.equal(await page.evaluate(()=>commentStats.membership.get('1')),true);
 hold.resolve();await page.evaluate(()=>oldWork);assert.equal(await page.evaluate(()=>commentStats.likes.get('1')),2);assert.equal(await page.evaluate(()=>commentStats.membership.get('1')),true);
 }finally{hold.resolve();await page.close()}
});
for(const end of ['B','A',null])test(`held A membership → ${end==='A'?'A→B→A':end||'logout'} cannot apply original epoch`,async()=>{
 const {page,mock}=await setup(),hold=deferred();let held=false;try{await account(page,'A');mock.hook=async c=>{if(c.name==='nca_my_comment_likes'&&!held){held=true;await hold.promise;return [1]}};
 await page.evaluate(()=>{window.oldWork=refreshCommentLikeEnrichment([1])});while(!held)await new Promise(r=>setTimeout(r,5));await account(page,'B');if(end!=='B')await account(page,end);
 page.mockFixtures.comment_likes=[];await page.evaluate(()=>refreshCommentLikeEnrichment([1],{force:true}));hold.resolve();await page.evaluate(()=>oldWork);assert.equal(await page.evaluate(()=>commentHeartState(1).liked),false);
 }finally{hold.resolve();await page.close()}
});
for(const name of ['nca_story_comment_counts','nca_chapter_comment_counts','nca_profile_comment_count'])test(`${name} failure retains valid state and is retryable`,async()=>{
 const {page,mock}=await setup();try{const run=()=>page.evaluate(async name=>name==='nca_story_comment_counts'?refreshStoryCommentCounts([1],{force:true}):name==='nca_chapter_comment_counts'?refreshChapterCommentCounts(1,0,[0],{force:true}):refreshProfileCommentCount('A',{force:true}),name);
 assert.equal(await run(),true);mock.fail=name;assert.equal(await run(),false);mock.fail=null;assert.equal(await run(),true);
 }finally{await page.close()}
});
test('100 story / 1000 comment / 1000 paragraph batching; empty input has no extra request',async()=>{
 const {page,mock}=await setup();try{await account(page,'A');mock.calls.length=0;
 await page.evaluate(async()=>{await refreshStoryCommentCounts(Array.from({length:101},(_,i)=>i+1));await refreshCommentLikeEnrichment(Array.from({length:1001},(_,i)=>i+1));await refreshChapterCommentCounts(1,0,Array.from({length:1001},(_,i)=>i));await refreshStoryCommentCounts([]);await refreshCommentLikeEnrichment([])});
 assert.deepEqual(mock.calls.filter(c=>c.name==='nca_story_comment_counts').map(c=>c.body.p_story_ids.length),[100,1]);
 for(const name of ['nca_comment_like_counts','nca_my_comment_likes'])assert.deepEqual(mock.calls.filter(c=>c.name===name).map(c=>c.body.p_comment_ids.length),[1000,1]);
 assert.deepEqual(mock.calls.filter(c=>c.name==='nca_chapter_comment_counts').map(c=>c.body.p_paragraph_indices.length),[1000,1]);
 }finally{await page.close()}
});
test('like/unlike reconciles affected IDs only; no global comments/likes reload',async()=>{
 const {page,mock}=await setup();try{await account(page,'A');await page.evaluate(()=>refreshCommentLikeEnrichment([1]));mock.calls.length=0;
 await page.evaluate(()=>toggleCommentLike('story_1',1));assert.equal(await page.evaluate(()=>commentStats.likes.get('1')),1);assert.equal(await page.evaluate(()=>commentHeartState(1).liked),false);
 await page.evaluate(()=>toggleCommentLike('story_1',1));assert.equal(await page.evaluate(()=>commentStats.likes.get('1')),2);assert.equal(await page.evaluate(()=>commentHeartState(1).liked),true);
 assert.equal(mock.calls.filter(c=>c.name==='comment_likes'&&['POST','DELETE'].includes(c.method)).length,2);assert(!mock.calls.some(c=>c.name==='comments'||c.name==='comment_likes'&&c.method==='GET'));
 assert(mock.calls.filter(c=>c.name==='nca_comment_like_counts').every(c=>c.body.p_comment_ids.length===1));
 }finally{await page.close()}
});
test('create/delete preserve loader but refresh authoritative affected story/paragraph/profile counts',async()=>{
 const {page,mock}=await setup();try{await account(page,'A');await page.evaluate(()=>insertCloudComment('1_0_0','new comment'));assert(mock.calls.some(c=>c.name==='nca_story_comment_counts'));assert(mock.calls.some(c=>c.name==='nca_chapter_comment_counts'));assert(mock.calls.some(c=>c.name==='nca_profile_comment_count'&&c.body.p_user_id==='A'));
 mock.calls.length=0;await page.evaluate(()=>{window.confirm=()=>true;return deleteCommentById('1_0_0',8)});assert(mock.calls.some(c=>c.name==='comments'&&c.method==='DELETE'));assert(mock.calls.some(c=>c.name==='nca_chapter_comment_counts'));assert(!mock.calls.some(c=>c.name==='comment_likes'&&c.method==='GET'));
 }finally{await page.close()}
});

test('concurrent like calls with initially missing membership produce exactly one mutation',async()=>{
 const {page,mock}=await setup();try{await account(page,'A');await page.evaluate(()=>commentStats.membership.clear());mock.calls.length=0;
 await page.evaluate(()=>Promise.all([toggleCommentLike('story_1',1),toggleCommentLike('story_1',1),toggleCommentLike('story_1',1)]));
 assert.equal(mock.calls.filter(c=>c.name==='comment_likes'&&c.method==='DELETE').length,1);assert.equal(await page.evaluate(()=>commentStats.likes.get('1')),1);
 }finally{await page.close()}
});
test('late old story refresh cannot overwrite replacement; failed batch preserves other successful batch',async()=>{
 const {page,mock}=await setup(),hold=deferred();let held=false;try{
 mock.hook=async c=>{if(c.name==='nca_story_comment_counts'&&!held){held=true;await hold.promise;return [{story_id:1,comment_count:999}]}};
 await page.evaluate(()=>{window.oldCount=refreshStoryCommentCounts([1],{force:true})});while(!held)await new Promise(r=>setTimeout(r,5));
 await page.evaluate(()=>refreshStoryCommentCounts([1],{force:true}));hold.resolve();await page.evaluate(()=>oldCount);assert.equal(await page.evaluate(()=>storyCommentCount(stories[0])),40);
 mock.hook=c=>{if(c.name==='nca_comment_like_counts'&&c.body.p_comment_ids.length===1000)return [{comment_id:1,like_count:25}];if(c.name==='nca_comment_like_counts')mock.fail='nca_comment_like_counts'};
 assert.equal(await page.evaluate(()=>refreshCommentLikeEnrichment(Array.from({length:1001},(_,i)=>i+1),{force:true})),false);assert.equal(await page.evaluate(()=>commentStats.likes.get('1')),25);
 mock.fail=null;mock.hook=null;assert.equal(await page.evaluate(()=>refreshCommentLikeEnrichment([1],{force:true})),true);assert.equal(await page.evaluate(()=>commentStats.likes.get('1')),2);
 }finally{hold.resolve();await page.close()}
});

test('old-account write acknowledgment/finalizer cannot change new-account membership',async()=>{
 const {page,mock}=await setup(),hold=deferred();let held=false;try{await account(page,'A');await page.evaluate(()=>refreshCommentLikeEnrichment([1]));
 mock.hook=async c=>{if(c.name==='comment_likes'&&c.method==='DELETE'&&!held){held=true;await hold.promise;return []}};
 await page.evaluate(()=>{window.oldWrite=toggleCommentLike('story_1',1)});while(!held)await new Promise(r=>setTimeout(r,5));await account(page,'B');page.mockFixtures.comment_likes=[];
 await page.evaluate(()=>refreshCommentLikeEnrichment([1],{force:true}));assert.equal(await page.evaluate(()=>commentHeartState(1).liked),false);
 hold.resolve();await page.evaluate(()=>oldWrite);assert.equal(await page.evaluate(()=>commentHeartState(1).liked),false);assert.equal(await page.evaluate(()=>commentStats.likes.get('1')),0);
 }finally{hold.resolve();await page.close()}
});
test('bounded 20-root/6-reply enrichment budgets are independent of historical likes',async()=>{
 const {page,mock}=await setup(),report=[];try{
 for(const owner of [null,'A']){await account(page,owner);
 for(const N of [0,1000,100000])for(const size of [20,6]){
 mock.hook=c=>c.name==='nca_comment_like_counts'?c.body.p_comment_ids.map(id=>({comment_id:Number(id),like_count:Math.floor(N/size)})):c.name==='nca_my_comment_likes'?(N?[1]:[]):undefined;
 mock.calls.length=0;await page.evaluate(size=>refreshCommentLikeEnrichment(Array.from({length:size},(_,i)=>i+1),{force:true}),size);
 const reads=mock.calls.filter(c=>c.name.startsWith('nca_'));assert.equal(reads.length,owner?2:1);assert(reads.every(c=>c.body.p_comment_ids.length===size));
 report.push({historyLikes:N,account:owner?'signed':'anonymous',commentIds:size,requests:reads.length,aggregateObjects:size,membershipIds:owner&&N?1:0,historicalRowsTransferred:0});
 }}
 require('fs').writeFileSync('/tmp/nca-step5b-wiring-enrichment-budget.json',JSON.stringify(report,null,2));
 }finally{await page.close()}
});

test('pending newer reader cannot patch previous reader paragraph markers with a different context',async()=>{
 const {page}=await setup();try{
 await page.evaluate(async()=>{currentStory=stories[0];currentChapter=0;currentStory.chapters[0].paras=['First'];await refreshChapterCommentCounts(1,0,[0]);renderChapter()});await settle(page);
 assert.equal(await page.locator('#para_1_0_0 .comment-btn span').textContent(),'12');
 await page.evaluate(async()=>{currentStory={id:2,chapters:[{paras:['New reader pending']}]};currentChapter=0;commentStats.chapters.set('2_0',{general:0,paragraphs:new Map([[0,99]])});patchCommentCountUI()});
 assert.equal(await page.locator('#para_1_0_0 .comment-btn span').textContent(),'12');
 }finally{await page.close()}
});

// Deferred RPC responses are controlled inside the browser: no timing-based race.
for(const kind of ['like','story','membership','chapter'])test(`${kind}: partial supersession cannot satisfy complete retry; obsolete finalizer retains replacement`,async()=>{
 const {page}=await setup();try{
 if(kind==='membership')await account(page,'A');
 await page.evaluate(kind=>{
  const name={like:'nca_comment_like_counts',story:'nca_story_comment_counts',membership:'nca_my_comment_likes',chapter:'nca_chapter_comment_counts'}[kind];
  const original=sb.rpc.bind(sb),calls=[],releases=[];
  const response=(ids,value)=>kind==='like'?ids.map(id=>({comment_id:Number(id),like_count:value})):kind==='story'?ids.map(id=>({story_id:Number(id),comment_count:value})):kind==='membership'?ids.map(Number):{story_id:1,chapter_index:0,chapter_comment_count:value,paragraph_counts:ids.map(id=>({paragraph_index:Number(id),comment_count:value}))};
  sb.rpc=(n,args)=>{
   if(n!==name)return original(n,args);
   const ids=args.p_comment_ids||args.p_story_ids||args.p_paragraph_indices;
   calls.push(ids.slice());
   if(calls.length===2)return Promise.resolve({data:null,error:{message:'forced subset failure'}});
   return new Promise(resolve=>releases.push(value=>resolve({data:response(ids,value),error:null})));
  };
  const run=(ids,force=false)=>kind==='like'||kind==='membership'?refreshCommentLikeEnrichment(ids,{force}):kind==='story'?refreshStoryCommentCounts(ids,{force}):refreshChapterCommentCounts(1,0,ids,{force});
  if(kind==='like')commentStats.likes.clear();if(kind==='membership')commentStats.membership.clear();
  window.partialRace={calls,releases,run,kind};window.partialOld=run([1,2]);
 },kind);
 assert.equal(await page.evaluate(()=>partialRace.run([1],true)),false);
 await page.evaluate(()=>{window.partialRetry=partialRace.run([1,2]);window.partialReplacement=[...commentStats.flights.values()].find(j=>j.ids.includes('2')&&j.covered())});
 assert.equal(await page.evaluate(()=>partialRace.calls.length),3,'Retry issues fresh complete work');
 await page.evaluate(async()=>{partialRace.releases[0](99);await partialOld});
 assert.equal(await page.evaluate(()=>[...commentStats.flights.values()].includes(partialReplacement)),true,'Old finalizer cannot delete replacement');
 await page.evaluate(()=>partialRace.releases[1](7));
 assert.equal(await page.evaluate(()=>partialRetry),true);assert.equal(await page.evaluate(()=>partialOld),false);
 const state=await page.evaluate(kind=>kind==='like'?[commentStats.likes.get('1'),commentStats.likes.get('2')]:kind==='story'?[commentStats.stories.get('1'),commentStats.stories.get('2')]:kind==='membership'?[commentStats.membership.get('1'),commentStats.membership.get('2')]:[commentStats.chapters.get('1_0').paragraphs.get(1),commentStats.chapters.get('1_0').paragraphs.get(2)],kind);
 assert.deepEqual(state,kind==='membership'?[true,true]:[7,7]);
 }finally{await page.close()}
});
test('partially obsolete response preserves current resource but reports incomplete; later retry covers both',async()=>{
 const {page}=await setup();try{
 const state=await page.evaluate(async()=>{
  const original=sb.rpc.bind(sb);let release,calls=0;commentStats.likes.clear();
  sb.rpc=(name,args)=>{
   if(name!=='nca_comment_like_counts')return original(name,args);
   ++calls;if(calls===1)return new Promise(r=>release=r);
   if(calls===2)return Promise.resolve({data:null,error:{message:'forced subset failure'}});
   return Promise.resolve({data:args.p_comment_ids.map(id=>({comment_id:Number(id),like_count:7})),error:null});
  };
  const old=refreshCommentLikeEnrichment([1,2]);await refreshCommentLikeEnrichment([1],{force:true});
  release({data:[{comment_id:1,like_count:99},{comment_id:2,like_count:8}],error:null});const oldResult=await old;
  const partial=[commentStats.likes.get('1')??null,commentStats.likes.get('2')];
  const retryResult=await refreshCommentLikeEnrichment([1,2]);
  return {oldResult,partial,retryResult,calls,final:[commentStats.likes.get('1'),commentStats.likes.get('2')]};
 });
 assert.deepEqual(state,{oldResult:false,partial:[null,8],retryResult:true,calls:3,final:[7,7]});
 }finally{await page.close()}
});
test('lazy heart retry is not suppressed by a partially obsolete pending batch',async()=>{
 const {page}=await setup();try{
 await page.evaluate(()=>{
  const original=sb.rpc.bind(sb);let calls=0,releases=[];
  commentStats.likes.clear();
  sb.rpc=(name,args)=>{
   if(name!=='nca_comment_like_counts')return original(name,args);
   ++calls;window.lazyPartialCalls=calls;
   if(calls===2)return Promise.resolve({data:null,error:{message:'forced subset failure'}});
   if(calls===3)return Promise.resolve({data:[{comment_id:1,like_count:7}],error:null});
   return new Promise(r=>releases.push(()=>r({data:[{comment_id:1,like_count:99},{comment_id:2,like_count:8}],error:null})));
  };
  window.lazyPartialOld=refreshCommentLikeEnrichment([1,2]);window.releaseLazyPartial=()=>releases[0]();
 });
 assert.equal(await page.evaluate(()=>refreshCommentLikeEnrichment([1],{force:true})),false);
 await page.evaluate(()=>commentHeartState(1));
 await page.waitForFunction(()=>commentStats.likes.get('1')===7);
 assert.equal(await page.evaluate(()=>lazyPartialCalls),3);
 await page.evaluate(async()=>{releaseLazyPartial();await lazyPartialOld});
 assert.equal(await page.evaluate(()=>lazyPartialOld),false);assert.equal(await page.evaluate(()=>commentStats.likes.get('1')),7);
 }finally{await page.close()}
});
