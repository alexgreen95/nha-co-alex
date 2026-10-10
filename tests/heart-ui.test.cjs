const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const A='00000000-0000-0000-0000-000000000001';
async function cssSnapshot(page){return page.locator('#chapterHeartRow button').evaluate(el=>{
 const s=getComputedStyle(el),svg=el.querySelector('svg'),v=getComputedStyle(svg),r=el.getBoundingClientRect(),bg=s.backgroundColor;
 // Canvas resolves color-mix to sRGB for WCAG contrast calculation.
 const ctx=document.createElement('canvas').getContext('2d');
 const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3)};
 const luminance=color=>rgb(color).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
 const l1=luminance(s.color),l2=luminance(bg);
 const hit=getComputedStyle(el,'::before'),home=getComputedStyle(document.querySelector('.chapter-home-btn'));return {hitWidth:parseFloat(hit.width),hitHeight:parseFloat(hit.height),radius:s.borderRadius,homeRadius:home.borderRadius,homeWidth:parseFloat(home.width),homeBackground:home.backgroundColor,transition:v.transitionDuration,animation:v.animationName,path:svg.innerHTML,color:s.color,rgb:rgb(s.color),contrast:(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05),background:s.backgroundColor,border:s.borderTopWidth,outline:s.outlineStyle,shadow:s.boxShadow,transform:s.transform,width:r.width,height:r.height,fill:v.fill,stroke:v.stroke,filter:v.filter,opacity:v.opacity,pressed:el.getAttribute('aria-pressed'),text:el.textContent.trim(),svgWidth:svg.getBoundingClientRect().width};
})}

test('all seven themes: matching Home frame, filled gray/accent, icon-only liked glow, stable hover/focus and 44px hit area',async()=>{
 const calls=[],page=await feedPage(0,{fixtures:{stories:[{id:1,title:'Heart UI',author:'Writer',published:true,baseline_likes:1050}],chapters:[{id:11,story_id:1,chapter_number:1,published:true,title:'Chapter'}]},onRequest:u=>{if(u.pathname.startsWith('/rest/v1/'))calls.push(u.pathname)}});
 const report=[],silhouettes=new Map();try{
  await page.evaluate(A=>{authUser={id:A};activateChapterLikeAccount();currentStory=stories[0];currentChapter=0;show('reader');chapterLikes['1_0']=1001;renderChapterHeart()},A);calls.length=0;
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   for(const theme of ['light','smoky','dustyrose','mistblue','pastel','night','purplenight'])for(const liked of [false,true]){
    await page.mouse.move(0,0);await page.evaluate(({theme,liked})=>{document.activeElement?.blur();setTheme(theme);likedChapters=liked?['1_0']:[];renderChapterHeart()}, {theme,liked});
    await page.waitForTimeout(180);const base=await cssSnapshot(page);const silhouetteKey=width+theme;if(!liked)silhouettes.set(silhouetteKey,{path:base.path,shadow:base.shadow});else{assert.equal(base.path,silhouettes.get(silhouetteKey).path);assert.equal(base.shadow,silhouettes.get(silhouetteKey).shadow,'liked glow must not change button shadow');}assert.equal(base.text,'');assert.equal(await page.locator('#chapterHeartRow button svg').count(),1);assert.equal(await page.locator('#chapterHeartRow button span').count(),0);assert.equal(base.pressed,String(liked));
    assert.notEqual(base.background,'rgba(0, 0, 0, 0)');assert.equal(base.background,base.homeBackground);assert.equal(base.border,'1px');assert.equal(base.radius,base.homeRadius);assert.equal(base.outline,'none');assert.notEqual(base.shadow,'none');assert.equal(base.transform,'none');assert.equal(base.opacity,'1');assert.equal(base.width,base.homeWidth);assert.equal(base.height,base.homeWidth);assert.equal(base.hitWidth,44);assert.equal(base.hitHeight,44);assert(base.contrast>=3,theme+' '+liked+' contrast '+base.contrast);assert.equal(base.svgWidth,20);
    assert.equal(base.fill,base.color);assert.equal(base.stroke,'none');assert.equal(base.animation,'none');if(!liked){assert.equal(base.filter,'none');assert.equal(base.rgb[0],base.rgb[1]);assert.equal(base.rgb[1],base.rgb[2])}else{assert.match(base.filter,/drop-shadow/);assert.notEqual(base.rgb[0],base.rgb[1]);}
    await page.locator('#chapterHeartRow button').hover();await page.waitForTimeout(180);const hover=await cssSnapshot(page);assert.equal(hover.width,base.width);assert.equal(hover.height,base.height);assert.equal(hover.background,base.background);assert.equal(hover.border,'1px');assert.equal(hover.transform,'none');assert.equal(hover.fill,base.fill);if(liked){assert.match(hover.filter,/drop-shadow/);assert.notEqual(hover.filter,base.filter)}else assert.equal(hover.filter,'none');
    await page.mouse.move(0,0);await page.keyboard.press('Tab');await page.locator('#chapterHeartRow button').focus();await page.waitForTimeout(180);assert(await page.locator('#chapterHeartRow button').evaluate(el=>el.matches(':focus-visible')));const focus=await cssSnapshot(page);assert.equal(focus.width,base.width);assert.equal(focus.height,base.height);assert.equal(focus.border,'1px');assert.equal(focus.outline,'solid');if(liked)assert.match(focus.filter,/drop-shadow/);else assert.equal(focus.filter,'none');
    assert.equal(await page.evaluate(()=>chapterLikes['1_0']),1001);assert.equal(await page.evaluate(()=>storyLikeTotal(stories[0])),2051);
    report.push({width,theme,liked,contrast:base.contrast,color:base.color,hover_filter:hover.filter,focus_filter:focus.filter});
   }
  }
  await page.locator('#chapterHeartRow button').evaluate(el=>{window.hitClicks=0;el.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();window.hitClicks++},{capture:true})});const rect=await page.locator('#chapterHeartRow button').boundingBox();await page.mouse.click(rect.x-1,rect.y+rect.height/2);assert.equal(await page.evaluate(()=>hitClicks),1,'extended 44px pointer target is clickable outside 40px frame');await page.emulateMedia({reducedMotion:'reduce'});const reduced=await cssSnapshot(page);assert.equal(reduced.transition,'0s');assert.equal(reduced.animation,'none');assert.equal(calls.length,0,'UI/theme changes do not query/write');assert.deepEqual(page.errors,[]);fs.writeFileSync('/tmp/nca-heart-ui-theme-results.json',JSON.stringify(report,null,2));
 }finally{await page.close()}
});

