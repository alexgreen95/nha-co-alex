'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const browser=require('./helpers/performance-browser.cjs');
before(browser.start);after(browser.stop);
for(const cold of [true,false])test((cold?'cold URL':'warm handoff')+' resumes its pending target on metadata readiness',async()=>{
  const f=await browser.fixture();let release;f.state.metadataGate=new Promise(r=>release=r);
  try{
    await f.page.addInitScript(()=>{window.metadataReadyEvents=0;addEventListener('nca-public-metadata-ready',()=>metadataReadyEvents++);});
    await f.page.goto(f.base+(cold?'/?nca_push=content&category=new_chapter&story_id=1&chapter_id=2':'/'),{waitUntil:'load'});
    if(!cold)await f.page.evaluate(()=>{window.pushAcks=[];const e=new Event('message');Object.defineProperties(e,{source:{value:{scriptURL:location.origin+'/push-sw.js',postMessage:m=>pushAcks.push(m)}},data:{value:{type:'nca-push-intent-v2',id:'ef'.repeat(16),createdAt:Date.now(),intent:{type:'content',category:'new_chapter',story_id:'1',chapter_id:'2'}}}});navigator.serviceWorker.dispatchEvent(e);});
    await f.page.waitForFunction(()=>NcaPushNavigation.getState()==='WAITING_FOR_DATA');
    release();await f.page.waitForFunction(()=>NcaPushNavigation.getState()==='NAVIGATED');
    assert.equal(await f.page.locator('#chapterTitle').textContent(),'Chapter 2');
    assert.equal(await f.page.evaluate(()=>metadataReadyEvents),1);
    assert.equal(f.requests.filter(r=>r.table==='story_views').length,1);
    if(cold)assert.equal(await f.page.evaluate(()=>perfTrace.homePaints),0);
    else assert.equal(await f.page.evaluate(()=>pushAcks.filter(m=>m.type==='nca-push-ack-v2').length),1);
    console.log(JSON.stringify({scenario:cold?'cold':'warm',catalogRequests:f.requests.filter(r=>r.table==='nca_get_freshness_catalog').length,chapterQueries:f.requests.filter(r=>r.table==='chapters').map(r=>r.query)}));
    assert.deepEqual(f.errors,[]);
  }finally{release();await f.close();}
});
