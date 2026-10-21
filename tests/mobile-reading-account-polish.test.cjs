'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const themes=['light','smoky','dustyrose','mistblue','pastel','night','purplenight'];
async function fixture(){return feedPage(0,{canonicalComments:true,fixtures:{stories:[1,2,3,4].map(id=>({id,title:'Một câu chuyện dài '+id,author:'Alex',published:true,status:id===1?'completed':'ongoing',genre:id===1?'Tây huyễn':'Hiện đại'})),chapters:[1,2,3,4].map(id=>({id:100+id,story_id:id,chapter_number:1,title:'Chương 1',published:true})),paragraphs:[{paragraph_number:1,content:'Đoạn văn thử nghiệm'}]}})}
for(const width of [375,390,430,1280])test('bounded UI geometry and controls '+width+'px across seven themes',async()=>{
 const page=await fixture();try{await page.setViewportSize({width,height:950});
 for(const theme of themes){await page.evaluate(({theme,A})=>{setTheme(theme);authUser={id:A};activateMemberSync();progress={1:{chapter:0,scroll:120},2:{chapter:0,scroll:130}};openProfile('reading');}, {theme,A});
 const shelf=await page.locator('.profile-story-grid').evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth,cards:[...el.children].map(c=>{const r=c.getBoundingClientRect();return {w:r.width,scroll:c.scrollWidth,client:c.clientWidth}}),buttons:el.querySelectorAll('.profile-continue').length,cover:el.querySelector('.profile-resume-cover')?.getAttribute('onclick')}));
 assert.equal(shelf.columns,width<=720?2:4);assert(!shelf.overflow);assert.equal(shelf.buttons,0);assert(shelf.cover.includes('read('));for(const c of shelf.cards)assert(c.scroll<=c.client+1);
 const metadata=await page.locator('.profile-story-metadata').first().evaluate(el=>{const [a,b]=el.children;return {same:Math.abs(a.getBoundingClientRect().top-b.getBoundingClientRect().top)<2,overflow:el.scrollWidth>el.clientWidth}});if(width>=390)assert(metadata.same);assert(!metadata.overflow);
 await page.evaluate(()=>{openProfile('profile');document.getElementById('loginBtn').style.display='none';document.getElementById('memberArea').style.display='flex';openAccountMenu()});
 const menu=await page.locator('#accountMenu').evaluate(el=>[...el.querySelectorAll('button,a')].map(b=>({label:b.textContent,font:parseFloat(getComputedStyle(b).fontSize),height:b.getBoundingClientRect().height,border:getComputedStyle(b).borderBottomWidth,decoration:getComputedStyle(b).textDecorationLine,overflow:b.scrollWidth>b.clientWidth})));
 for(const item of menu){assert.equal(item.border,'0px');assert.equal(item.decoration,'none');if(width<=700&&!item.label.includes('Quản lý')){assert(item.font>=15);assert(item.height>=44);}assert(!item.overflow);}
 assert.equal(await page.locator('#accountMenu .feedback-link').getAttribute('href'),'https://forms.gle/2DDU2T5HSJDryGSq7');
 await page.evaluate(()=>{document.getElementById('accountMenu').classList.remove('open');goHome();render()});
 const sort=page.locator('#sortMain'),before=(await sort.boundingBox()).width;await sort.click();assert.equal(await page.locator('#sortMenu').getByText('Thể loại',{exact:true}).count(),0);await page.locator('[data-sort="read_recent"]').click();assert.equal((await sort.boundingBox()).width,before);assert.equal(await page.locator('#sortLabel').textContent(),'Sắp xếp theo: Đã đọc gần nhất');
 await page.evaluate(()=>openStory(1));await page.waitForLoadState('networkidle');
 const tabs=await page.locator('#storyIntro .intro-tabs button').evaluateAll(es=>es.map(e=>({width:e.getBoundingClientRect().width,scroll:e.scrollWidth,client:e.clientWidth})));assert.equal(tabs.length,3);assert(Math.max(...tabs.map(t=>t.width))-Math.min(...tabs.map(t=>t.width))<1);for(const t of tabs)assert(t.scroll<=t.client+1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 for(const [i,pane] of [[0,'introAbout'],[1,'introReviews'],[2,'introChapters']]){await page.locator('#storyIntro .intro-tabs button').nth(i).click();assert(await page.locator('#'+pane).isVisible());assert.equal(await page.locator('.intro-tabs .active').count(),1);}
 const controls=await page.locator('#introReadBtn,#introSaveBtn,.profile-edit-top').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return {radius:s.borderRadius,border:s.borderTopWidth,line:s.lineHeight}}));assert(controls.every(c=>c.radius==='10px'&&c.border==='1px'));
 if(width<=700){const logo=await page.locator('.brand-house').boundingBox();assert.equal(logo.width,40);}
 }assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('hydrates authoritative account timestamps; recent sort and shelf use deterministic descending activity, unknown last',async()=>{
 const page=await fixture();try{
 await page.route('**/rest/v1/reading_progress?**',route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify([{story_id:1,chapter_id:101,scroll_position:120,updated_at:'2026-10-20T10:00:00Z'},{story_id:3,chapter_id:103,scroll_position:120,updated_at:'2026-10-21T10:00:00Z'},{story_id:2,chapter_id:102,scroll_position:120,updated_at:'2026-10-21T10:00:00Z'}])}));
 const x=await page.evaluate(async A=>{authUser={id:A};activateMemberSync();await loadCloudMemberState();storyFilter.views='read_recent';render();const home=[...document.querySelectorAll('#stories .story-card')].map(e=>e.getAttribute('onclick'));openProfile('reading');const shelf=[...document.querySelectorAll('.profile-story-tile')].map(e=>e.getAttribute('onclick'));return {timestamp:progress[1].updatedAt,home,shelf};},A);
 assert.equal(x.timestamp,'2026-10-20T10:00:00Z');assert.deepEqual(x.home,['openStory(2)','openStory(3)','openStory(1)','openStory(4)']);assert.deepEqual(x.shelf,['openStory(2)','openStory(3)','openStory(1)']);
 const anon=await page.evaluate(B=>{authUser={id:B};return [...stories].sort(compareRecentReading).map(s=>s.id)},B);assert.deepEqual(anon,[1,2,3,4]);
 const out=await page.evaluate(()=>{authUser=null;return [...stories].sort(compareRecentReading).map(s=>s.id)});assert.deepEqual(out,[1,2,3,4]);
 }finally{await page.close()}
});
test('genuine same-position reader opens refresh existing updated_at, ordinary no-op saves do not write',async()=>{
 const page=await fixture(),writes=[];try{
 await page.route('**/rest/v1/reading_progress?**',async route=>{const req=route.request();if(req.method()==='POST')writes.push(req.postDataJSON());await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(req.method()==='GET'?[{story_id:1,chapter_id:101,scroll_position:120,updated_at:'2026-10-20T10:00:00Z'}]:[])});});
 const result=await page.evaluate(async A=>{authUser={id:A};activateMemberSync();await loadCloudMemberState();setReadingProgress(1,0,120);await saveCloudMemberState();const before=progress[1].updatedAt;setReadingProgress(1,0,120,true);const opened=progress[1].updatedAt;await saveCloudMemberState();await loadCloudMemberState();return {before,opened};},A);
 assert.equal(result.before,'2026-10-20T10:00:00Z');assert.equal(writes.length,1);assert.equal(writes[0][0].updated_at,result.opened);assert.equal(writes[0][0].scroll_position,120);
 }finally{await page.close()}
});
test('reader presentation preserves home destination and paragraph context; shared SVG hearts have stable geometry',async()=>{
 const page=await fixture();try{
 await page.evaluate(()=>{currentStory=stories[0];currentChapter=0;currentStory.chapters[0].paras=['Đoạn văn'];commentStats.chapters.set('1_0',{general:0,paragraphs:new Map([[0,123]])});renderChapter();ensureCommentPanel();});
 assert.equal(await page.locator('#rstatus').count(),0);assert.equal(await page.locator('.reader-head').textContent().then(x=>/Đã hoàn thành|Đang làm/.test(x)),false);assert.equal(await page.locator('.chapter-home-btn').getAttribute('onclick'),'backToCurrentStory()');assert.equal(await page.locator('.chapter-home-btn svg path').getAttribute('fill'),'currentColor');assert.equal(await page.locator('#paragraphCommentPanel strong').textContent(),'Bình luận');
 assert.equal(await page.locator('.para-wrap .comment-btn').getAttribute('onclick'),"event.stopPropagation();toggleComments('1_0_0',true)");assert.equal(await page.locator('.para-wrap .comment-btn span').evaluate(el=>getComputedStyle(el).fontSize),'13px');
 const x=await page.evaluate(()=>{commentStats.likes.set('999',12);const c={id:'999',name:'Reader',text:'Hello',likes:12,likedBy:[]};comments['story_1']=[c];const holder=document.createElement('div');holder.innerHTML=commentMarkup(c,'story_1',[c]);document.querySelector('#chapterCommentsList').appendChild(holder);const b=holder.querySelector('[data-comment-action="like"]'),measure=()=>{const r=b.getBoundingClientRect(),i=b.querySelector('.ico').getBoundingClientRect();return [r.width,r.height,i.width,i.height]};const a=measure();authUser={id:'fixture'};commentStats.account=authAccount;commentStats.membership.set('999',true);patchCommentHeartUI();return {a,b:measure(),pressed:b.getAttribute('aria-pressed'),count:b.querySelector(':scope>span').textContent,path:b.querySelector('path').getAttribute('d'),chapter:document.querySelector('#chapterHeartRow path').getAttribute('d')};});assert.deepEqual(x.a,x.b);assert.equal(x.pressed,'true');assert.equal(x.count,'12');assert.equal(x.path,x.chapter);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('UI source contains no legacy paragraph label and keeps the three tabs and profile resume handler',()=>{
 const s=fs.readFileSync('index.html','utf8');assert(!s.includes('Bình luận đoạn này'));assert.match(s,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);assert(s.includes("read('+story.id+')"));assert(s.includes("updated_at:value.updatedAt"));
});
