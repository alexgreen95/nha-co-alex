const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage:legacyFeedPage}=require('./helpers/public-feed-browser.cjs');
const feedPage=(n,options={})=>legacyFeedPage(n,{canonicalComments:true,...options});
before(startBrowser);after(stopBrowser);
test('role admin sees delete menus for others and successful root/reply deletion refreshes immediately',async()=>{
 const page=await feedPage(0);let rows=Array.from({length:7},(_,i)=>({id:String(i+1),user_id:'reader-user',content:'Bình luận '+i,scope:'story',story_id:1,created_at:new Date(Date.UTC(2026,9,9,10,i)).toISOString()}));
 rows.push({id:'101',parent_id:'1',user_id:'reader-user',content:'Trả lời',scope:'story',story_id:1,created_at:'2026-10-09T11:00:00Z'});
 rows.push({id:'102',parent_id:'101',user_id:'reader-user',content:'Nested cascade',scope:'story',story_id:1,created_at:'2026-10-09T12:00:00Z'},{id:'103',parent_id:'1',user_id:'reader-user',content:'Root cascade',scope:'story',story_id:1,created_at:'2026-10-09T13:00:00Z'});
 page.mockFixtures.comments=rows;
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};let deletes=0,globalGets=0;
 try{
  await page.route('**/rest/v1/comments**',route=>{
   const req=route.request(),url=new URL(req.url());
   if(req.method()==='DELETE'){deletes++;const id=url.searchParams.get('id').slice(3),deleted=rows.filter(r=>r.id===id);const removed=new Set([id]);let added;do{added=false;for(const row of rows)if(removed.has(row.parent_id)&&!removed.has(row.id)){removed.add(row.id);added=true}}while(added);rows=rows.filter(r=>!removed.has(r.id));page.mockFixtures.comments=rows;return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(deleted.map(r=>({id:r.id})))});}
   if(req.method()==='GET'&&!url.searchParams.has('id'))globalGets++;
   return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(rows)});
  });
  await page.route('**/rest/v1/profiles**',route=>{const url=new URL(route.request().url());let profiles=[{id:'admin-user',display_name:'Alex',role:'admin'},{id:'reader-user',display_name:'Bạn đọc',role:'reader'}];if(url.searchParams.get('id')?.startsWith('in.(')){const ids=url.searchParams.get('id').slice(4,-1).split(',');profiles=profiles.filter(p=>ids.includes(p.id));}if(url.searchParams.get('id')?.startsWith('eq.'))profiles=profiles.filter(p=>'eq.'+p.id===url.searchParams.get('id'));return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(profiles)});});
  await page.evaluate(async()=>{authUser={id:'admin-user'};await syncProfileV179(authUser);updateAuthUI();openStory(1);showIntroTab('comments',document.querySelectorAll('.intro-tabs button')[3]);await scopedComments.roots({surface:'story',story:'1',page:'1'},{force:true});renderAllStoryComments();});
  assert.equal(await page.evaluate(()=>memberProfile.role),'admin');
  await page.waitForFunction(()=>document.querySelector('#storyCommentList [data-comment-id="1"]'));
  const root=page.locator('#storyCommentList .comment-item[data-comment-id="1"]');
  assert.equal(await root.locator('.comment-more').count(),1);
  assert.equal(await root.locator('[data-comment-action="edit"]').count(),0);
  const initialGlobalGets=globalGets;page.on('dialog',dialog=>dialog.accept());
  await page.evaluate(async()=>{await scopedComments.thread('1',{force:true});await deleteCommentById('story_1','101');});
  assert(!rows.some(r=>['101','102'].includes(r.id)));assert(rows.some(r=>r.id==='1'));assert(rows.some(r=>r.id==='103'));
  await root.locator('.comment-more').click();await root.locator('[data-comment-action="delete"]').click();
  await root.waitFor({state:'detached'});
  assert(!rows.some(r=>['1','103'].includes(r.id)));assert.equal(deletes,2);assert.equal(globalGets,initialGlobalGets,'scoped deletion never requires global history reload');
  await page.evaluate(async()=>{authUser={id:'outsider',user_metadata:{full_name:'Alex'}};resetAuthAccount('outsider');memberProfile={id:'outsider',role:'reader'};updateAuthUI();renderAllStoryComments();await scopedComments.roots({surface:'story',story:'1',page:'1'},{force:true});renderAllStoryComments();});
  assert.equal(await page.locator('#storyCommentList .comment-more').count(),0);
  await page.evaluate(async()=>{await deleteCommentById('story_1','2');});assert.equal(deletes,2);
  await page.evaluate(async()=>{authUser={id:'reader-user'};resetAuthAccount('reader-user');memberProfile={id:'reader-user',role:'reader'};updateAuthUI();renderAllStoryComments();await scopedComments.roots({surface:'story',story:'1',page:'1'},{force:true});renderAllStoryComments();});
  assert(await page.locator('#storyCommentList .comment-more').count()>0);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('comment notification includes actor and story title using the existing comment type',async()=>{
 const page=await feedPage(0);try{assert.equal(await page.evaluate(()=>notifText({type:'comment',story_id:1})),'đã bình luận về Truyện thử nghiệm.');assert.equal(await page.evaluate(()=>notifText({type:'reply',story_id:1})),'đã trả lời bình luận của bạn.');assert.deepEqual(page.errors,[]);}finally{await page.close();}
});
