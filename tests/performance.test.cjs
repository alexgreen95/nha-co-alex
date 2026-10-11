const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage:legacyFeedPage}=require('./helpers/public-feed-browser.cjs');
const feedPage=(n,options={})=>legacyFeedPage(n,{canonicalComments:true,...options});
before(startBrowser);after(stopBrowser);
test('story and homepage settle without repeated layout measurement',async()=>{
 const page=await feedPage(7,{initScript:()=>{
  window.__layoutFrames=0;
  const raf=window.requestAnimationFrame;
  window.requestAnimationFrame=fn=>raf.call(window,time=>{window.__layoutFrames++;return fn(time)});
 }});
 try{
  for(const surface of ['story','home']){
   if(surface==='home')await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),page.evaluate(()=>goHome())]);
   else await page.evaluate(()=>{openStory(1);showIntroTab('comments',document.querySelectorAll('.intro-tabs button')[3]);});
   if(surface==='story'){
    await page.waitForFunction(()=>document.querySelector('#introComments .comment-bubble .story-comment-clamp'));
    const bubble=page.locator('#introComments .comment-bubble').first();
    await bubble.locator('.story-comment-clamp').evaluate(el=>el.textContent='Nội dung bình luận dài để kiểm tra nút xem thêm. '.repeat(80));
    const more=bubble.locator('.story-comment-more');
    await more.waitFor({state:'visible'});
    await more.click();
    assert(await bubble.locator('.story-comment-clamp').evaluate(el=>el.classList.contains('expanded')));
    await bubble.locator('.story-comment-clamp').click();
    assert(!(await bubble.locator('.story-comment-clamp').evaluate(el=>el.classList.contains('expanded'))));
   }
   await page.waitForLoadState('networkidle');
   await page.waitForFunction(()=>scopedComments.state.flights.size===0&&!commentStats.scheduled&&commentStats.flights.size===0&&!publicRefreshFlight&&!commentActivity.state.home.loading&&(commentActivity.state.home.ready||!!commentActivity.state.home.error));
   await page.waitForTimeout(500);
   await page.evaluate(()=>window.__layoutFrames=0);
   await page.waitForTimeout(600);
   const frames=await page.evaluate(()=>window.__layoutFrames);assert(frames<=3,`${surface} should not continuously measure its own clones: ${frames} frames`);
  }
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
