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
  page.mockFixtures=fixtures;
  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, async route => {
    const url = new URL(route.request().url());
    options.onRequest?.(url,route.request());
    const table = url.pathname.split('/').pop();
    let response=fixtures[table] || [];
    if(table.startsWith('nca_')&&!Object.hasOwn(fixtures,table)){
      const body=route.request().postDataJSON()||{},rows=fixtures.comments||[],likes=fixtures.comment_likes||[];
      if(table==='nca_story_comment_counts')response=[...new Set(body.p_story_ids)].filter(id=>fixtures.stories.some(s=>String(s.id)===String(id))).map(id=>({story_id:Number(id),comment_count:rows.filter(c=>String(c.story_id)===String(id)).length}));
      if(table==='nca_profile_comment_count')response=rows.filter(c=>c.user_id===body.p_user_id).length;
      if(table==='nca_chapter_comment_counts'){
        const context=rows.filter(c=>String(c.story_id)===String(body.p_story_id)&&c.chapter_index===body.p_chapter_index);
        response={story_id:Number(body.p_story_id),chapter_index:body.p_chapter_index,chapter_comment_count:context.filter(c=>c.scope==='chapter').length,paragraph_counts:[...new Set(body.p_paragraph_indices)].map(pi=>({paragraph_index:pi,comment_count:context.filter(c=>(c.scope==='paragraph'||c.scope==null)&&c.paragraph_index===pi).length}))};
      }
      if(table==='nca_comment_like_counts')response=[...new Set(body.p_comment_ids)].filter(id=>rows.some(c=>String(c.id)===String(id))).map(id=>({comment_id:Number(id),like_count:likes.filter(l=>String(l.comment_id)===String(id)).length}));
      if(table==='nca_my_comment_likes'){const uid=await page.evaluate(()=>authUser?.id);response=[...new Set(body.p_comment_ids)].filter(id=>likes.some(l=>String(l.comment_id)===String(id)&&l.user_id===uid)).map(Number)}
    }
    if(table==='chapter_likes'&&route.request().method()==='GET'){const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||response.length);response=response.slice(offset,offset+limit)}
    if(['nca_chapter_like_counts','nca_my_chapter_likes'].includes(table)&&!Object.hasOwn(fixtures,table)){
      const ids=[...new Set(route.request().postDataJSON().p_chapter_ids)],likes=fixtures.chapter_likes||[];
      if(table==='nca_chapter_like_counts')response=ids.filter(id=>fixtures.chapters.some(c=>Number(c.id)===id)).map(id=>({chapter_id:id,like_count:likes.filter(l=>Number(l.chapter_id)===id).length}));
      else{const uid=await page.evaluate(()=>authUser?.id);response=ids.filter(id=>likes.some(l=>Number(l.chapter_id)===id&&l.user_id===uid))}
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(response) });
  });
  await page.route('**/api/gate-check', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  if(options.initScript)await page.addInitScript(options.initScript);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Object.values(comments).flat().length === 7);
  return page;
}

// Core optimization regressions account for Step 5B reads separately.
function isCommentEnrichmentRpc(url){return ['nca_story_comment_counts','nca_chapter_comment_counts','nca_profile_comment_count','nca_comment_like_counts','nca_my_comment_likes'].includes(url.pathname.split('/').pop())}
module.exports={startBrowser,stopBrowser,feedPage,isCommentEnrichmentRpc};
