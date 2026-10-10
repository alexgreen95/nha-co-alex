const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const content={paragraphs:[{chapter_id:1,paragraph_number:1,content:'Content'}],nca_story_view_counts:[{story_id:1,view_count:2}]};
for(const slow of [false,true])test(`early intro → ${slow?'in-flight':'completed'} reader survives background hydration`,async()=>{
 const requests=[];
 const init=new Function(`window.race={};const original=window.fetch;window.fetch=async(...args)=>{const url=String(args[0]?.url||args[0]);if(url.includes('/rest/v1/reviews'))await new Promise(r=>setTimeout(r,900));if(${slow}&&url.includes('/rest/v1/story_views'))await new Promise(r=>setTimeout(r,1400));return original(...args)};const timer=setInterval(()=>{try{if(stories.length&&document.querySelector('.story-card')){clearInterval(timer);openStory(1);read(1,0).then(()=>race.done=true).catch(e=>race.error=e.message)}}catch{}},15);`);
 const page=await feedPage(0,{fixtures:content,initScript:init,onRequest:(u,r)=>requests.push([u.pathname,r.method()])});
 try{await page.waitForFunction(()=>window.race.done||window.race.error);assert.deepEqual(await page.evaluate(()=>({done:race.done,error:race.error||null,story:currentStory?.id,reader:!document.getElementById('reader').classList.contains('hidden')})),{done:true,error:null,story:1,reader:true});assert.equal(requests.filter(([p,m])=>p.endsWith('/story_views')&&m==='POST').length,1);assert.deepEqual(page.errors,[])}finally{await page.close()}
});
function returnInit(destination,initial='/truyen/truyen-thu-nghiem/chuong-1'){
 return new Function(`history.replaceState({},'',${JSON.stringify(initial)});sessionStorage.setItem('nha_return_path',${JSON.stringify(destination)});let sdk;Object.defineProperty(window,'supabase',{configurable:true,get(){return sdk},set(v){sdk=v;const create=v.createClient;v.createClient=(...args)=>{const client=create(...args);client.auth.getSession=async()=>({data:{session:{user:{id:'reader-user',user_metadata:{full_name:'Reader'}}}}});client.auth.onAuthStateChange=cb=>{queueMicrotask(()=>cb('INITIAL_SESSION',{user:{id:'reader-user'}}));return {data:{subscription:{unsubscribe(){}}}}};return client}}});`);
}
for(const destination of ['/truyen/truyen-thu-nghiem/chuong-1','/truyen/truyen-thu-nghiem','/user/Reader'])test(`bootstrap resolves ${destination} before its only initial dispatch`,async()=>{
 const requests=[],page=await feedPage(0,{fixtures:{...content,profiles:[{id:'reader-user',username:'reader',display_name:'Reader',role:'member'}]},initScript:returnInit(destination),onRequest:(u,r)=>requests.push([u.pathname,r.method()])});
 try{await page.waitForTimeout(300);assert.equal(requests.filter(([p,m])=>p.endsWith('/story_views')&&m==='POST').length,destination.endsWith('chuong-1')?1:0);assert.equal(new URL(page.url()).pathname,destination.toLowerCase());assert.equal(await page.evaluate(()=>sessionStorage.getItem('nha_return_path')),null);assert.deepEqual(page.errors,[])}finally{await page.close()}
});
for(const target of ['home','profile'])test(`old hydration cannot replace newer ${target} navigation`,async()=>{
 const init=new Function(`const original=window.fetch;window.fetch=async(...args)=>{if(String(args[0]?.url||args[0]).includes('/rest/v1/reviews'))await new Promise(r=>setTimeout(r,900));return original(...args)};const timer=setInterval(()=>{try{if(stories.length&&document.querySelector('.story-card')){clearInterval(timer);openStory(1);${target==='home'?"show('home')":"openUserProfile('reader',true)"}}}catch{}},15);`);
 const requests=[],page=await feedPage(0,{initScript:init,fixtures:{profiles:[{id:'reader-user',username:'reader',display_name:'Reader',role:'member'}]},onRequest:(u,r)=>requests.push([u.pathname,r.method()])});
 try{assert.equal(await page.evaluate(()=>pageIds.find(id=>!document.getElementById(id).classList.contains('hidden'))),target==='home'?'home':'profilePage');assert.equal(await page.evaluate(()=>currentStory),null);assert.equal(requests.filter(([p,m])=>p.endsWith('/story_views')&&m==='POST').length,0);assert.deepEqual(page.errors,[])}finally{await page.close()}
});
test('navigation during metadata await supersedes bootstrap return path, even with pending reader',async()=>{
 const page=await feedPage(0,{fixtures:content});try{
 const result=await page.evaluate(async()=>{
  const original={get:sb.auth.getSession,on:sb.auth.onAuthStateChange,load:loadCloudStories,profile:syncProfile};let release;
  sb.auth.getSession=async()=>({data:{session:{user:{id:'reader-user'}}}});sb.auth.onAuthStateChange=()=>({});syncProfile=async()=>{};loadCloudStories=()=>new Promise(r=>release=r);
  sessionStorage.setItem('nha_return_path','/user/reader');const pending=initAuth();while(!release)await new Promise(r=>setTimeout(r,0));openStory(1);history.replaceState({},'','/truyen/truyen-thu-nghiem/chuong-1');routeFromLocation();release(true);await pending;while(document.getElementById('reader').classList.contains('hidden'))await new Promise(r=>setTimeout(r,10));
  sb.auth.getSession=original.get;sb.auth.onAuthStateChange=original.on;loadCloudStories=original.load;syncProfile=original.profile;
  return {path:location.pathname,story:currentStory?.id,reader:!document.getElementById('reader').classList.contains('hidden')};
 });assert.deepEqual(result,{path:'/truyen/truyen-thu-nghiem/chuong-1',story:1,reader:true});assert.deepEqual(page.errors,[])}finally{await page.close()}
});
test('explicit subsequent opens retain cached/uncached budget; back/forward routes stay canonical',async()=>{
 const requests=[],page=await feedPage(0,{fixtures:content,onRequest:(u,r)=>requests.push([u.pathname,r.method()])});try{
 for(const cached of [false,true]){requests.length=0;await page.evaluate(()=>read(1,0));assert.equal(requests.filter(([p,m])=>p.endsWith('/story_views')&&m==='POST').length,1);assert.equal(requests.filter(([p])=>p.endsWith('/nca_story_view_counts')).length,1);assert.equal(requests.filter(([p])=>/\/(paragraphs|chapter_images)$/.test(p)).length,cached?0:2)}
 await page.evaluate(()=>openStory(1));await page.goBack();await page.waitForFunction(()=>!document.getElementById('reader').classList.contains('hidden'));assert.match(new URL(page.url()).pathname,/chuong-1$/);await page.goForward();await page.waitForFunction(()=>!document.getElementById('storyIntro').classList.contains('hidden'));assert.equal(new URL(page.url()).pathname,'/truyen/truyen-thu-nghiem');assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('initial user route dispatches once, including INITIAL_SESSION callback and canonicalization',async()=>{
 const page=await feedPage(0,{fixtures:{profiles:[{id:'reader-user',username:'reader',display_name:'Reader',role:'member'}]}});try{
 const result=await page.evaluate(async()=>{
  const original={get:sb.auth.getSession,on:sb.auth.onAuthStateChange,load:loadCloudStories,profile:syncProfile,route:routeFromLocation};let calls=0;
  sb.auth.getSession=async()=>({data:{session:{user:{id:'reader-user'}}}});syncProfile=async()=>{};loadCloudStories=async()=>true;
  sb.auth.onAuthStateChange=cb=>{queueMicrotask(()=>cb('INITIAL_SESSION',{user:{id:'reader-user'}}));return {}};
  routeFromLocation=()=>{calls++;return original.route()};history.replaceState({},'','/user/Reader');sessionStorage.setItem('nha_return_path','/user/Reader');await initAuth();await new Promise(r=>setTimeout(r,50));
  sb.auth.getSession=original.get;sb.auth.onAuthStateChange=original.on;loadCloudStories=original.load;syncProfile=original.profile;routeFromLocation=original.route;
  return {calls,path:location.pathname};
 });assert.deepEqual(result,{calls:1,path:'/user/reader'});assert.deepEqual(page.errors,[])}finally{await page.close()}
});
for(const target of ['home','intro','reader-completed','reader-pending','profile'])test(`held hydration refreshes ${target} safely, with zero hydration-only view events`,async()=>{
 const requests=[],page=await feedPage(0,{fixtures:content,onRequest:(u,r)=>requests.push([u.pathname,r.method()])});try{
 await page.evaluate(async()=>{
  // Hold the actual public metadata query; exercise actual hydration + DOM refresh.
  const from=sb.from.bind(sb);sb.from=table=>table==='stories'?{select(){return this},range(){return this},order(){return this},then(resolve){window.releaseHydration=()=>resolve({data:[{id:1,title:'Truyện thử nghiệm',author:'Hydrated author',summary:'Hydrated summary',main_genre:'Tu tiên',status:'completed',subtags:['Hydrated tag'],introduction:'Hydrated introduction',published:true}],error:null})}}:from(table);
  sb.auth.getSession=async()=>({data:{session:null}});sb.auth.onAuthStateChange=()=>({});loadCloudStories=async()=>true;
  const refresh=refreshHydratedVisibleView;window.hydrationCompletions=0;refreshHydratedVisibleView=()=>{refresh();hydrationCompletions++};
  setRoute('/truyen/truyen-thu-nghiem');await initAuth();
 });
 await page.waitForFunction(()=>!!window.releaseHydration);
 await page.evaluate(async target=>{
  if(target==='home')show('home');
  if(target==='reader-completed')await read(1,0);
  if(target==='reader-pending'){
   const ensure=ensureChapterContent;ensureChapterContent=async(...args)=>{await new Promise(resolve=>window.releaseReader=resolve);return ensure(...args)};window.pendingReader=read(1,0);
  }
  if(target==='profile')await openUserProfile('ban-doc',true);
  if(target==='intro'){
   showIntroTab('chapters',document.querySelectorAll('.intro-tabs button')[1]);
   document.getElementById('introAboutEdit').hidden=false;document.getElementById('introAboutInput').value='Unsaved intro draft';
  }
  window.beforeHydration={path:location.pathname,historyLength:history.length,epoch:navigationEpoch,story:currentStory,profile:document.getElementById('profileContent').innerHTML};
  // Any hydration-driven navigation/view recording must fail the test immediately.
  for(const name of ['openStory','setRoute','routeFromLocation'])window[name]=()=>{throw Error('Hydration called '+name)};
 },target);
 const beforeViews=requests.filter(([p,m])=>p.endsWith('/story_views')&&m==='POST').length;
 await page.evaluate(()=>releaseHydration());await page.waitForFunction(()=>hydrationCompletions===1);
 const state=await page.evaluate(()=>({path:location.pathname,historyLength:history.length,epoch:navigationEpoch,sameStory:currentStory===beforeHydration.story,story:currentStory?.id||null,author:document.getElementById('introAuthor').textContent,summary:document.getElementById('introSummary').textContent,genre:document.getElementById('introGenre').textContent,status:document.getElementById('introStatus').textContent,tags:document.getElementById('introSubtags').textContent,card:document.querySelector('.story-card').textContent,page:pageIds.find(id=>!document.getElementById(id).classList.contains('hidden')),profileUnchanged:document.getElementById('profileContent').innerHTML===beforeHydration.profile,before:{path:beforeHydration.path,historyLength:beforeHydration.historyLength,epoch:beforeHydration.epoch}}));
 assert.equal(state.path,state.before.path);assert.equal(state.historyLength,state.before.historyLength);assert.equal(state.epoch,state.before.epoch);assert.equal(state.sameStory,true);
 assert.equal(requests.filter(([p,m])=>p.endsWith('/story_views')&&m==='POST').length,beforeViews);
 if(target==='home'){assert.equal(state.page,'home');assert.match(state.card,/Hydrated author/)}
 if(target==='intro'){
  assert.equal(state.page,'storyIntro');assert.equal(state.author,'Tác giả: Hydrated author');assert.equal(state.summary,'Hydrated summary');assert.equal(state.genre,'Tu tiên');assert.equal(state.status,'Đã hoàn thành');assert.equal(state.tags,'Hydrated tag');
  assert.equal(await page.evaluate(()=>document.getElementById('introChapters').classList.contains('active')),true);
  assert.deepEqual(await page.evaluate(()=>({draft:document.getElementById('introAboutInput').value,hidden:document.getElementById('introAboutEdit').hidden})),{draft:'Unsaved intro draft',hidden:false});
 }
 if(target==='reader-completed'){assert.equal(state.page,'reader');assert.equal(state.story,1)}
 if(target==='reader-pending'){
  assert.equal(state.page,'storyIntro');assert.equal(state.story,1);assert.equal(state.author,'Tác giả: Alex');
  await page.evaluate(async()=>{releaseReader();await pendingReader});assert.equal(await page.evaluate(()=>currentStory.id),1);assert.equal(await page.evaluate(()=>document.getElementById('reader').classList.contains('hidden')),false);
  assert.equal(requests.filter(([p,m])=>p.endsWith('/story_views')&&m==='POST').length,beforeViews+1);
 }
 if(target==='profile'){assert.equal(state.page,'profilePage');assert.equal(state.profileUnchanged,true)}
 assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
for(const panel of ['reviewsPanel','storiesPanel','commentsPanel'])test(`authenticated ${panel}: reviews before metadata; current tab stays selected, refresh uses memory only`,async()=>{
 const cover=label=>'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="3" height="4"><text>${label}</text></svg>`).toString('base64');
 const oldCover=cover('old'),newCover=cover('hydrated'),requests=[];
 const page=await feedPage(1,{fixtures:{stories:[{id:1,title:'Truyện thử nghiệm',author:'Alex',cover_url:oldCover,published:true,status:'ongoing'}]},onRequest:(u,r)=>{if(u.pathname.startsWith('/rest/v1/'))requests.push([u.pathname,r.method()])}});
 try{
 await page.evaluate(async({panel,newCover})=>{
  const from=sb.from.bind(sb);sb.from=table=>table==='stories'?{select(){return this},range(){return this},order(){return this},then(resolve){window.releaseHomeMetadata=()=>resolve({data:[{id:1,title:'Truyện thử nghiệm',author:'Hydrated author',cover_url:newCover,published:true}],error:null})}}:from(table);
  sb.auth.getSession=async()=>({data:{session:{user:{id:'reader-user',user_metadata:{full_name:'Bạn đọc'}}}}});sb.auth.onAuthStateChange=()=>({});syncProfile=async()=>{};loadCloudStories=async()=>true;
  const commentsLoad=loadCloudComments,reviewsLoad=loadCloudReviews;loadCloudComments=async()=>{await commentsLoad();window.homeCommentsReady=true};loadCloudReviews=async()=>{await reviewsLoad();window.homeReviewsReady=true};
  const refresh=refreshHydratedVisibleView;window.homeRefreshDone=false;window.reviewRenders=0;
  const reviewRender=renderHomeReviews;renderHomeReviews=()=>{window.reviewRenders++;return reviewRender()};
  refreshHydratedVisibleView=()=>{refresh();window.homeRefreshDone=true};
  await initAuth();
  while(!window.homeCommentsReady||!window.homeReviewsReady||!window.releaseHomeMetadata)await new Promise(r=>setTimeout(r,10));
  switchHomeTab(panel,document.querySelector(`[data-home-tab="${panel}"]`));
 },{panel,newCover});
 await page.waitForLoadState('networkidle');
 assert.equal(await page.evaluate(()=>authUser.id),'reader-user');
 assert.equal(await page.locator('.home-review-story-author').textContent(),'Tác giả: Alex');
 assert.equal(await page.locator('.home-review-story-cover img').getAttribute('src'),oldCover);
 const beforeRequests=requests.length,before=await page.evaluate(()=>({path:location.pathname,length:history.length,epoch:navigationEpoch,reviewRenders:window.reviewRenders}));
 await page.evaluate(()=>{
  for(const name of ['openStory','setRoute','routeFromLocation','displayPage'])window[name]=()=>{throw Error('UI refresh called '+name)};
  releaseHomeMetadata();
 });
 await page.waitForFunction(()=>window.homeRefreshDone);await page.waitForTimeout(100);
 assert.equal(requests.length,beforeRequests,'UI refresh must not issue any REST request');
 assert.equal(requests.filter(([p,m])=>p.endsWith('/story_views')&&m==='POST').length,0);
 assert.deepEqual(await page.evaluate(()=>({path:location.pathname,length:history.length,epoch:navigationEpoch})),{path:before.path,length:before.length,epoch:before.epoch});
 assert.equal(await page.evaluate(()=>document.querySelector('.home-panel.active').id),panel);
 assert.equal(await page.evaluate(()=>document.querySelector('.home-tab.active').dataset.homeTab),panel);
 assert.equal(await page.evaluate(()=>currentStory),null);
 assert.match(await page.locator('.story-card').textContent(),/Hydrated author/);
 assert.equal(await page.locator('.story-card img').first().getAttribute('src'),newCover);
 if(panel==='reviewsPanel'){
  assert.equal(await page.locator('.home-review-story-author').textContent(),'Tác giả: Hydrated author');
  assert.equal(await page.locator('.home-review-story-cover img').getAttribute('src'),newCover);
  assert.equal(await page.evaluate(()=>window.reviewRenders),before.reviewRenders+1);
 }else assert.equal(await page.evaluate(()=>window.reviewRenders),before.reviewRenders,'Inactive reviews should not be re-rendered by completion');
 if(panel==='commentsPanel')assert.equal(await page.locator('#commentsPanel .home-comment-card').count(),6);
 assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
