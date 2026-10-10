const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
test('mobile notification dropdown stays inside gutters; all filters and long text remain usable',async()=>{
 const requests=[],page=await feedPage(0,{onRequest:(url,req)=>{if(url.pathname.startsWith('/rest/v1/')&&req.method()!=='OPTIONS')requests.push(url.pathname)}}),geometry=[];fs.mkdirSync('/tmp/nca-notification-mobile',{recursive:true});
 try{
  await page.evaluate(async()=>{authUser={id:'reader-user',user_metadata:{full_name:'Alex'}};updateAuthUI();await loadNotifications();document.getElementById('notifPanel').classList.add('open');document.getElementById('notifList').innerHTML=Array.from({length:16},(_,i)=>`<div class="notif-item unread">Alex đã trả lời bình luận của bạn về một chương truyện có tiêu đề rất dài. ${'LongUnbrokenUsername'.repeat(6)} ${i}</div>`).join('')});
  await page.setViewportSize({width:1280,height:900});
  const desktop=await page.evaluate(()=>{const p=document.getElementById('notifPanel').getBoundingClientRect(),b=document.querySelector('.bell-btn').getBoundingClientRect();return {width:p.width,right:p.right,bellRight:b.right}});
  assert.equal(desktop.width,390);assert(Math.abs(desktop.right-desktop.bellRight)<1);requests.length=0;
  for(const width of [320,375,390,430])for(const theme of ['light','night','pastel']){
   await page.setViewportSize({width,height:844});await page.evaluate(theme=>setTheme(theme),theme);
   const g=await page.evaluate(()=>{
    const p=document.getElementById('notifPanel'),l=document.getElementById('notifList'),r=p.getBoundingClientRect(),v=visualViewport,h=document.querySelector('header').getBoundingClientRect();
    const bounds=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom}};
    return {panel:bounds(p),viewport:{left:v.offsetLeft,right:v.offsetLeft+v.width},header:bounds(document.querySelector('header')),pageWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,mark:bounds(p.querySelector('.notif-head button')),chips:[...p.querySelectorAll('.notif-filters button')].map(bounds),items:[...l.children].map(el=>({width:el.clientWidth,scroll:el.scrollWidth,...bounds(el)})),list:{height:l.clientHeight,scroll:l.scrollHeight,overflow:getComputedStyle(l).overflowY}};
   });
   assert(g.panel.left>=g.viewport.left+13.5);assert(g.panel.right<=g.viewport.right-13.5);assert(Math.abs(g.panel.left-(g.viewport.right-g.panel.right))<1);assert(g.panel.top>=g.header.bottom);
   assert(g.pageWidth<=g.clientWidth);for(const b of [g.mark,...g.chips,...g.items]){assert(b.left>=g.panel.left);assert(b.right<=g.panel.right);}
   for(const item of g.items)assert(item.scroll<=item.width);assert(g.list.scroll>g.list.height);assert.equal(g.list.overflow,'auto');assert(g.list.height<=390);
   geometry.push({width,theme,...g});await page.screenshot({path:`/tmp/nca-notification-mobile/${width}-${theme}.png`});
  }
  assert.equal(requests.length,0,'viewport/theme/style changes must not fetch');
  // Existing click/filter logic remains usable for every chip; reads are mocked.
  for(const filter of ['all','comment','reply','mention','like']){await page.locator(`.notif-filters button[onclick="setNotifFilter('${filter}')"]`).click();await page.waitForFunction(filter=>notifFilter===filter,filter);}
  assert.deepEqual(page.errors,[]);fs.writeFileSync('/tmp/nca-notification-mobile/geometry.json',JSON.stringify(geometry,null,2));
 }finally{await page.close()}
});
