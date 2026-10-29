'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const browser=require('./helpers/performance-browser.cjs');
before(browser.start);after(browser.stop);
for(const [route,id] of [['/','home'],['/truyen/audit-story','storyIntro'],['/truyen/audit-story/chuong-1','reader'],['/user/reader','profilePage'],['/missing','home'],['/truyen/missing','home'],['/?nca_push=content&category=new_chapter&story_id=1&chapter_id=2','reader'],['/?nca_push=invalid','home'],['/?nca_push=content&category=new_chapter&story_id=99&chapter_id=2','home'],['/?nca_push=personal&category=reply&notification_id=1&comment_id=99','home']]){
  test('initial page visibility: '+route,async()=>{const f=await browser.fixture();try{
    await f.page.goto(f.base+route,{waitUntil:'load'});await f.page.waitForSelector('#'+id+':not(.hidden)',{state:'visible'});
    await f.page.waitForFunction(()=>!document.documentElement.classList.contains('initial-route-pending'));
    await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const trace=await f.page.evaluate(()=>window.perfTrace);
    if(id!=='home')assert.equal(trace.homePaints,0,JSON.stringify(trace));else assert(trace.homePaints>0);
    assert.deepEqual(f.errors,[]);
  }finally{await f.close();}});
}
test('chapter F5 preserves position and Back/Forward resolves the existing routes',async()=>{
  const f=await browser.fixture();try{
    await f.page.goto(f.base+'/truyen/audit-story/chuong-1',{waitUntil:'load'});await f.page.waitForSelector('#reader:not(.hidden)');
    await f.page.evaluate(()=>scrollTo({top:600,behavior:'instant'}));await f.page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('nca_reader_reload_position_v1')||'{}').scroll===600);
    await f.page.reload({waitUntil:'load'});await f.page.waitForFunction(()=>Math.abs(scrollY-600)<=2&&!document.getElementById('reader').classList.contains('hidden'));
    assert.equal(await f.page.evaluate(()=>perfTrace.homePaints),0);
    await f.page.evaluate(()=>openStory(1));await f.page.goBack();await f.page.waitForSelector('#reader:not(.hidden)');
    await f.page.goForward();await f.page.waitForSelector('#storyIntro:not(.hidden)');assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('gate and authoritative member role remain intact during signed direct navigation',async()=>{
  const f=await browser.fixture({signed:true,gate:false});try{
    await f.page.goto(f.base+'/truyen/audit-story/chuong-1',{waitUntil:'load'});await f.page.waitForFunction(()=>authAccount?.profileReady);
    assert.equal(await f.page.evaluate(()=>document.body.classList.contains('gate-locked')),true);
    assert.equal(await f.page.evaluate(()=>isSiteAdmin()),false);
    assert.equal(await f.page.evaluate(()=>perfTrace.homePaints),0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('a newer user navigation retains ownership while bootstrap metadata is pending',async()=>{
  const f=await browser.fixture();let release;
  f.state.metadataGate=new Promise(r=>release=r);
  try{
    await f.page.goto(f.base+'/truyen/audit-story/chuong-1',{waitUntil:'load'});
    await f.page.waitForFunction(()=>typeof show==='function');
    await f.page.evaluate(()=>show('library'));
    release();await f.page.evaluate(()=>authMetadataReady);
    assert.equal(await f.page.locator('#library').isVisible(),true);
    assert.equal(await f.page.evaluate(()=>document.documentElement.classList.contains('initial-route-pending')),false);
    assert.deepEqual(f.errors,[]);
  }finally{release();await f.close();}
});
