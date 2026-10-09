const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const people=[{id:'user-alex',display_name:'Alex',avatar_url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'},{id:'user-alexa',display_name:'Alexa'},{id:'user-accent',display_name:'Álex'},{id:'user-alice',display_name:'Alice'},{id:'reader-user',display_name:'Bạn đọc'}];
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
async function setup(){
 const page=await feedPage(0),reads=[],writes=[];
 await page.route('**/rest/v1/profiles**',route=>{
  const url=new URL(route.request().url());reads.push(url);let rows=people;
  const filter=url.searchParams.get('display_name');
  if(filter){assert(filter.startsWith('imatch.'));const re=new RegExp(filter.slice(7).replaceAll('[:alnum:]','\\p{L}\\p{N}'),'iu');rows=rows.filter(p=>re.test(p.display_name));}
  if(url.searchParams.has('limit'))rows=rows.slice(0,Number(url.searchParams.get('limit')));
  return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(rows)});
 });
 await page.route('**/rest/v1/rpc/nca_comment_notifications_enabled',r=>r.fulfill({status:200,headers,contentType:'application/json',body:'true'}));
 await page.route('**/rest/v1/comment_mentions**',r=>{if(r.request().method()==='POST')writes.push(r.request().postDataJSON());return r.fulfill({status:200,headers,contentType:'application/json',body:'[]'})});
 await page.evaluate(()=>{authUser={id:'reader-user'};memberProfile={id:'reader-user',display_name:'Bạn đọc',role:'reader'};openStory(1);showIntroTab('comments');});
 return {page,reads,writes};
}
const input=page=>page.locator('#storyCommentInput'),popup=page=>page.locator('#commentMentionSuggestions');
async function choose(page,id){await page.locator(`[data-mention-user-id="${id}"]`).click();}
test('immediate @ popup, bounded case/accent-insensitive search, mouse/keyboard, Escape and caret replacement',async()=>{
 const {page,reads}=await setup();try{
  await input(page).fill('@');await popup(page).waitFor({state:'visible'});await page.waitForFunction(()=>mentionActive?.rows.length===5);
  assert.equal(await popup(page).locator('.mention-option-avatar').count(),5);
  await input(page).fill('@AL');await page.waitForFunction(()=>mentionActive?.query==='al'&&mentionActive.rows.length===4);
  assert(reads.filter(u=>u.searchParams.has('limit')).every(u=>u.searchParams.get('limit')==='8'&&u.searchParams.get('select')==='id,display_name,avatar_url'));
  await choose(page,'user-accent');assert.equal(await input(page).inputValue(),'@alex ');
  assert.deepEqual(await page.evaluate(()=>selectedCommentMentions(document.getElementById('storyCommentInput')).map(t=>t.id)),['user-accent']);
  await input(page).fill('@ali');await page.waitForFunction(()=>mentionActive?.rows.length===1);await input(page).press('Tab');assert.equal(await input(page).inputValue(),'@alice ');
  await input(page).fill('@al');await page.waitForFunction(()=>mentionActive?.rows.length===4);await input(page).press('ArrowUp');assert.equal(await page.evaluate(()=>mentionActive.index),3);await input(page).press('ArrowDown');await input(page).press('ArrowDown');await input(page).press('Enter');assert.equal(await input(page).inputValue(),'@alexa ');
  await input(page).fill('@al');await page.waitForFunction(()=>mentionActive?.rows.length===4);await input(page).press('Escape');await popup(page).waitFor({state:'hidden'});
  await input(page).fill('Trước @aliXYZ sau');await input(page).evaluate(el=>{el.focus();el.setSelectionRange(10,10);updateMentionPopup(el)});await page.waitForFunction(()=>mentionActive?.rows.length===1);await input(page).press('Enter');assert.equal(await input(page).inputValue(),'Trước @alice sau');assert.equal(await input(page).evaluate(el=>el.selectionStart),12);
  await input(page).fill('email@al');await popup(page).waitFor({state:'hidden'});
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('multiple selected IDs survive rerender; removed/edited tokens and manually typed usernames never send ghost mentions',async()=>{
 const {page,writes}=await setup();try{
  await input(page).fill('  @al');await page.waitForFunction(()=>mentionActive?.rows.length===4);await choose(page,'user-alex');
  await input(page).pressSequentially('@ali');await page.waitForFunction(()=>mentionActive?.rows.length===1);await choose(page,'user-alice');
  await page.evaluate(()=>refreshCommentViews());assert.deepEqual(await page.evaluate(()=>selectedCommentMentions(document.getElementById('storyCommentInput')).map(t=>t.id)),['user-alex','user-alice']);
  await page.evaluate(async()=>{const el=document.getElementById('storyCommentInput');await saveCommentMentions(111,el.value.trim(),{story_id:1},selectedCommentMentions(el));});assert.deepEqual(writes.map(w=>w.mentioned_user_id),['user-alex','user-alice']);
  writes.length=0;
  await input(page).evaluate(el=>{el.setSelectionRange(2,7)});await input(page).press('Backspace');
  assert.deepEqual(await page.evaluate(()=>selectedCommentMentions(document.getElementById('storyCommentInput')).map(t=>t.id)),['user-alice']);
  await input(page).evaluate(el=>{const n=el.value.indexOf('@alice');el.setSelectionRange(n+3,n+3)});await input(page).press('x');
  assert.deepEqual(await page.evaluate(()=>selectedCommentMentions(document.getElementById('storyCommentInput'))),[]);
  await input(page).fill('@alex @alexa');await page.evaluate(async()=>{const el=document.getElementById('storyCommentInput');await saveCommentMentions(112,el.value,{story_id:1},selectedCommentMentions(el));});assert.deepEqual(writes,[]);
  await input(page).fill('@al');await page.waitForFunction(()=>mentionActive?.rows.length===4);await choose(page,'user-accent');
  await input(page).evaluate(el=>{el.setSelectionRange(0,5);el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'insertFromPaste',data:'@alex'}));el.value='@alex ';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.deepEqual(await page.evaluate(()=>selectedCommentMentions(document.getElementById('storyCommentInput'))),[]);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('story/chapter/paragraph/reply submit explicit selected user IDs and preserve direct/nested reply IDs',async()=>{
 const {page,writes}=await setup(),posts=[];try{
  await page.route('**/rest/v1/comments**',route=>{
   if(route.request().method()==='POST'){const row=route.request().postDataJSON();posts.push(row);return route.fulfill({status:201,headers,contentType:'application/json',body:JSON.stringify({...row,id:1000+posts.length})})}
   return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(Array.from({length:7},(_,i)=>({id:'comment-'+i,user_id:'reader-user',content:'Text',scope:'story',story_id:1,created_at:'2026-10-09T10:00:00Z'})))});
  });
  await input(page).fill('@al');await page.waitForFunction(()=>mentionActive?.rows.length===4);await choose(page,'user-accent');await page.evaluate(async()=>submitStoryComment({preventDefault(){}}));
  assert.equal(writes[0].mentioned_user_id,'user-accent');assert.equal(posts[0].scope,'story');
  await page.evaluate(async()=>{await read(1,0);});await page.locator('#chapterCommentInput').waitFor({state:'visible'});
  await page.locator('#chapterCommentInput').fill('@ali');await page.waitForFunction(()=>mentionActive?.rows.length===1);await page.locator('#chapterCommentInput').press('Enter');assert.equal(posts.length,1);await page.evaluate(async()=>addChapterComment());assert.equal(posts[1].scope,'chapter');assert.equal(writes[1].mentioned_user_id,'user-alice');
  await page.evaluate(()=>toggleComments('1_0_0',true));await page.locator('#panelCommentInput').fill('@al');await page.waitForFunction(()=>mentionActive?.rows.length===4);await choose(page,'user-alexa');await page.evaluate(async()=>addParaComment('1_0_0'));assert.equal(posts[2].scope,'paragraph');assert.equal(writes[2].mentioned_user_id,'user-alexa');
  await page.evaluate(()=>{closeParagraphComments();openStory(1);showIntroTab('comments');comments.story_1.push({id:'root',userId:'user-alex',name:'Alex',username:'alex',text:'Root',createdAt:'2026-10-09T15:00:00Z'},{id:'nested',parentId:'root',userId:'user-accent',name:'Álex',username:'alex',text:'Nested',createdAt:'2026-10-09T16:00:00Z'});beginCommentReply('story_1','nested','story');});
  await page.locator('#replyCommentInput').scrollIntoViewIfNeeded();await page.locator('#replyCommentInput').fill('@al');await page.waitForFunction(()=>mentionActive?.rows.length===4);await choose(page,'user-accent');await page.evaluate(async()=>submitCommentReply());assert.equal(posts[3].parent_id,'root');assert.equal(posts[3].reply_to_user_id,'user-accent');assert.equal(writes[3].mentioned_user_id,'user-accent');
  await page.evaluate(()=>{comments.story_1.push({id:'direct',userId:'user-alex',name:'Alex',text:'Direct',createdAt:'2026-10-09T15:00:00Z'});beginCommentReply('story_1','direct','story');});await page.locator('#replyCommentInput').fill('No selected mention');await page.evaluate(async()=>submitCommentReply());assert.equal(posts[4].reply_to_user_id,'user-alex');assert.equal(writes.length,4);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('mobile popup remains inside viewport and outside input; self mention stores exact ID without a frontend notification',async()=>{
 const {page,writes}=await setup();try{
  await page.setViewportSize({width:390,height:844});await input(page).scrollIntoViewIfNeeded();await input(page).fill('@ban');await page.waitForFunction(()=>mentionActive?.rows.length===1);
  const box=await popup(page).boundingBox(),field=await input(page).boundingBox();assert(box.x>=0&&box.x+box.width<=390);assert(box.y+box.height<=field.y||box.y>=field.y+field.height);
  await page.screenshot({path:'/tmp/nca-mention-mobile.png'});
  await choose(page,'reader-user');await page.evaluate(async()=>{const el=document.getElementById('storyCommentInput');await saveCommentMentions(333,el.value.trim(),{story_id:1},selectedCommentMentions(el));});assert.deepEqual(writes,[{comment_id:333,mentioned_user_id:'reader-user'}]);
  await input(page).fill('@al');await page.waitForFunction(()=>mentionActive?.rows.length===4);await input(page).press('Home');await popup(page).waitFor({state:'hidden'});
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('saved mention rendering uses stored recipient IDs and leaves unselected username text alone',async()=>{
 const {page,reads}=await setup();try{
  await page.route('**/rest/v1/comment_mentions**',r=>r.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify([{comment_id:'comment-0',mentioned_user_id:'user-accent'}])}));
  await page.route('**/rest/v1/comments**',r=>r.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(Array.from({length:7},(_,i)=>({id:'comment-'+i,user_id:'reader-user',content:i===0?'Saved @alex':i===1?'Typed @alexa':'Text',scope:'story',story_id:1,created_at:'2026-10-09T10:00:00Z'})))}));
  await page.evaluate(async()=>{await loadCloudComments()});
  assert.equal(await page.locator('#storyCommentList [data-comment-id="comment-0"] .comment-mention').textContent(),'Álex');
  assert.equal(await page.locator('#storyCommentList [data-comment-id="comment-1"] .comment-mention').count(),0);
  assert(reads.some(u=>u.searchParams.get('id')?.includes('user-accent')));
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
