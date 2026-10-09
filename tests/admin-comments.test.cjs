const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
test('role admin sees delete menus for others and successful root/reply deletion refreshes immediately',async()=>{
 const page=await feedPage(0);let rows=Array.from({length:7},(_,i)=>({id:'comment-'+i,user_id:'reader-user',content:'Bình luận '+i,scope:'story',story_id:1,created_at:new Date(Date.UTC(2026,9,9,10,i)).toISOString()}));
 rows.push({id:'reply-test',parent_id:'comment-0',user_id:'reader-user',content:'Trả lời',scope:'story',story_id:1,created_at:'2026-10-09T11:00:00Z'});
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};let deletes=0;
 try{
  await page.route('**/rest/v1/comments**',route=>{
   const req=route.request(),url=new URL(req.url());
   if(req.method()==='DELETE'){deletes++;const id=url.searchParams.get('id').slice(3),deleted=rows.filter(r=>r.id===id);rows=rows.filter(r=>r.id!==id&&r.parent_id!==id);return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(deleted.map(r=>({id:r.id})))});}
   return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(rows)});
  });
  await page.route('**/rest/v1/profiles**',route=>{const url=new URL(route.request().url());let profiles=[{id:'admin-user',display_name:'Alex',role:'admin'},{id:'reader-user',display_name:'Bạn đọc',role:'reader'}];if(url.searchParams.get('id')?.startsWith('eq.'))profiles=profiles.filter(p=>'eq.'+p.id===url.searchParams.get('id'));return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(profiles)});});
  await page.evaluate(async()=>{authUser={id:'admin-user'};await syncProfileV179(authUser);await loadCloudComments();openStory(1);showIntroTab('comments',document.querySelectorAll('.intro-tabs button')[3]);});
  assert.equal(await page.evaluate(()=>memberProfile.role),'admin');
  const root=page.locator('#storyCommentList .comment-item[data-comment-id="comment-0"]');
  assert.equal(await root.locator('.comment-more').count(),1);
  assert.equal(await root.locator('[data-comment-action="edit"]').count(),0);
  page.on('dialog',dialog=>dialog.accept());
  await page.evaluate(async()=>{await deleteCommentById('story_1','reply-test');});
  assert(!rows.some(r=>r.id==='reply-test'));assert(rows.some(r=>r.id==='comment-0'));
  await root.locator('.comment-more').click();await root.locator('[data-comment-action="delete"]').click();
  await root.waitFor({state:'detached'});
  assert(!rows.some(r=>r.id==='comment-0'));assert.equal(deletes,2);
  await page.evaluate(()=>{authUser={id:'outsider',user_metadata:{full_name:'Alex'}};memberProfile={id:'outsider',role:'reader'};renderAllStoryComments();});
  assert.equal(await page.locator('#storyCommentList .comment-more').count(),0);
  await page.evaluate(async()=>{await deleteCommentById('story_1','comment-1');});assert.equal(deletes,2);
  await page.evaluate(()=>{authUser={id:'reader-user'};memberProfile={id:'reader-user',role:'reader'};renderAllStoryComments();});
  assert(await page.locator('#storyCommentList .comment-more').count()>0);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('comment notification includes actor and story title using the existing comment type',async()=>{
 const page=await feedPage(0);try{assert.equal(await page.evaluate(()=>notifText({type:'comment',story_id:1})),'đã bình luận về Truyện thử nghiệm.');assert.equal(await page.evaluate(()=>notifText({type:'reply',story_id:1})),'đã trả lời bình luận của bạn.');assert.deepEqual(page.errors,[]);}finally{await page.close();}
});