test('comment/reply hearts keep count, text size and layout; only icon scales across surfaces/themes',async()=>{
 const page=await feedPage(0);try{
  await page.evaluate(()=>{comments.story_1[0].likes=123;comments.story_1.push({id:'reply-ui',userId:'reader-user',name:'Reader',username:'reader',text:'Reply',parentId:comments.story_1[0].id,createdAt:new Date().toISOString(),likes:4,likedBy:[]});window.__alexReplyState.set('story_1::'+comments.story_1[0].id,6);openStory(1);showIntroTab('comments',document.querySelectorAll('.intro-tabs button')[3])});
  for(const theme of ['light','smoky','dustyrose','mistblue','pastel','night','purplenight']){
   await page.evaluate(theme=>setTheme(theme),theme);
   for(const selector of ['#introComments .comment-item[data-comment-id="comment-0"] [data-comment-action="like"]','#introComments .comment-replies [data-comment-action="like"]']){
    const button=page.locator(selector).first();assert.equal(await button.locator('i.comment-heart-icon').count(),1);assert.equal(await button.locator('i').getAttribute('aria-hidden'),'true');assert.equal(await button.locator('span').count(),1);
    const geometry=await button.evaluate(el=>{const icon=el.querySelector('i'),count=el.querySelector('span'),c=getComputedStyle(count),b=el.getBoundingClientRect(),r=count.getBoundingClientRect(),i=icon.getBoundingClientRect();icon.style.transform='none';const old=el.getBoundingClientRect(),oldCount=count.getBoundingClientRect(),oldIcon=icon.getBoundingClientRect();icon.style.removeProperty('transform');return {countFont:c.fontSize,b:[b.width,b.height],old:[old.width,old.height],count:[r.x,r.y,r.width,r.height],oldCount:[oldCount.x,oldCount.y,oldCount.width,oldCount.height],iconScale:i.width/oldIcon.width}});
    assert.equal(geometry.countFont,'12px');assert.deepEqual(geometry.b,geometry.old);assert.deepEqual(geometry.count,geometry.oldCount);assert(Math.abs(geometry.iconScale-1.25)<.02);
   }
  }
  assert.equal((await page.locator('#introComments .comment-item[data-comment-id="comment-0"] [data-comment-action="like"]').first().locator('span').textContent()).trim(),'123');
  assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
