const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');before(startBrowser);after(stopBrowser);
test('all requested examples use K/M with at most two decimals and no trailing zeros',async()=>{
 const page=await feedPage(0);try{
  const examples=[[0,'0'],[58,'58'],[999,'999'],[1000,'1K'],[1050,'1.05K'],[5290,'5.29K'],[10001,'10K'],[12800,'12.8K'],[33900,'33.9K'],[75700,'75.7K'],[121000,'121K'],[485000,'485K'],[649002,'649K'],[1000000,'1M'],[1270000,'1.27M'],[1610001,'1.61M'],[4550021,'4.55M']];
  assert.deepEqual(await page.evaluate(rows=>rows.map(([n])=>formatStoryStat(n)),examples),examples.map(([,v])=>v));assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('all story displays and DOM refresh format only presentation; chapter/comment count stays integer; numeric sort unchanged',async()=>{
 const traffic=[];const page=await feedPage(0,{onRequest:u=>traffic.push(u)});try{
  const initialRequests=traffic.length;
  await page.evaluate(()=>{const s=stories[0];s.views=1270000;s.baselineViews=1270000;s.baselineLikes=5290;chapterLikes['1_0']=1001;openStory(1);saved=[1];render();renderSaved();renderProfileStoryShelf('saved');currentStory=s;currentChapter=0;renderChapterHeart()});
  const viewSelectors=['#stories .stat:first-child','#introStats .stat:first-child','#saved .stat:first-child','.profile-story-stats span:first-child'];
  const heartSelectors=['#stories .stat:nth-child(2)','#introStats .stat:nth-child(2)','#saved .stat:nth-child(2)','.profile-story-stats span:nth-child(2)'];
  for(const sel of viewSelectors)assert.equal((await page.locator(sel).textContent()).trim(),'1.27M');
  for(const sel of heartSelectors)assert.equal((await page.locator(sel).textContent()).trim(),'6.29K');
  assert.equal((await page.locator('#chapterHeartRow button span').textContent()).trim(),'1001');
  assert.equal((await page.locator('#introStats .stat:nth-child(3)').textContent()).trim(),'7');
  await page.evaluate(()=>{applyStoryViewCount(stories[0],4550021);chapterLikes['1_0']=0;refreshStoryHeartStats(stories[0]);renderChapterHeart()});
  for(const sel of viewSelectors)assert.equal((await page.locator(sel).textContent()).trim(),'4.55M');
  for(const sel of heartSelectors)assert.equal((await page.locator(sel).textContent()).trim(),'5.29K');
  assert.deepEqual(await page.evaluate(()=>({views:stories[0].views,baseline:stories[0].baselineLikes,likes:storyLikeTotal(stories[0])})),{views:4550021,baseline:5290,likes:5290});
  const ordered=await page.evaluate(()=>{stories[0].views=10001;stories.push({...stories[0],id:2,title:'Other',views:10004});storyFilter.views='views_desc';render();return [...document.querySelectorAll('#stories .story-card')].map(el=>({id:el.getAttribute('onclick'),display:el.querySelector('.stat').textContent.trim()}))});
  assert.deepEqual(ordered,[{id:'openStory(2)',display:'10K'},{id:'openStory(1)',display:'10K'}]);
  assert.equal(traffic.length,initialRequests,'Formatting/rendering must add no request');assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
