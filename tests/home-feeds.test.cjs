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
