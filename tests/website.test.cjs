// Run with: node --test tests/website.test.cjs
// Uses the cloud machine's Playwright/Chromium. Supabase network responses are
// fixtures; these regressions do not claim to validate production OAuth or RLS.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let server, browser, base, sdk;
const publicProfiles = [{ id: 'other-user', display_name: 'Tuệ Anh', avatar_url: '', bio: 'Thích đọc truyện.' }];

before(async () => {
  // curl preserves TLS verification with the environment's installed CA store.
  sdk = execFileSync('curl', ['--fail', '--silent', '--show-error', '--max-time', '20', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2']);
  const handlers = {
    '/api/gate-check': require('../api/gate-check'),
    '/api/gate-login': require('../api/gate-login'),
  };
  server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (handlers[pathname]) {
      let body = ''; for await (const chunk of req) body += chunk;
      req.body = body ? JSON.parse(body) : {};
      res.status = code => { res.statusCode = code; return res; };
      res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
      await handlers[pathname](req, res); return;
    }
    const rewrites = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'))).rewrites;
    const rewritten = rewrites.some(r => {
      const prefix = r.source.split('/:')[0];
      return pathname === prefix || pathname.startsWith(prefix + '/');
    });
    const file = pathname === '/' || rewritten ? 'index.html' : pathname.slice(1);
    if (!['index.html', 'alex-banner.jpg'].includes(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : 'image/jpeg');
    res.end(fs.readFileSync(path.join(root, file)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function pageAt(route = '/') {
  const page = await browser.newPage();
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
  await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: sdk }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://*.supabase.co/**', r => {
    const url = new URL(r.request().url());
    let data = [];
    if (url.pathname.endsWith('/profiles')) {
      data = publicProfiles;
      if (url.searchParams.has('id')) data = publicProfiles.find(p => 'eq.' + p.id === url.searchParams.get('id')) || null;
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  // The password gate is exercised by onboarding's API smoke separately.
  await page.route('**/api/gate-check', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto(base + route, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#stories .story-card'));
  return page;
}
async function loginFixture(page) {
  await page.evaluate(() => {
    authUser = { id: 'self-user', email: 'alex@example.test', user_metadata: { full_name: 'Alex' } };
    memberProfile = { id: 'self-user', display_name: 'Alex', avatar_url: '', bio: 'Góc của Alex.' };
    updateAuthUI();
  });
}
async function visiblePages(page) {
  return page.locator('main:not(.hidden)').evaluateAll(elements => elements.map(el => el.id));
}

test('routing: profile isolates content, handles public users and Back/Forward', async () => {
  const page = await pageAt();
  try {
    await loginFixture(page);
    await page.evaluate(() => openStory(stories[0].id));
    const storyRoute = new URL(page.url()).pathname;
    await page.evaluate(() => startFromIntro());
    const chapterRoute = new URL(page.url()).pathname;
    await page.evaluate(() => openProfile());
    assert.equal(new URL(page.url()).pathname, '/user/alex');
    assert.deepEqual(await visiblePages(page), ['profilePage']);
    assert.equal(await page.evaluate(() => document.body.classList.contains('reading')), false);
    await page.goBack();
    assert.equal(new URL(page.url()).pathname, chapterRoute);
    assert.deepEqual(await visiblePages(page), ['reader']);
    await page.goBack();
    assert.equal(new URL(page.url()).pathname, storyRoute);
    assert.deepEqual(await visiblePages(page), ['storyIntro']);
    await page.goForward(); await page.goForward();
    assert.deepEqual(await visiblePages(page), ['profilePage']);
    await page.evaluate(() => openUserProfile('tue-anh'));
    await page.waitForFunction(() => document.getElementById('profileName').textContent === 'Tuệ Anh');
    assert.equal(await page.locator('#profileEmail').textContent(), '');
    assert.equal(await page.locator('.profile-edit-top').isVisible(), false);
    await page.evaluate(() => openProfile());
    assert.equal(new URL(page.url()).pathname, '/user/alex');
    assert.equal(await page.locator('.profile-edit-top').isVisible(), true);
    await page.goto(base + '/user/tue-anh', { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('profileName').textContent === 'Tuệ Anh');
    assert.deepEqual(await visiblePages(page), ['profilePage']);
    await page.goto(base + '/user/' + encodeURIComponent('Tuệ Anh'), { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('profileName').textContent === 'Tuệ Anh');
    assert.equal(new URL(page.url()).pathname, '/user/tue-anh', 'canonical username');
    let release, requested;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { requested = resolve; });
    await page.route('https://*.supabase.co/rest/v1/profiles*', async route => {
      requested(); await gate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'slow-user', display_name: 'Hoàng Nam', bio: 'Hồ sơ đến muộn.' }]) });
    });
    await page.evaluate(() => { window.pendingProfile = openUserProfile('hoang-nam'); });
    await started;
    await page.evaluate(() => show('home'));
    release(); await page.evaluate(() => window.pendingProfile);
    assert.deepEqual(await visiblePages(page), ['home'], 'late profile response cannot restore profile after leaving');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('cards: equal heights, two title lines, centered 3:4 covers and aligned actions', async () => {
  const page = await pageAt();
  try {
    await page.evaluate(() => {
      stories[0].title = 'Tên ngắn';
      stories[1].title = 'Một cái tên truyện dài để kiểm tra hai dòng và phần bị cắt';
      stories[2].title = 'Tên dài '.repeat(30);
      render();
    });
    for (const width of [1280, 820, 640, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await page.locator('#stories .story-card').evaluateAll(cards => cards.map(card => {
        const bounds = el => { const r = el.getBoundingClientRect(); return { top: r.top, height: r.height, width: r.width, bottom: r.bottom }; };
        return { card: bounds(card), title: bounds(card.querySelector('h3')), cover: bounds(card.querySelector('.story-cover')), actions: bounds(card.querySelector('.story-actions')) };
      }));
      for (const g of geometry) {
        assert.equal(g.card.height, 220, 'card height at ' + width);
        assert(Math.abs(g.title.height - 37.5) < 1, 'reserve two title lines');
        assert(Math.abs(g.cover.width / g.cover.height - 0.75) < 0.01, '3:4 cover');
        assert(Math.abs(g.cover.top + g.cover.height / 2 - g.card.top - g.card.height / 2) < 1, 'center cover');
        assert(Math.abs(g.actions.top - g.card.top - (geometry[0].actions.top - geometry[0].card.top)) < 1, 'aligned actions');
        assert(g.actions.bottom < g.card.bottom, 'actions fit within card');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow at ' + width);
    }
    await page.locator('#stories .story-actions button').nth(1).click();
    assert.match(await page.locator('#stories .story-actions button').nth(1).textContent(), /Đã lưu/);
    assert.equal(new URL(page.url()).pathname, '/', 'saving does not open story');
    await page.locator('#stories .story-actions button').first().click();
    assert.deepEqual(await visiblePages(page), ['storyIntro']);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('comments: bubbles, likes, two display levels, persistence and author profile links', async () => {
  const page = await pageAt();
  try {
    await loginFixture(page);
    await page.evaluate(() => {
      comments['chapter_1_0'] = [{ name: 'Tuệ Anh', text: 'Bình luận cũ vẫn còn.' }];
      read(1, 0);
    });
    assert.equal(await page.locator('#chapterCommentsList .comment-bubble').count(), 1);
    assert.equal(await page.locator('#chapterCommentsList .comment-avatar').count(), 1);
    assert.equal(await page.locator('#chapterCommentsList .comment-text').textContent(), 'Bình luận cũ vẫn còn.');
    assert.match(await page.locator('#chapterCommentsList .comment-time').textContent(), /Không rõ thời gian/);
    const input = page.locator('#chapterCommentInput');
    await input.fill('Nội dung <script> & emoji 💗'); await input.press('Enter');
    assert.equal(await page.locator('#chapterCommentsList .comment-bubble').count(), 2);
    assert.equal(await page.locator('#chapterCommentsList .comment-text').last().textContent(), 'Nội dung <script> & emoji 💗');
    assert.equal(await page.locator('#chapterCommentsList time[datetime]').count(), 1);
    await input.fill('Bản nháp đang viết');
    const firstThread = page.locator('#chapterCommentsList .comment-thread').first();
    await firstThread.locator('[data-comment-action="like"]').click();
    assert.equal(await firstThread.locator('[data-comment-action="like"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await firstThread.locator('[data-comment-action="like"] span').textContent(), '1');
    assert.equal(await input.inputValue(), 'Bản nháp đang viết', 'liking preserves draft');
    await firstThread.locator('[data-comment-action="like"]').click();
    assert.equal(await firstThread.locator('[data-comment-action="like"] span').textContent(), '0');
    await firstThread.locator('[data-comment-action="reply"]').click();
    await page.locator('#replyCommentInput').fill('Trả lời cấp đầu'); await page.locator('#replyCommentInput').press('Enter');
    assert.equal(await firstThread.locator('.comment-replies .comment-item').count(), 1);
    await firstThread.locator('.comment-replies [data-comment-action="reply"]').click();
    await page.locator('#replyCommentInput').fill('Trả lời tiếp cho reply'); await page.locator('#replyCommentInput').press('Enter');
    assert.equal(await firstThread.locator('.comment-replies .comment-item').count(), 2);
    assert.equal(await firstThread.locator('.comment-replies .comment-replies').count(), 0, 'no third display level');
    assert.match(await firstThread.locator('.comment-reply-to').last().textContent(), /Alex/);
    await page.evaluate(() => openParagraphComposer('1_0_0'));
    await page.locator('#panelCommentInput').fill('Bình luận đoạn đầu'); await page.locator('#panelCommentInput').press('Enter');
    assert.equal(await page.locator('#paragraphCommentPanel .comment-bubble').count(), 1);
    assert.match(await page.locator('#para_1_0_0 .comment-btn').textContent(), /1/);
    await firstThread.locator('.comment-author').first().click();
    assert.equal(new URL(page.url()).pathname, '/user/tue-anh');
    assert.deepEqual(await visiblePages(page), ['profilePage']);
    assert.equal(await page.locator('#paragraphCommentPanel').evaluate(el => el.classList.contains('open')), false);
    await page.goBack();
    assert.deepEqual(await visiblePages(page), ['reader']);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('#chapterCommentsList .comment-item').count(), 5, 'comments and replies persisted');
    await page.evaluate(() => openStory(1));
    await page.locator('.intro-tabs button').last().click();
    assert.equal(await page.locator('#introComments .comment-item').count(), 5);
    await page.evaluate(() => show('home'));
    await page.locator('[data-home-tab="commentsPanel"]').click();
    assert.equal(await page.locator('#commentsPanel .comment-item').count(), 5);
    await page.locator('#commentsPanel .comment-avatar').first().click();
    assert(new URL(page.url()).pathname.startsWith('/user/'));
    assert.deepEqual(await visiblePages(page), ['profilePage']);
    await loginFixture(page);
    await page.evaluate(() => read(1, 0));
    await page.locator('#chapterCommentsList .comment-thread').first().locator('[data-comment-action="reply"]').first().click();
    await page.locator('#replyCommentInput').fill('Bản nháp ở chương');
    await page.evaluate(() => show('home'));
    await page.locator('[data-home-tab="commentsPanel"]').click();
    await page.locator('#commentsPanel [data-comment-action="reply"]').first().click();
    assert.equal(await page.locator('#replyCommentInput').count(), 1, 'one composer after switching surfaces');
    assert.equal(await page.locator('#replyCommentInput').isVisible(), true);
    await page.locator('#replyCommentInput').fill('Trả lời từ homepage'); await page.locator('#replyCommentInput').press('Enter');
    assert.equal(await page.locator('#commentsPanel .comment-item').count(), 6);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('emoji and themes: visible grid, caret insertion, dismissal and existing theme persistence', async () => {
  const page = await pageAt();
  try {
    await loginFixture(page);
    await page.evaluate(() => read(1, 0));
    const input = page.locator('#chapterCommentInput');
    await input.fill('Xin chào');
    await input.evaluate(el => { el.focus(); el.setSelectionRange(3, 3); });
    const trigger = page.locator('#chapterCommentComposer .emoji-trigger');
    await trigger.click();
    const popup = page.locator('#emojiPopup');
    assert.equal(await popup.isVisible(), true);
    assert.equal(await popup.locator('button').count(), 61);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    const layout = await popup.evaluate(el => {
      const r = el.getBoundingClientRect(), style = getComputedStyle(el);
      const first = el.querySelector('button').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, columns: style.gridTemplateColumns.split(' ').length, firstHeight: first.height };
    });
    assert.equal(layout.columns, 7);
    assert.equal(layout.firstHeight, 36);
    assert(layout.height <= 300 && layout.height > 200);
    assert(layout.top >= 0 && layout.left >= 0 && layout.right <= 1280 && layout.bottom <= 720);
    if (process.env.WEBSITE_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.WEBSITE_SCREENSHOT_DIR, { recursive: true });
      await popup.screenshot({ path: path.join(process.env.WEBSITE_SCREENSHOT_DIR, 'emoji.png') });
    }
    await popup.locator('[data-emoji="💗"]').click();
    assert.equal(await input.inputValue(), 'Xin💗 chào');
    assert.equal(await input.evaluate(el => el.selectionStart), 5);
    await page.keyboard.press('Escape');
    assert.equal(await popup.isVisible(), false);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await input.fill('Bình luận dùng để kiểm tra theme'); await input.press('Enter');
    for (const themeName of ['light', 'smoky', 'dustyrose', 'mistblue', 'pastel', 'night', 'purplenight']) {
      await page.evaluate(t => setTheme(t), themeName);
      await trigger.click();
      const colors = await page.evaluate(() => {
        const probe = document.createElement('span'); document.body.appendChild(probe);
        probe.style.background = 'var(--card)'; const card = getComputedStyle(probe).backgroundColor;
        probe.style.background = 'var(--soft)'; const soft = getComputedStyle(probe).backgroundColor; probe.remove();
        return { popup: getComputedStyle(document.getElementById('emojiPopup')).backgroundColor, bubble: getComputedStyle(document.querySelector('#chapterCommentsList .comment-bubble')).backgroundColor, card, soft };
      });
      assert.equal(colors.popup, colors.card, themeName + ' picker theme');
      assert.equal(colors.bubble, colors.soft, themeName + ' comment theme');
      await page.keyboard.press('Escape');
    }
    await page.evaluate(() => openParagraphComposer('1_0_0'));
    const panelInput = page.locator('#panelCommentInput');
    await panelInput.fill('Đoạn');
    await page.locator('#paragraphCommentPanel .emoji-trigger').click();
    await popup.locator('[data-emoji="🌷"]').click();
    assert.equal(await panelInput.inputValue(), 'Đoạn🌷');
    assert.equal(await page.locator('#paragraphCommentPanel').isVisible(), true, 'emoji selection keeps comment panel open');
    assert.equal(await popup.isVisible(), true);
    await page.keyboard.press('Escape');
    await page.evaluate(() => closeParagraphComments());
    await page.locator('#chapterCommentsList [data-comment-action="reply"]').click();
    await page.locator('.reply-compose .emoji-trigger').click();
    await popup.locator('[data-emoji="✨"]').click();
    assert.equal(await page.locator('#replyCommentInput').inputValue(), '✨');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await trigger.isVisible(), false, 'keep native emoji keyboard behavior on mobile');
    const replyBounds = await page.locator('.reply-compose').boundingBox();
    if (process.env.WEBSITE_SCREENSHOT_DIR) await page.locator('.chapter-comments').screenshot({ path: path.join(process.env.WEBSITE_SCREENSHOT_DIR, 'comments-mobile.png') });
    assert(replyBounds.x + replyBounds.width <= 390, 'reply composer fits mobile viewport: ' + JSON.stringify(replyBounds));
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.evaluate(() => localStorage.getItem('reader_theme')), 'purplenight');
    assert.equal(await page.evaluate(() => document.body.classList.contains('purplenight')), true);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
