// Step 5B comment RPC traffic is measured separately; core/event assertions stay unchanged.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage,isCommentEnrichmentRpc}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const H={'access-control-allow-origin':'*','access-control-allow-headers':'*'},A='reader-user';
const row={id:1,title:'Public story',author:'Writer',published:true,baseline_views:10000,baseline_likes:1050};
const chapters=[{id:11,story_id:1,chapter_number:1,published:true,title:'One'},{id:12,story_id:1,chapter_number:2,published:false,title:'Hidden'}];
const hold=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const wait=async f=>{for(let i=0;i<1000;i++){if(f())return;await new Promise(r=>setTimeout(r,5))}throw Error('Held request did not start')};
function signedSDK(){return new Function(`let sdk;Object.defineProperty(window,'supabase',{configurable:true,get:()=>sdk,set:v=>{sdk=v;const create=v.createClient;v.createClient=(...args)=>{const c=create(...args),session={user:{id:'reader-user'}};c.auth.getSession=async()=>({data:{session}});c.auth.onAuthStateChange=cb=>{queueMicrotask(()=>cb('INITIAL_SESSION',session));return {data:{subscription:{unsubscribe(){}}}}};return c}}});`)}
async function setup(signed=false){
 const traffic=[],page=await feedPage(0,{fixtures:{stories:[row],chapters,profiles:[{id:A,display_name:'Reader',role:'reader'}],chapter_likes:[{chapter_id:11,user_id:A}],nca_story_view_counts:[{story_id:1,view_count:10008}]},onRequest:(u,r)=>{if(u.pathname.startsWith('/rest/v1/')&&r.method()!=='OPTIONS'&&!isCommentEnrichmentRpc(u))traffic.push({table:u.pathname.split('/').pop(),method:r.method(),body:r.postData()?r.postDataJSON():null})}});
 if(signed)await page.evaluate(async A=>{await handleAuthState('SIGNED_IN',{user:{id:A}})},A);
 traffic.length=0;return {page,traffic};
}
for(const signed of [false,true])test(`equivalent concurrent public refresh joins exact outer promise (${signed?'authenticated':'anonymous'})`,async()=>{
 const {page,traffic}=await setup(signed),gate=hold();let metadata=0;
 try{
 await page.route('**/rest/v1/stories**',async r=>{metadata++;await gate.promise;await r.fulfill({status:200,headers:H,json:[row]})});
 const same=await page.evaluate(()=>{window.publicJobs=[refreshPublicStoryCloudFields(),refreshPublicStoryCloudFields()];return publicJobs[0]===publicJobs[1]});assert.equal(same,true);await wait(()=>metadata===1);
 gate.resolve();await page.evaluate(()=>Promise.all(publicJobs));
 // The override route accounts for the metadata GET separately from helper traffic.
 assert.equal(traffic.length+metadata,signed?4:3);assert.equal(traffic.filter(c=>c.table==='nca_story_view_counts').length,1);assert.equal(traffic.filter(c=>c.table==='nca_my_chapter_likes').length,signed?1:0);
 assert.deepEqual(await page.evaluate(()=>({views:stories[0].views,total:storyLikeTotal(stories[0]),ids:loadedChapterLikeIds(),liked:likedChapters})),{views:10008,total:1051,ids:[11],liked:signed?['1_0']:[]});
 assert(!traffic.some(c=>['story_views','chapter_likes','story_likes'].includes(c.table)));assert.deepEqual(page.errors,[]);
 }finally{gate.resolve();await page.close()}
});
for(const signed of [false,true])test(`bootstrap reuses fresh story metadata without reusing member chapter-map (${signed?'signed':'anon'})`,async()=>{
 const traffic=[],page=await feedPage(0,{initScript:signed?signedSDK():undefined,fixtures:{stories:[row],chapters,profiles:[{id:A,display_name:'Reader',role:'reader'}]},onRequest:(u,r)=>{if(u.pathname.startsWith('/rest/v1/')&&r.method()!=='OPTIONS'&&!isCommentEnrichmentRpc(u))traffic.push({table:u.pathname.split('/').pop(),query:u.search})}});
 try{if(signed)await page.waitForFunction(()=>authAccount.memberReady&&authAccount.likesCovered);
 assert.equal(traffic.filter(c=>c.table==='stories').length,1);assert.equal(traffic.filter(c=>c.table==='chapters').length,signed?2:1);assert.equal(traffic.filter(c=>c.table==='nca_chapter_like_counts').length,1);assert.equal(traffic.filter(c=>c.table==='nca_my_chapter_likes').length,signed?1:0);assert.equal(await page.evaluate(()=>stories[0].baselineLikes),1050);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('forced post-mutation refresh bypasses pre-mutation metadata/count/member flights; late old results cannot overwrite',async()=>{
 const {page}=await setup(true),gate=hold(),calls=[];let old=true;
 try{
 await page.route('**/rest/v1/**',async r=>{
 const req=r.request(),table=new URL(req.url()).pathname.split('/').pop();if(req.method()==='OPTIONS')return r.fulfill({status:200,headers:H});if(isCommentEnrichmentRpc(new URL(req.url())))return r.fallback();
 const capturedOld=old,body=req.postData()?req.postDataJSON():null;calls.push({table,old:capturedOld,body});let data=[];
 if(table==='stories')data=[{...row,author:capturedOld?'Old author':'New author',cover_url:capturedOld?'old.jpg':'new.jpg'}];
 else if(table==='nca_story_view_counts')data=body.p_story_ids.map(story_id=>({story_id,view_count:capturedOld?10008:10009}));
 else if(table==='nca_chapter_like_counts')data=body.p_chapter_ids.map(chapter_id=>({chapter_id,like_count:capturedOld?1:2}));
 else if(table==='nca_my_chapter_likes')data=capturedOld?body.p_chapter_ids:[];
 if(capturedOld)await gate.promise;return r.fulfill({status:200,headers:H,json:data});
 });
 await page.evaluate(()=>{window.oldRefresh=refreshPublicStoryCloudFields()});await wait(()=>calls.length===4);
 old=false;assert.equal(await page.evaluate(()=>refreshPublicStoryCloudFields({forceFresh:true})),true);
 const expected={author:'New author',cover:'new.jpg',views:10009,total:1052,liked:[]};assert.deepEqual(await page.evaluate(()=>({author:stories[0].author,cover:stories[0].cover,views:stories[0].views,total:storyLikeTotal(stories[0]),liked:likedChapters})),expected);
 gate.resolve();assert.equal(await page.evaluate(()=>oldRefresh),false);assert.deepEqual(await page.evaluate(()=>({author:stories[0].author,cover:stories[0].cover,views:stories[0].views,total:storyLikeTotal(stories[0]),liked:likedChapters})),expected);assert.equal(calls.length,8);assert.deepEqual(page.errors,[]);
 }finally{gate.resolve();await page.close()}
});
test('superseded 101-story public view read cannot issue late second batch or overwrite fresh totals',async()=>{
 const {page}=await setup(),gate=hold(),calls=[];let old=true;
 try{
 await page.evaluate(()=>{stories=Array.from({length:101},(_,i)=>({id:i+1,title:'Story '+i,author:'Writer',chapters:[],views:0}));render()});
 await page.route('**/rest/v1/**',async r=>{const req=r.request(),table=new URL(req.url()).pathname.split('/').pop();if(req.method()==='OPTIONS')return r.fulfill({status:200,headers:H});if(isCommentEnrichmentRpc(new URL(req.url())))return r.fallback();const capturedOld=old,b=req.postData()?req.postDataJSON():null;calls.push({table,old:capturedOld,b});const data=table==='stories'?Array.from({length:101},(_,i)=>({id:i+1,author:capturedOld?'Old':'New'})):b.p_story_ids.map(story_id=>({story_id,view_count:capturedOld?1:9}));if(capturedOld)await gate.promise;return r.fulfill({status:200,headers:H,json:data})});
 await page.evaluate(()=>{window.oldBatched=refreshPublicStoryCloudFields()});await wait(()=>calls.length===2);old=false;await page.evaluate(()=>refreshPublicStoryCloudFields({forceFresh:true}));gate.resolve();await page.evaluate(()=>oldBatched);
 assert.equal(calls.filter(c=>c.table==='nca_story_view_counts'&&c.old).length,1);assert.equal(calls.filter(c=>c.table==='nca_story_view_counts'&&!c.old).length,2);assert(await page.evaluate(()=>stories.every(s=>s.views===9&&s.author==='New')));assert.deepEqual(page.errors,[]);
 }finally{gate.resolve();await page.close()}
});
test('101 stories/1001 loaded chapters retain bounded RPC batches and no history reads',async()=>{
 const {page}=await setup(true),calls=[];try{
 await page.evaluate(()=>{stories=Array.from({length:101},(_,i)=>({id:i+1,title:'Story '+i,author:'Writer',baselineViews:10000,baselineLikes:1050,views:10000,chapters:i===0?Array.from({length:1001},(_,j)=>({id:j+1,title:'Chapter '+j,paras:[]})):[]}));render()});
 await page.route('**/rest/v1/**',r=>{const req=r.request(),table=new URL(req.url()).pathname.split('/').pop();if(req.method()==='OPTIONS')return r.fulfill({status:200,headers:H});if(isCommentEnrichmentRpc(new URL(req.url())))return r.fallback();const b=req.postData()?req.postDataJSON():null;calls.push({table,b});let data=[];
 if(table==='stories')data=Array.from({length:101},(_,i)=>({...row,id:i+1}));else if(table==='nca_story_view_counts')data=b.p_story_ids.map(story_id=>({story_id,view_count:10008}));else if(table==='nca_chapter_like_counts')data=b.p_chapter_ids.map(chapter_id=>({chapter_id,like_count:1}));else if(table==='nca_my_chapter_likes')data=b.p_chapter_ids;
 return r.fulfill({status:200,headers:H,json:data})});
 await page.evaluate(()=>Promise.all([refreshPublicStoryCloudFields(),refreshPublicStoryCloudFields()]));
 assert.equal(calls.length,7);assert.deepEqual(calls.filter(c=>c.table==='nca_story_view_counts').map(c=>c.b.p_story_ids.length),[100,1]);assert.deepEqual(calls.filter(c=>c.table==='nca_chapter_like_counts').map(c=>c.b.p_chapter_ids.length),[1000,1]);assert.deepEqual(calls.filter(c=>c.table==='nca_my_chapter_likes').map(c=>c.b.p_chapter_ids.length),[1000,1]);assert.equal(await page.evaluate(()=>storyLikeTotal(stories[0])),2051);assert.equal(await page.evaluate(()=>likedChapters.length),1001);assert(!calls.some(c=>['story_views','chapter_likes','story_likes'].includes(c.table)));assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
for(const count of [0,1])test(`zero ${count?'chapters':'stories'} resolves without irrelevant RPCs`,async()=>{
 const {page,traffic}=await setup();try{
 await page.evaluate(count=>{stories=count?[{id:1,title:'Empty chapters',chapters:[],views:0}]:[]},count);
 await page.evaluate(()=>Promise.all([refreshPublicStoryCloudFields(),refreshPublicStoryCloudFields()]));assert.equal(traffic.filter(c=>c.table==='stories').length,1);assert.equal(traffic.filter(c=>c.table==='nca_story_view_counts').length,count);assert(!traffic.some(c=>c.table.includes('chapter_like')));assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('failed metadata refresh clears flight; later refresh retries successfully',async()=>{
 const {page}=await setup();let fail=true,calls=0;try{
 await page.route('**/rest/v1/stories**',r=>{calls++;return r.fulfill({status:fail?400:200,headers:H,json:fail?{message:'Unavailable'}:[row]})});
 assert.equal(await page.evaluate(()=>refreshPublicStoryCloudFields()),false);assert.equal(await page.evaluate(()=>publicRefreshFlight),null);fail=false;assert.equal(await page.evaluate(()=>refreshPublicStoryCloudFields()),true);assert.equal(calls,2);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
for(const [signed,failedKind] of [[false,'counts'],[true,'counts'],[true,'membership']])test(`failed forced ${failedKind}: ${signed?'signed':'anonymous'} retry cannot join obsolete normal flight`,async()=>{
 const {page}=await setup(signed),oldGate=hold(),calls=[];let phase='old';
 try{
 await page.route('**/rest/v1/**',async r=>{
  const req=r.request(),table=new URL(req.url()).pathname.split('/').pop();if(req.method()==='OPTIONS')return r.fulfill({status:200,headers:H});if(isCommentEnrichmentRpc(new URL(req.url())))return r.fallback();
  const captured=phase,b=req.postData()?req.postDataJSON():null;calls.push({phase:captured,table});
  const kind=table==='nca_chapter_like_counts'?'counts':table==='nca_my_chapter_likes'?'membership':null;
  const data=table==='stories'?[{...row,author:captured}]:table==='nca_story_view_counts'?b.p_story_ids.map(story_id=>({story_id,view_count:10009})):kind==='counts'?b.p_chapter_ids.map(chapter_id=>({chapter_id,like_count:captured==='old'?1:captured==='forced'?2:3})):kind==='membership'?(captured==='old'?[]:b.p_chapter_ids):[];
  if(captured==='old')await oldGate.promise;
  const fail=captured==='forced'&&kind===failedKind;
  return r.fulfill({status:fail?400:200,headers:H,json:fail?{message:'deterministic forced failure'}:data});
 });
 await page.evaluate(()=>{window.oldRetryRead=refreshPublicStoryCloudFields()});await wait(()=>calls.length===(signed?4:3));
 phase='forced';assert.equal(await page.evaluate(()=>refreshPublicStoryCloudFields({forceFresh:true})),false);assert.equal(await page.evaluate(()=>publicRefreshFlight),null);
 // Successful parts remain applied despite the failed required chapter hydration.
 assert.equal(await page.evaluate(()=>stories[0].views),10009);if(failedKind==='membership')assert.equal(await page.evaluate(()=>storyLikeTotal(stories[0])),1052);
 phase='retry';assert.equal(await page.evaluate(()=>refreshPublicStoryCloudFields()),true);
 assert.equal(calls.filter(c=>c.phase==='retry').length,signed?4:3);assert.equal(calls.filter(c=>c.phase==='retry'&&c.table==='nca_chapter_like_counts').length,1);
 assert.deepEqual(await page.evaluate(()=>({total:storyLikeTotal(stories[0]),liked:likedChapters})),{total:1053,liked:signed?['1_0']:[]});
 oldGate.resolve();assert.equal(await page.evaluate(()=>oldRetryRead),false);assert.equal(await page.evaluate(()=>storyLikeTotal(stories[0])),1053);
 assert.deepEqual(await page.evaluate(()=>likedChapters),signed?['1_0']:[]);
 phase='subsequent';assert.equal(await page.evaluate(()=>refreshPublicStoryCloudFields()),true);assert.equal(calls.filter(c=>c.phase==='subsequent').length,signed?4:3);
 if(!signed)assert(!calls.some(c=>c.table==='nca_my_chapter_likes'));assert.deepEqual(page.errors,[]);
 }finally{oldGate.resolve();await page.close()}
});
test('obsolete normal finalizer cannot delete its pending replacement; equivalent retry joins replacement',async()=>{
 const {page}=await setup(true),old=hold(),retry=hold();let phase='old',reads=0;
 try{
 await page.route('**/rest/v1/rpc/nca_chapter_like_counts',async r=>{const p=phase;reads++;if(p==='old')await old.promise;if(p==='retry')await retry.promise;return r.fulfill({status:p==='forced'?400:200,headers:H,json:p==='forced'?{message:'fail'}:[{chapter_id:11,like_count:p==='old'?1:4}]})});
 await page.evaluate(()=>{window.originalCounts=refreshChapterLikeState([11])});await wait(()=>reads===1);phase='forced';assert.equal(await page.evaluate(()=>refreshPublicStoryCloudFields({forceFresh:true})),false);
 phase='retry';await page.evaluate(()=>{window.newCounts=refreshChapterLikeState([11])});await wait(()=>reads===3);old.resolve();await page.evaluate(()=>originalCounts);
 await page.evaluate(()=>{window.joinedCounts=refreshChapterLikeState([11])});await page.waitForTimeout(100);assert.equal(reads,3,'old finalizer must not evict current replacement');retry.resolve();await page.evaluate(()=>Promise.all([newCounts,joinedCounts]));assert.equal(await page.evaluate(()=>storyLikeTotal(stories[0])),1054);assert.deepEqual(page.errors,[]);
 }finally{old.resolve();retry.resolve();await page.close()}
});
test('multi-batch failed forced hydration keeps successful batches and retries all current batches',async()=>{
 const {page}=await setup(true),calls=[];let fail=true;
 try{
 await page.evaluate(()=>{stories[0].chapters=Array.from({length:1001},(_,i)=>({id:11+i,title:'Chapter',paras:[]}))});
 await page.route('**/rest/v1/rpc/nca_*chapter_like*',r=>{
  const table=new URL(r.request().url()).pathname.split('/').pop(),ids=r.request().postDataJSON().p_chapter_ids;calls.push({table,n:ids.length});
  const rejected=fail&&ids.length===1,data=table==='nca_chapter_like_counts'?ids.map(chapter_id=>({chapter_id,like_count:fail?3:4})):ids;
  return r.fulfill({status:rejected?400:200,headers:H,json:rejected?{message:'last batch failed'}:data});
 });
 assert.equal(await page.evaluate(()=>refreshPublicStoryCloudFields({forceFresh:true})),false);assert.equal(await page.evaluate(()=>chapterLikes['1_0']),3);assert.equal(await page.evaluate(()=>likedChapters.length),1000);
 fail=false;assert.equal(await page.evaluate(()=>refreshPublicStoryCloudFields()),true);assert.equal(await page.evaluate(()=>storyLikeTotal(stories[0])),5054);assert.equal(await page.evaluate(()=>likedChapters.length),1001);assert.deepEqual(calls.map(c=>c.n),[1000,1000,1,1,1000,1000,1,1]);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('account switch during held old/forced hydration rejects A completion and permits current B recovery',async()=>{
 const {page}=await setup(true),old=hold(),forced=hold();let phase='old',oldCalls=0,forcedCalls=0;
 try{
 page.mockFixtures.profiles.push({id:'second-user',display_name:'Second',role:'reader'});
 await page.route('**/rest/v1/**',async r=>{
  const req=r.request(),table=new URL(req.url()).pathname.split('/').pop();if(req.method()==='OPTIONS')return r.fulfill({status:200,headers:H});if(isCommentEnrichmentRpc(new URL(req.url())))return r.fallback();
  if(!['stories','nca_story_view_counts','nca_chapter_like_counts','nca_my_chapter_likes'].includes(table))return r.fallback();
  const p=phase,b=req.postData()?req.postDataJSON():null;if(p==='old')oldCalls++;if(p==='forced')forcedCalls++;
  const data=table==='stories'?[row]:table==='nca_story_view_counts'?b.p_story_ids.map(story_id=>({story_id,view_count:10009})):table==='nca_chapter_like_counts'?b.p_chapter_ids.map(chapter_id=>({chapter_id,like_count:p==='B'?4:1})):p==='B'?b.p_chapter_ids:[];
  if(p==='old')await old.promise;if(p==='forced')await forced.promise;
  const fail=p==='forced'&&table==='nca_my_chapter_likes';return r.fulfill({status:fail?400:200,headers:H,json:fail?{message:'A membership failed'}:data});
 });
 await page.evaluate(()=>{window.oldAccountRead=refreshPublicStoryCloudFields()});await wait(()=>oldCalls===4);
 phase='forced';await page.evaluate(()=>{window.forcedAccountRead=refreshPublicStoryCloudFields({forceFresh:true})});await wait(()=>forcedCalls===4);
 phase='B';await page.evaluate(()=>handleAuthState('SIGNED_IN',{user:{id:'second-user'}}));assert.equal(await page.evaluate(()=>refreshPublicStoryCloudFields()),true);
 forced.resolve();old.resolve();assert.deepEqual(await page.evaluate(()=>Promise.all([oldAccountRead,forcedAccountRead])),[false,false]);
 assert.deepEqual(await page.evaluate(()=>({owner:authUser.id,liked:likedChapters,total:storyLikeTotal(stories[0])})),{owner:'second-user',liked:['1_0'],total:1054});assert.deepEqual(page.errors,[]);
 }finally{old.resolve();forced.resolve();await page.close()}
});
test('membership-only recovery after failed force sends only a fresh membership RPC and stays retryable',async()=>{
 const {page,traffic}=await setup(true),gate=hold();let phase='old',members=0,countReads=0;
 try{
 await page.route('**/rest/v1/rpc/nca_my_chapter_likes',async r=>{const p=phase;members++;if(p==='old')await gate.promise;return r.fulfill({status:['forced','retry-fail'].includes(p)?400:200,headers:H,json:['forced','retry-fail'].includes(p)?{message:'membership failed'}:p==='old'?[]:[11]})});
 await page.route('**/rest/v1/rpc/nca_chapter_like_counts',r=>{countReads++;return r.fulfill({status:200,headers:H,json:[{chapter_id:11,like_count:3}]})});
 await page.evaluate(()=>{window.oldOnlyMember=refreshChapterLikeState([11],true)});await wait(()=>members===1);
 phase='forced';assert.equal(await page.evaluate(()=>refreshPublicStoryCloudFields({forceFresh:true})),false);assert.equal(countReads,1);
 phase='retry-fail';assert.equal(await page.evaluate(()=>refreshChapterLikeState([11],true)),false);
 phase='retry';assert.equal(await page.evaluate(()=>refreshChapterLikeState([11],true)),true);assert.equal(members,4);assert.equal(countReads,1);assert.deepEqual(await page.evaluate(()=>likedChapters),['1_0']);
 gate.resolve();assert.equal(await page.evaluate(()=>oldOnlyMember),false);assert.deepEqual(await page.evaluate(()=>likedChapters),['1_0']);assert(!traffic.some(c=>['reading_progress','saved_stories'].includes(c.table)));assert.deepEqual(page.errors,[]);
 }finally{gate.resolve();await page.close()}
});
