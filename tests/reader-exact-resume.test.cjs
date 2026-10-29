'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const browser=require('./helpers/performance-browser.cjs');
before(browser.start);after(browser.stop);
const key='nca_reader_reload_position_v1',chapter='/truyen/audit-story/chuong-1';
async function settled(page){
  await page.waitForSelector('#reader:not(.hidden) #chapter .para');
  await page.waitForFunction(()=>!NcaReaderPosition.isRestoring()&&[...document.querySelectorAll('#chapter img')].every(i=>i.complete)&&document.fonts.status==='loaded'&&scopedComments.state.flights.size===0);
}
async function at(page,y){
  await settled(page);await page.waitForFunction(y=>Math.abs(scrollY-y)<=2,y);
  await page.waitForTimeout(220);assert(Math.abs(await page.evaluate(()=>scrollY)-y)<=2,'final scroll must remain '+y);
}
async function place(page,y=600){
  await settled(page);await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);
  await page.waitForFunction(({key,y})=>JSON.parse(sessionStorage.getItem(key)||'{}').scroll===y,{key,y});
  await page.waitForTimeout(150);
}
async function delayed(f){
  f.fixtures.comments=[{id:'1',story_id:1,user_id:'reader',scope:'chapter',chapter_index:0,paragraph_index:null,parent_id:null,reply_to_user_id:null,content:'A delayed comment',created_at:'2026-10-29T00:00:00Z'}];
  f.fixtures.chapter_images=[{id:1,after_paragraph_number:1,image_path:'resume.svg',sort_order:1,alt_text:'Fixture image'}];
  await f.page.route('**/storage/v1/**',async r=>{await new Promise(resolve=>setTimeout(resolve,550));await r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="silver"/></svg>'});});
  await f.page.route('**/reader-fixture.ttf',async r=>{await new Promise(resolve=>setTimeout(resolve,400));await r.fulfill({contentType:'font/ttf',body:fs.readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')});});
  await f.page.route(url=>['paragraphs','chapter_images','nca_context_comment_root_page'].includes(url.pathname.split('/').pop()),async r=>{await new Promise(resolve=>setTimeout(resolve,170));await r.fallback();});
  await f.page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='@font-face{font-family:ResumeFixture;src:url(/reader-fixture.ttf)} #chapter{font-family:ResumeFixture!important}';document.head.appendChild(s)}));
}
for(const signed of [false,true])test('six F5 and six same-URL entries retain final position: '+(signed?'signed':'guest'),async()=>{
  const f=await browser.fixture({signed});try{
    const url=f.base+chapter;await f.page.goto(url,{waitUntil:'load'});
    for(const kind of ['reload','same-url'])for(let round=0;round<6;round++){
      await place(f.page);if(kind==='reload')await f.page.reload({waitUntil:'load'});else await f.page.goto(url,{waitUntil:'load'});
      await at(f.page,600);
      assert.equal(await f.page.evaluate(()=>performance.getEntriesByType('navigation')[0].type),kind==='reload'?'reload':'navigate');
    }
    assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('delayed comments/content/images/fonts settle at the saved pixel across eight entries',async()=>{
  const f=await browser.fixture();try{
    await delayed(f);const url=f.base+chapter;await f.page.goto(url,{waitUntil:'load'});
    for(let round=0;round<8;round++){
      await place(f.page);if(round%2)await f.page.goto(url,{waitUntil:'load'});else await f.page.reload({waitUntil:'load'});
      await at(f.page,600);assert.equal(await f.page.locator('#chapterCommentsList .comment-bubble').count(),1);
      assert.equal(await f.page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)).scroll,key),600);
    }
    assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('different direct chapter, Next/Prev and TOC all start at the top',async()=>{
  const f=await browser.fixture();try{
    await f.page.goto(f.base+chapter,{waitUntil:'load'});await place(f.page);
    await f.page.goto(f.base+'/truyen/audit-story/chuong-2',{waitUntil:'load'});await at(f.page,0);
    await place(f.page);await f.page.evaluate(()=>moveChapter(-1));await at(f.page,0);
    await place(f.page);await f.page.evaluate(()=>moveChapter(1));await at(f.page,0);
    await place(f.page);await f.page.evaluate(()=>goChapter(0));await at(f.page,0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('Back/Forward retains the existing route behavior without consuming a resume snapshot',async()=>{
  const f=await browser.fixture();try{
    await f.page.goto(f.base+chapter,{waitUntil:'load'});await place(f.page);
    await f.page.evaluate(()=>moveChapter(1));await at(f.page,0);
    await f.page.goBack();await at(f.page,600);assert(f.page.url().endsWith('chuong-1'));
    await f.page.goForward();await at(f.page,0);assert(f.page.url().endsWith('chuong-2'));
    assert.equal(await f.page.evaluate(()=>history.scrollRestoration),'auto');assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('new opener tab ignores a copied sessionStorage snapshot and leaves its source tab intact',async()=>{
  const f=await browser.fixture();try{
    await f.page.goto(f.base+chapter,{waitUntil:'load'});await place(f.page);
    const owner=await f.page.evaluate(()=>window.name);
    await f.context.addInitScript(key=>{window.inheritedReaderSnapshot=sessionStorage.getItem(key)},key);
    const opened=f.context.waitForEvent('page');await f.page.evaluate(url=>window.open(url,'_blank'),f.base+chapter);const child=await opened;
    await at(child,0);assert.notEqual(await child.evaluate(()=>window.name),owner);
    assert.equal(await child.evaluate(()=>JSON.parse(inheritedReaderSnapshot).scroll),600);
    assert.equal(await f.page.evaluate(()=>scrollY),600);await child.close();assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('same-path snapshot does not match a different story/chapter identity or an expired record',async()=>{
  const f=await browser.fixture();try{
    await f.page.goto(f.base+chapter,{waitUntil:'load'});await place(f.page);
    const original=await f.page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key);
    for(const patch of [{storyId:'999'},{chapterId:'999'},{at:Date.now()-7*60*60*1000},{at:Date.now()+60000},{scroll:-1}]){
      await f.page.addInitScript(({key,record})=>sessionStorage.setItem(key,JSON.stringify(record)),{key,record:{...original,...patch}});
      await f.page.goto(f.base+chapter,{waitUntil:'load'});await at(f.page,0);
    }assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('signed resume never saves intermediate scroll and Continue reading still uses cloud progress',async()=>{
  const f=await browser.fixture({signed:true});try{
    await delayed(f);await f.page.goto(f.base+chapter,{waitUntil:'load'});await place(f.page);await f.page.evaluate(()=>saveCloudMemberState());
    const start=f.requests.length;await f.page.reload({waitUntil:'load'});await at(f.page,600);await f.page.evaluate(()=>saveCloudMemberState());
    const writes=f.requests.slice(start).filter(r=>r.table==='reading_progress'&&r.method==='POST').flatMap(r=>r.body);
    assert(writes.length>0);assert(writes.every(r=>r.scroll_position===600));
    await f.page.evaluate(async()=>{setReadingProgress(1,1,350);await saveCloudMemberState();show('home')});
    await f.page.locator('#stories .story-actions button').first().click();await at(f.page,350);
    assert.equal(await f.page.locator('#chapterTitle').textContent(),'Chapter 2');assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('comments arriving after the initial resource settle do not pull the restored position',async()=>{
  const f=await browser.fixture();try{
    f.fixtures.comments=[{id:'1',story_id:1,user_id:'reader',scope:'chapter',chapter_index:0,paragraph_index:null,parent_id:null,content:'Late comment',created_at:'2026-10-29T00:00:00Z'}];
    await f.page.route(url=>url.pathname.endsWith('/nca_context_comment_root_page'),async r=>{await new Promise(resolve=>setTimeout(resolve,800));await r.fallback();});
    await f.page.goto(f.base+chapter,{waitUntil:'load'});await place(f.page);
    await f.page.reload({waitUntil:'load'});await at(f.page,600);
    assert.equal(await f.page.locator('#chapterCommentsList .comment-bubble').count(),1);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('a user scroll cancels pending layout corrections instead of snapping back later',async()=>{
  const f=await browser.fixture();try{
    await delayed(f);await f.page.goto(f.base+chapter,{waitUntil:'load'});await place(f.page);
    await f.page.reload({waitUntil:'load'});await f.page.waitForSelector('#reader:not(.hidden)');
    await f.page.waitForFunction(()=>NcaReaderPosition.isRestoring());await f.page.mouse.wheel(0,200);await settled(f.page);await f.page.waitForTimeout(250);
    const result=await f.page.evaluate(key=>({y:scrollY,saved:JSON.parse(sessionStorage.getItem(key)).scroll}),key);
    assert(Math.abs(result.y-600)>2,JSON.stringify(result));assert.equal(result.saved,Math.round(result.y));assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('an explicit comment target keeps ownership when chapter images finish later',async()=>{
  const f=await browser.fixture();try{
    f.fixtures.comments=[{id:'1',story_id:1,user_id:'reader',scope:'chapter',chapter_index:0,paragraph_index:null,parent_id:null,content:'Target comment',created_at:'2026-10-29T00:00:00Z'}];
    f.fixtures.chapter_images=[{id:1,after_paragraph_number:1,image_path:'target.svg',sort_order:1,alt_text:'Fixture'}];
    await f.page.route('**/storage/v1/**',async r=>{await new Promise(resolve=>setTimeout(resolve,1200));await r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"/>'});});
    await f.page.goto(f.base+chapter,{waitUntil:'load'});await place(f.page);
    await f.page.reload({waitUntil:'load'});await f.page.waitForSelector('#chapterCommentsList .comment-item');
    await f.page.evaluate(()=>focusExactComment('1'));await settled(f.page);
    // Preserve the existing comment jump; the resume controller must not force its old 600px target.
    await f.page.waitForFunction(()=>scrollY>600&&!NcaReaderPosition.isRestoring());
    await f.page.waitForTimeout(220);assert(await f.page.evaluate(()=>scrollY>600));assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
