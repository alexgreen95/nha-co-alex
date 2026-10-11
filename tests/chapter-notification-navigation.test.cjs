const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage:legacyFeedPage}=require('./helpers/public-feed-browser.cjs');
const feedPage=(n,options={})=>legacyFeedPage(n,{canonicalComments:true,...options});
before(startBrowser);after(stopBrowser);
async function setup(){
 const page=await feedPage(0,{fixtures:{chapters:[{id:17,story_id:1,chapter_number:2,published:true,title:'Second'},{id:99,story_id:1,chapter_number:18,published:true,title:'Eighteenth'}]}});
 await page.evaluate(()=>{authUser={id:'reader-user'};notificationOwner=authUser.id;loadNotifications=async()=>{};sb.from=()=>({update:()=>({eq(){return this},then(resolve){resolve({error:null})}})});window.navigationCalls=[];read=async(id,index)=>navigationCalls.push(['read',id,index]);openStory=id=>navigationCalls.push(['story',id]);});
 return page;
}
test('chapter notification resolves real ID rather than number/index; legacy story notification and unavailable chapter fallback',async()=>{
 const page=await setup();try{
  const result=await page.evaluate(async()=>{
   const cases=[{id:1,type:'story_like',story_id:1,chapter_id:99},{id:2,type:'story_like',story_id:1},{id:3,type:'story_like',story_id:1,chapter_id:555},{id:4,type:'chapter_like',story_id:1,chapter_id:17},{id:5,type:'story_like',story_id:2,chapter_id:99}];
   for(const n of cases){notificationRows.set(String(n.id),n);await openNotification(n.id)}
   return {calls:navigationCalls,text:cases.map(notifText)};
  });
  assert.deepEqual(result.calls,[['read',1,1],['story',1],['story',1],['read',1,0]]);
  assert.match(result.text[0],/một chương/);assert.equal(result.text[1],'đã thả tim truyện của bạn.');assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('account switch during mark-read or subsequent refresh never opens old account notification',async()=>{
 const page=await setup();try{
  for(const stage of ['write','refresh']){
   await page.evaluate(async stage=>{authUser={id:'reader-user'};notificationOwner=authUser.id;navigationCalls=[];notificationRows.set('1',{id:1,type:'story_like',story_id:1,chapter_id:99});
    sb.from=()=>({update:()=>({eq(){return this},then(resolve){if(stage==='write')authUser={id:'other-user'};resolve({error:null})}})});
    loadNotifications=async()=>{if(stage==='refresh'){authUser={id:'other-user'};notificationOwner='other-user'}};
    await openNotification('1');
   },stage);assert.deepEqual(await page.evaluate(()=>navigationCalls),[]);
  }
 }finally{await page.close()}
});
test('chapter notification uses existing read once: one view event per real cached/uncached opening; legacy/fallback emits none',async()=>{
 const page=await feedPage(0);try{
  await page.evaluate(()=>{authUser={id:'reader-user'};notificationOwner=authUser.id;loadNotifications=async()=>{};sb.from=()=>({update:()=>({eq(){return this},then(resolve){resolve({error:null})}})});window.viewEvents=[];window.contentCalls=[];recordStoryView=async id=>viewEvents.push(id);ensureChapterContent=async(s,i)=>{contentCalls.push(s.chapters[i]._parasLoaded?'cached':'uncached');s.chapters[i].paras=['Content'];s.chapters[i]._parasLoaded=true};notificationRows.set('1',{id:1,type:'story_like',story_id:1,chapter_id:1});});
  await page.evaluate(async()=>{await openNotification('1');await openNotification('1')});
  assert.deepEqual(await page.evaluate(()=>viewEvents),[1,1]);assert.deepEqual(await page.evaluate(()=>contentCalls),['uncached','cached']);
  assert.equal(await page.evaluate(()=>currentChapter),0);assert.match(new URL(page.url()).pathname,/chuong-/);
  await page.evaluate(async()=>{notificationRows.set('2',{id:2,type:'story_like',story_id:1});await openNotification('2')});assert.deepEqual(await page.evaluate(()=>viewEvents),[1,1]);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('comment-like/reply/mention keep comment target precedence and paragraph navigation',async()=>{
 const page=await feedPage(0,{fixtures:{chapters:[{id:17,story_id:1,chapter_number:2,published:true,title:'Second'},{id:99,story_id:1,chapter_number:18,published:true,title:'Eighteenth'}],paragraphs:Array.from({length:4},(_,i)=>({chapter_id:99,paragraph_number:i+1,content:'Paragraph '+i}))}});try{
  page.mockFixtures.comments.push({id:'101',user_id:'reader-user',scope:'paragraph',story_id:1,chapter_index:1,paragraph_index:3,content:'Root',created_at:'2026-10-09T11:00:00Z'},{id:'102',parent_id:'101',reply_to_user_id:'reader-user',user_id:'admin-user',scope:'paragraph',story_id:1,chapter_index:1,paragraph_index:3,content:'Reply',created_at:'2026-10-09T12:00:00Z'});
  await page.evaluate(()=>{authUser={id:'reader-user'};notificationOwner=authUser.id;loadNotifications=async()=>{};window.navigationCalls=[];window.viewEvents=[];recordStoryView=async id=>viewEvents.push(id);const ordinaryRead=read,jump=jumpToParagraphOnly,toggle=toggleComments,focus=focusExactComment;read=async(...args)=>{navigationCalls.push(['read',...args]);return ordinaryRead(...args)};jumpToParagraphOnly=key=>{navigationCalls.push(['paragraph',key]);return jump(key)};toggleComments=(key,on)=>{navigationCalls.push(['comments',key,on]);return toggle(key,on)};focusExactComment=id=>{navigationCalls.push(['focus',id]);return focus(id)}});
  await page.route('**/rest/v1/notifications**',route=>route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}}));
  for(const type of ['comment_like','reply','mention']){
   const calls=await page.evaluate(async type=>{
    navigationCalls=[];notificationRows.set('p',{id:'p',type,story_id:1,chapter_id:99,comment_id:'102'});await openNotification('p');return navigationCalls;
   },type);
   const expected=[['paragraph','1_1_3'],['comments','1_1_3',true],['focus','102']];if(type==='comment_like')expected.unshift(['read',1,1]);assert.deepEqual(calls,expected);
   assert.equal(await page.locator('#paragraphCommentPanelBody .comment-item[data-comment-id="102"]').count(),1);assert.equal(await page.evaluate(()=>currentChapter),1);
  }
  assert.deepEqual(await page.evaluate(()=>viewEvents),[1],'same completed reader is reused for subsequent targets');assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});

test('REST integration: normal read and notification read each INSERT one view and refresh total once, cached or uncached',async()=>{
 const requests=[],page=await feedPage(0,{fixtures:{chapters:[{id:99,story_id:1,chapter_number:18,published:true,title:'Chapter eighteen'}],paragraphs:[{chapter_id:99,paragraph_number:1,content:'Actual chapter text'}],nca_story_view_counts:[{story_id:1,view_count:100}]},onRequest:(url,req)=>{if(url.pathname.startsWith('/rest/v1/'))requests.push({path:url.pathname,method:req.method()})}});
 let views=100;const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-expose-headers':'content-range'};
 const notification={id:'chapter-heart',user_id:'reader-user',actor_id:'admin-user',type:'story_like',story_id:1,chapter_id:99,is_read:false};
 try{
  await page.route('**/rest/v1/story_views**',async route=>{assert.equal(route.request().method(),'POST');assert.deepEqual(route.request().postDataJSON(),{story_id:1,user_id:'reader-user'});views++;requests.push({path:'/rest/v1/story_views',method:'POST'});await route.fulfill({status:201,headers,contentType:'application/json',body:'[]'})});
  await page.route('**/rest/v1/rpc/nca_story_view_counts',route=>{requests.push({path:'/rest/v1/rpc/nca_story_view_counts',method:'POST'});return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify([{story_id:1,view_count:views}])})});
  await page.route('**/rest/v1/notifications**',route=>{
   const req=route.request(),url=new URL(req.url());requests.push({path:url.pathname,method:req.method()});assert.equal(url.searchParams.get('user_id'),'eq.reader-user');
   if(req.method()==='PATCH'){notification.is_read=true;return route.fulfill({status:204,headers})}
   const rows=url.searchParams.get('is_read')==='eq.false'&&notification.is_read?[]:[notification];
   return route.fulfill({status:200,headers:{...headers,'content-range':`0-${Math.max(0,rows.length-1)}/${rows.length}`},contentType:'application/json',body:req.method()==='HEAD'?'':JSON.stringify(rows)});
  });
  await page.evaluate(async()=>{authUser={id:'reader-user'};await loadNotifications()});
  assert.match(await page.locator('#notifList').textContent(),/Alex đã thả tim một chương/);
  const budgets=[];
  for(const cached of [false,true])for(const mode of ['normal','notification']){
   if(!cached)await page.evaluate(()=>{stories[0].chapters[0]._parasLoaded=false});
   requests.length=0;const before=views;
   await page.evaluate(async mode=>{if(mode==='normal')await read(1,0);else await openNotification('chapter-heart')},mode);
   assert.equal(views-before,1);assert.equal(await page.evaluate(()=>stories[0].views),views);
   assert.equal(requests.filter(r=>r.path==='/rest/v1/story_views').length,1);
   assert.equal(requests.filter(r=>r.path==='/rest/v1/rpc/nca_story_view_counts').length,1);
   assert.equal(requests.filter(r=>/\/(paragraphs|chapter_images)$/.test(r.path)).length,cached?0:2);
   assert.equal(requests.filter(r=>r.path==='/rest/v1/chapters').length,0);
   const notificationRequests=requests.filter(r=>r.path==='/rest/v1/notifications');
   assert.deepEqual(notificationRequests.map(r=>r.method).sort(),mode==='notification'?['GET','HEAD','PATCH']:[]);
   budgets.push({cached,mode,view_inserts:1,view_count_rpcs:1,content_gets:cached?0:2,notification_requests:notificationRequests.length});
  }
  const before=views;await page.evaluate(async()=>{notificationRows.set('legacy',{id:'legacy',type:'story_like',story_id:1});await openNotification('legacy')});assert.equal(views,before);
  assert.deepEqual(page.errors,[]);require('node:fs').writeFileSync('/tmp/nca-notification-implementation-request-budget.json',JSON.stringify(budgets,null,2));
 }finally{await page.close()}
});
