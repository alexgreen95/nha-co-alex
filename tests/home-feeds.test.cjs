// Cloud regression: node --test tests/home-feeds.test.cjs
// Supabase rows are synthetic fixtures; no production data is written.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage:legacyFeedPage}=require('./helpers/public-feed-browser.cjs');
const feedPage=(n,options={})=>legacyFeedPage(n,{canonicalComments:true,...options});
before(startBrowser);after(stopBrowser);

test('anonymous homepage shows all seven cloud comments via Xem thêm', async () => {
  const page = await feedPage(0);
  try {
    assert.equal(await page.evaluate(() => authUser), null);
    assert.equal(await page.evaluate(() => storyCommentCount(stories[0])), 7);
    await page.locator('[data-home-tab="commentsPanel"]').click();
    assert.equal(await page.locator('#commentsPanel .home-comment-card').count(), 6);
    assert.match(await page.locator('#commentsPanel .home-comment-card').first().textContent(), /Bình luận số 7/);
    await page.locator('#commentsPanel .home-feed-list-more').click();
    await page.waitForFunction(()=>!commentActivity.state.home.loading&&commentActivity.state.home.ids.length===7);
    assert.equal(await page.locator('#commentsPanel .home-comment-card').count(), 7);
    assert.equal(await page.locator('#commentsPanel .home-feed-list-more').count(), 0);
    await page.locator('[data-home-tab="reviewsPanel"]').click();
    assert.equal(await page.locator('#reviewsPanel .home-review-card').count(), 0);
    assert.match(await page.locator('#reviewsPanel').textContent(), /Chưa có review nào/);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
test('latest reviews excludes admin and paginates reader reviews', async () => {
  const page = await feedPage(7);
  try {
    await page.locator('[data-home-tab="reviewsPanel"]').click();
    assert.equal(await page.locator('#reviewsPanel .home-review-card').count(), 6);
    assert(!/Review quản trị/.test(await page.locator('#reviewsPanel').textContent()));
    await page.locator('#reviewsPanel .home-feed-list-more').click();
    assert.equal(await page.locator('#reviewsPanel .home-review-card').count(), 7);
    assert(!/Review quản trị/.test(await page.locator('#reviewsPanel').textContent()));
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('homepage comment opens its source only through its location link and collapses anywhere', async () => {
  const page=await feedPage(0);
  try {
    await page.locator('[data-home-tab="commentsPanel"]').click();
    const card=page.locator('#commentsPanel .home-comment-card').first();
    const initialUrl=page.url();
    await card.locator('.activity-clamp').click();
    await card.locator('.community-head strong').click();
    assert.equal(page.url(),initialUrl);
    await card.locator('.activity-clamp').evaluate(el=>{
      el.textContent='Bình luận dài để đọc đầy đủ rồi thu gọn. '.repeat(90);
      const mention=document.createElement('a');mention.href='/user/reader';mention.dataset.userProfile='reader';mention.textContent='Bạn đọc';el.prepend(mention);
    });
    const more=card.locator('.activity-more');
    await more.waitFor({state:'visible'});
    for(const target of ['.activity-clamp','.community-head strong','.community-avatar','.activity-clamp a']){
      await more.click();
      assert(await card.locator('.activity-clamp').evaluate(el=>el.classList.contains('expanded')));
      await card.locator(target).click();
      assert(!(await card.locator('.activity-clamp').evaluate(el=>el.classList.contains('expanded'))));
      assert.equal(page.url(),initialUrl);
      assert(await more.isVisible());
    }
    await more.click();
    await card.locator('[data-comment-location]').click();
    await page.waitForFunction(()=>!document.getElementById('storyIntro').classList.contains('hidden'));
    assert(await page.locator('#introComments').isVisible());
    assert.equal(await page.locator('.intro-tabs button').count(),3);
    assert.equal(await page.locator('#introComments.intro-pane').count(),0);
    assert.notEqual(page.url(),initialUrl);
    await page.waitForFunction(()=>document.querySelector('#storyCommentList .comment-item[data-comment-id="7"]')?.classList.contains('jump-flash'));
    assert.equal(await page.locator('#storyCommentList .comment-item[data-comment-id="7"]').count(),1,'Home location resolves and focuses the exact legacy-activity source');
    assert.deepEqual(page.errors,[]);
  } finally {await page.close();}
});

test('replies run oldest to newest with pagination while roots remain newest first',async()=>{
 const page=await feedPage(0);
 try{
  for(const surface of ['story','chapter','paragraph']){
   const context={scope:surface,story_id:1,chapter_index:surface==='story'?null:0,paragraph_index:surface==='paragraph'?0:null,user_id:'reader-user'};
   const root={...context,id:'201',content:'Bình luận gốc cũ',created_at:'2026-10-09T08:00:00Z'},newer={...context,id:'202',content:'Bình luận gốc mới',created_at:'2026-10-09T09:00:00Z'};
   const replies=Array.from({length:8},(_,i)=>({...context,id:String(301+i),parent_id:i===7?'301':'201',content:'Phản hồi '+i,created_at:new Date(Date.UTC(2026,9,9,10,i)).toISOString()})).reverse();
   page.mockFixtures.comments=[newer,...replies,root];
   await page.evaluate(async surface=>{
    if(surface==='story'){openStory(1);showIntroTab('comments',document.querySelectorAll('.intro-tabs button')[3]);}
    else if(surface==='chapter'){await read(1,0);}
    else{toggleComments('1_0_0',true);}
    const d=scopedComments.descriptor(surface,surface==='paragraph'?'1_0_0':null);await scopedComments.roots(d,{force:true});scopedComments.refreshVisible();
   },surface);
   const container=page.locator(surface==='story'?'#storyCommentList':surface==='chapter'?'#chapterCommentsList':'#paragraphCommentPanelBody');
   const thread=container.locator('.comment-thread').filter({has:page.locator(':scope > .comment-item[data-comment-id="201"]')}).first();
   const ids=await container.locator('.comment-thread > .comment-item').evaluateAll(els=>els.map(el=>el.dataset.commentId));
   assert.equal(ids[0],'202',surface);
   await thread.locator('.comment-reply-toggle').click();
   await page.waitForFunction(sel=>document.querySelectorAll(sel+' .comment-replies .comment-item').length===6,surface==='story'?'#storyCommentList':surface==='chapter'?'#chapterCommentsList':'#paragraphCommentPanelBody');
   assert.deepEqual(await thread.locator('.comment-replies .comment-item').evaluateAll(els=>els.map(el=>el.dataset.commentId)),Array.from({length:6},(_,i)=>String(301+i)));
   await thread.locator('.comment-reply-more').click();
   await page.waitForFunction(sel=>document.querySelectorAll(sel+' .comment-replies .comment-item').length===8,surface==='story'?'#storyCommentList':surface==='chapter'?'#chapterCommentsList':'#paragraphCommentPanelBody');
   assert.deepEqual(await thread.locator('.comment-replies .comment-item').evaluateAll(els=>els.map(el=>el.dataset.commentId)),Array.from({length:8},(_,i)=>String(301+i)));
   await thread.locator('.comment-reply-toggle').click();
   assert.equal(await thread.locator('.comment-replies .comment-item').count(),0);
  }
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
