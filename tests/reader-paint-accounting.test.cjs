'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const browser=require('./helpers/performance-browser.cjs');
before(browser.start);after(browser.stop);
const views=f=>f.requests.filter(r=>r.table==='story_views'&&r.method==='POST');
test('direct text paints while view accounting is held and read completion still awaits it',async()=>{
  const f=await browser.fixture();let release;f.state.viewGate=new Promise(r=>release=r);
  try{
    await f.page.goto(f.base+'/truyen/audit-story/chuong-1',{waitUntil:'load'});await f.page.waitForSelector('#reader:not(.hidden) #chapter .para');
    assert.equal(views(f).length,1);assert.equal(await f.page.evaluate(()=>perfTrace.homePaints),0);
    release();await f.page.waitForFunction(()=>[...scopedComments.state.rootPages.values()].every(r=>!r.loading));
    let releaseNext;f.state.viewGate=new Promise(r=>releaseNext=r);
    await f.page.evaluate(()=>{window.readCompleted=false;window.accountingRead=read(1,1).then(()=>readCompleted=true)});
    await f.page.waitForFunction(()=>document.getElementById('chapterTitle').textContent==='Chapter 2');
    assert.equal(await f.page.evaluate(()=>readCompleted),false);
    releaseNext();await f.page.evaluate(()=>accountingRead);assert.equal(views(f).length,2);assert.deepEqual(f.errors,[]);
  }finally{release();await f.close();}
});
test('text also paints before a held view-count refresh finishes',async()=>{
  const f=await browser.fixture();let release;f.state.countGate=new Promise(r=>release=r);
  try{
    await f.page.goto(f.base+'/truyen/audit-story/chuong-1',{waitUntil:'load'});await f.page.waitForSelector('#reader:not(.hidden) #chapter .para');
    assert.equal(views(f).length,1);release();assert.deepEqual(f.errors,[]);
  }finally{release();await f.close();}
});
test('warm revisit and both chapter controls retain one view per completed open',async()=>{
  const f=await browser.fixture();try{
    await f.page.goto(f.base+'/truyen/audit-story/chuong-1',{waitUntil:'load'});await f.page.waitForSelector('#reader:not(.hidden)');
    await f.page.evaluate(async()=>{await moveChapter(1);await goChapter(0);await read(1,1)});
    assert.equal(views(f).length,4);assert.equal(f.requests.filter(r=>r.table==='paragraphs').length,2);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('view failure leaves the reader usable and does not retry or duplicate the view',async()=>{
  const f=await browser.fixture();f.state.viewFailure=true;try{
    await f.page.goto(f.base+'/truyen/audit-story/chuong-1',{waitUntil:'load'});await f.page.waitForSelector('#reader:not(.hidden)');
    await f.page.evaluate(()=>moveChapter(1));assert.equal(views(f).length,2);assert.equal(await f.page.locator('#chapterTitle').textContent(),'Chapter 2');assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('rapid navigation cancels an obsolete pending paint without creating an extra view',async()=>{
  const f=await browser.fixture();try{
    await f.page.goto(f.base+'/truyen/audit-story',{waitUntil:'load'});await f.page.waitForSelector('#storyIntro:not(.hidden)');
    await f.page.evaluate(async()=>{const original=ensureChapterContent;let release;const held=new Promise(r=>release=r);
      ensureChapterContent=async(story,chapter)=>{if(chapter===0)await held;return original(story,chapter)};
      const old=read(1,0);await read(1,1);release();await old;ensureChapterContent=original;});
    assert.equal(await f.page.locator('#chapterTitle').textContent(),'Chapter 2');assert.equal(views(f).length,1);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
