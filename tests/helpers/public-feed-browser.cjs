const fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
let server, browser, base, sdk;
const root = path.resolve(__dirname, '../..');
async function startBrowser() {
  sdk = execFileSync('curl', ['--fail', '--silent', '--show-error', '--max-time', '20', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2']);
  server = http.createServer((req, res) => {
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(/^\/assets\/image-[a-f0-9]{12}\.png$/.test(pathname)){
      res.setHeader('Content-Type','image/png');
      res.end(fs.readFileSync(path.join(root,pathname)));return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(process.env.HOME_FEED_HTML || path.join(root, 'index.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
}
async function stopBrowser() { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); }
async function feedPage(readerReviewCount, options = {}) {
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
  Object.assign(fixtures,options.fixtures||{});
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: sdk }));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, route => {
    const url = new URL(route.request().url());
    options.onRequest?.(url);
    const table = url.pathname.split('/').pop();
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(fixtures[table] || []) });
  });
  await page.route('**/api/gate-check', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  if(options.initScript)await page.addInitScript(options.initScript);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Object.values(comments).flat().length === 7);
  return page;
}

module.exports={startBrowser,stopBrowser,feedPage};
