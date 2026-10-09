const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
test('bell filters by recipient, counts all unread types, marks only that recipient and opens a reply',async()=>{
 const page=await feedPage(0);const requests=[];
 const rows=[{id:'n-reply',user_id:'reader-user',actor_id:'admin-user',type:'reply',is_read:false,comment_id:'reply-test',story_id:1},{id:'n-like',user_id:'reader-user',type:'comment_like',is_read:false,comment_id:'comment-0',story_id:1},{id:'n-other',user_id:'someone-else',type:'reply',is_read:false,comment_id:'comment-0',story_id:1}];
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-expose-headers':'content-range'};
 try{
  await page.route('**/rest/v1/notifications**',route=>{
   const req=route.request(),url=new URL(req.url());requests.push({method:req.method(),url});
   if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});
   let selected=rows.filter(n=>'eq.'+n.user_id===url.searchParams.get('user_id'));
   if(url.searchParams.has('is_read'))selected=selected.filter(n=>'eq.'+n.is_read===url.searchParams.get('is_read'));
   if(url.searchParams.has('id'))selected=selected.filter(n=>'eq.'+n.id===url.searchParams.get('id'));
   if(url.searchParams.has('type')){const type=url.searchParams.get('type');selected=selected.filter(n=>type.startsWith('eq.')?type==='eq.'+n.type:type.includes(n.type));}
   if(req.method()==='PATCH'){selected.forEach(n=>n.is_read=req.postDataJSON().is_read);return route.fulfill({status:204,headers});}
   return route.fulfill({status:200,headers:{...headers,'content-range':`0-${Math.max(0,selected.length-1)}/${selected.length}`},contentType:'application/json',body:req.method()==='HEAD'?'':JSON.stringify(selected)});
  });
  const reply={id:'reply-test',user_id:'admin-user',story_id:1,scope:'story',parent_id:'comment-0',content:'Nội dung trả lời',created_at:'2026-10-09T12:00:00Z'};
  await page.route('**/rest/v1/comments**',route=>{
   const url=new URL(route.request().url());const base=Array.from({length:7},(_,i)=>({id:'comment-'+i,user_id:'reader-user',content:'Bình luận '+i,scope:'story',story_id:1,created_at:'2026-10-09T10:00:00Z'}));
   return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(url.searchParams.has('id')?reply:[...base,reply])});
  });
  await page.evaluate(async()=>{authUser={id:'reader-user'};await loadNotifications();});
  assert.equal(await page.locator('#notifList .notif-item').count(),2);
  assert.equal(await page.locator('#notifBadge').textContent(),'2');
  await page.evaluate(async()=>{notifFilter='like';await loadNotifications();});
  assert.equal(await page.locator('#notifList .notif-item').count(),1);
  assert.equal(await page.locator('#notifBadge').textContent(),'2');
  await page.evaluate(async()=>{await markNotificationsRead();});
  assert.equal(await page.locator('#notifBadge').textContent(),'1');
  assert.equal(rows[2].is_read,false);
  await page.evaluate(async()=>{notifFilter='all';await loadNotifications();await openNotification('n-reply');});
  assert.equal(await page.locator('#notifBadge').textContent(),'0');
  assert(await page.locator('#introComments').evaluate(el=>el.classList.contains('active')));
  assert.equal(await page.locator('#storyCommentList .comment-item[data-comment-id="reply-test"]').count(),1);
  assert(requests.filter(r=>r.method!=='OPTIONS').every(r=>r.url.searchParams.get('user_id')==='eq.reader-user'));
  await page.evaluate(async()=>{authUser={id:'someone-else'};const pending=loadNotifications();if(notificationRows.size!==0)throw new Error('Old account notification cache leaked');await pending;});
  assert.equal(await page.locator('#notifList .notif-item').count(),1);
  assert.equal(await page.locator('#notifList .notif-item').getAttribute('data-notification-id'),'n-other');
  await page.evaluate(async()=>{authUser=null;await loadNotifications();});
  assert.equal(await page.locator('#notifList .notif-item').count(),0);
  assert.equal(await page.locator('#notifBadge').textContent(),'0');
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('mention helper keeps legacy notifications until migration and delegates afterward',async()=>{
 const page=await feedPage(0);let enabled=false,duplicate=false;const writes=[];
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
 try{
  await page.route('**/rest/v1/rpc/nca_comment_notifications_enabled',route=>route.fulfill({status:enabled?200:404,headers,contentType:'application/json',body:enabled?'true':'{"code":"PGRST202","message":"Function not installed"}'}));
  await page.route('**/rest/v1/comment_mentions',route=>{writes.push('mention');return route.fulfill({status:duplicate?409:201,headers,contentType:'application/json',body:duplicate?'{"code":"23505","message":"Duplicate mention"}':'[]'});});
  await page.route('**/rest/v1/notifications',route=>{writes.push('notification');return route.fulfill({status:201,headers,contentType:'application/json',body:'[]'});});
  await page.evaluate(()=>{authUser={id:'reader-user'};mentionProfilesBySlug={alex:{id:'admin-user',display_name:'Alex'}};});
  await page.evaluate(async()=>{await saveCommentMentions(123,'@alex @alex',{story_id:1});});
  assert.deepEqual(writes,['mention','notification']);
  enabled=true;writes.length=0;
  await page.evaluate(async()=>{await saveCommentMentions(124,'@alex',{story_id:1});});
  assert.deepEqual(writes,['mention']);
  enabled=false;duplicate=true;writes.length=0;
  await page.evaluate(async()=>{await saveCommentMentions(123,'@alex',{story_id:1});});
  assert.deepEqual(writes,['mention']);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('all notification types show actor profile names across two recipient accounts',async()=>{
 const page=await feedPage(0);const profileReads=[];
 const types=['comment_like','reply','mention','story_like','comment','chapter_like','review_like'];
 const rows=types.map((type,i)=>({id:'a-'+i,user_id:'reader-user',actor_id:'admin-user',type,is_read:false})).concat(types.map((type,i)=>({id:'b-'+i,user_id:'admin-user',actor_id:'reader-user',type,is_read:false})));
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-expose-headers':'content-range'};
 try{
  await page.route('**/rest/v1/notifications**',route=>{
   const req=route.request(),url=new URL(req.url());let selected=rows.filter(n=>'eq.'+n.user_id===url.searchParams.get('user_id'));
   const filter=url.searchParams.get('type');if(filter)selected=selected.filter(n=>filter.startsWith('eq.')?filter==='eq.'+n.type:filter.includes(n.type));
   return route.fulfill({status:200,headers:{...headers,'content-range':`0-${selected.length-1}/${selected.length}`},contentType:'application/json',body:req.method()==='HEAD'?'':JSON.stringify(selected)});
  });
  await page.route('**/rest/v1/profiles**',route=>{profileReads.push(new URL(route.request().url()));return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify([{id:'admin-user',display_name:'Alex',avatar_url:'https://example.invalid/avatar.png'},{id:'reader-user',display_name:'Bạn đọc <b>thử</b>'}])});});
  await page.evaluate(async()=>{authUser={id:'reader-user'};await loadNotifications();});
  assert.equal(await page.locator('#notifList .notif-item').count(),types.length);
  assert((await page.locator('#notifList .notif-item').allTextContents()).every(text=>text.startsWith('Alex ')));
  assert.equal(profileReads.length,1);assert.match(profileReads[0].searchParams.get('id'),/admin-user/);
  assert.equal(await page.locator('#notifList img').count(),0);
  for(const filter of ['like','reply','mention']){
   await page.evaluate(async filter=>{notifFilter=filter;await loadNotifications();},filter);
   assert((await page.locator('#notifList .notif-item').allTextContents()).every(text=>text.startsWith('Alex ')));
  }
  await page.evaluate(async()=>{authUser={id:'admin-user'};notifFilter='all';await loadNotifications();});
  assert((await page.locator('#notifList .notif-item').allTextContents()).every(text=>text.startsWith('Bạn đọc <b>thử</b> ')));
  assert.equal(await page.locator('#notifList b').count(),0);
  assert.equal(await page.locator('#notifBadge').textContent(),String(types.length));
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
