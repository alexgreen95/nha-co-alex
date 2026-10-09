const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
test('story and homepage settle without repeated layout measurement',async()=>{
 const page=await feedPage(7,{initScript:()=>{
  window.__layoutFrames=0;
  const raf=window.requestAnimationFrame;
  window.requestAnimationFrame=fn=>raf.call(window,time=>{window.__layoutFrames++;return fn(time)});
 }});
 try{
  for(const surface of ['story','home']){
   await page.evaluate(surface=>{if(surface==='story'){openStory(1);showIntroTab('comments',document.querySelectorAll('.intro-tabs button')[3]);}else{goHome();}},surface);
   if(surface==='story'){
    const bubble=page.locator('#introComments .comment-bubble').first();
    await bubble.locator('.story-comment-clamp').evaluate(el=>el.textContent='Nội dung bình luận dài để kiểm tra nút xem thêm. '.repeat(80));
    const more=bubble.locator('.story-comment-more');
    await more.waitFor({state:'visible'});
    await more.click();
    assert(await bubble.locator('.story-comment-clamp').evaluate(el=>el.classList.contains('expanded')));
    await bubble.locator('.story-comment-clamp').click();
    assert(!(await bubble.locator('.story-comment-clamp').evaluate(el=>el.classList.contains('expanded'))));
   }
   await page.waitForTimeout(500);
   await page.evaluate(()=>window.__layoutFrames=0);
   await page.waitForTimeout(600);
   assert((await page.evaluate(()=>window.__layoutFrames))<=3,`${surface} should not continuously measure its own clones`);
  }
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
