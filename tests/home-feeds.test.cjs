// Cloud regression: node --test tests/home-feeds.test.cjs
// Supabase rows are synthetic fixtures; no production data is written.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
let server, browser, base, sdk;
const root = path.resolve(__dirname, '..');
before(async () => {
  sdk = execFileSync('curl', ['--fail', '--silent', '--show-error', '--max-time', '20', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2']);
  server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(process.env.HOME_FEED_HTML || path.join(root, 'index.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function feedPage(readerReviewCount) {
  const page = await browser.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  const timestamp = i => new Date(Date.UTC(2026, 9, 9, 10, i)).toISOString();
  const fixtures = {
    stories: [{ id: 1, title: 'Truyện thử nghiệm', author: 'Alex', published: true, status: 'ongoing' }],
    chapters: [{ id: 1, story_id: 1, title: 'Chương đầu', chapter_number: 1, published: true }],
    profiles: [{ id: 'admin-user', display_name: 'Alex', role: 'admin' }, { id: 'reader-user', display_name: 'Bạn đọc', role: 'member' }],
    comments: Array.from({ length: 7 }, (_, i) => ({ id: 'comment-' + i, user_id: 'reader-user', content: 'Bình luận số ' + (i + 1), scope: 'story', story_id: 1, created_at: timestamp(i) })),
    reviews: [
      ...Array.from({ length: 2 }, (_, i) => ({ id: 'admin-review-' + i, user_id: 'admin-user', story_id: 1, content: 'Review quản trị', created_at: timestamp(i) })),
      ...Array.from({ length: readerReviewCount }, (_, i) => ({ id: 'reader-review-' + i, user_id: 'reader-user', story_id: 1, content: 'Review người đọc ' + (i + 1), created_at: timestamp(i + 2) })),
    ],
  };
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: sdk }));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, route => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(fixtures[table] || []) });
  });
  await page.route('**/api/gate-check', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Object.values(comments).flat().length === 7);
  return page;
}
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
