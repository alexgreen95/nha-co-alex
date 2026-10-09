// Cloud regression: node --test tests/home-feeds.test.cjs
// Supabase rows are synthetic fixtures; no production data is written.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
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
    await page.waitForFunction(()=>document.getElementById('introComments').classList.contains('active'));
    assert.notEqual(page.url(),initialUrl);
    assert.deepEqual(page.errors,[]);
  } finally {await page.close();}
});
