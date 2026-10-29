'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const browser=require('./helpers/performance-browser.cjs');
before(browser.start);after(browser.stop);
const chapter='/truyen/audit-story/chuong-1';
async function instrument(f,{type='back_forward',snapshot=false}={}){
  await f.context.addInitScript(({type,snapshot,chapter})=>{
    const entries=performance.getEntriesByType.bind(performance);
    performance.getEntriesByType=name=>name==='navigation'?entries(name).map(e=>({...e.toJSON(),type})):entries(name);
    window.historyTrace={popstates:0,persisted:0,selections:[]};
    addEventListener('popstate',()=>historyTrace.popstates++);
    addEventListener('pageshow',e=>{if(e.persisted)historyTrace.persisted++});
    const owner=typeof snapshot==='string'?snapshot:'guest';
    if(snapshot){
      window.name='nca-reader-tab:11111111-1111-4111-8111-111111111111';
      sessionStorage.setItem('nca_reader_reload_position_v1',JSON.stringify({version:2,tab:window.name,owner,path:chapter,storyId:'1',chapterId:'1',scroll:600,at:Date.now()}));
    }
    // Guest persistent progress is the existing per-story format; a fresh context has no tab snapshot.
    localStorage.setItem('nca_reader_progress_v1:guest:1',JSON.stringify({version:1,owner:'guest',storyId:'1',chapterId:'1',path:chapter,scroll:600,at:Date.now()}));
    let api;
    Object.defineProperty(window,'NcaReaderPosition',{configurable:true,get:()=>api,set:value=>{
      api={...value,async consume(...args){
        const before=JSON.parse(sessionStorage.getItem('nca_reader_reload_position_v1')||'null');
        const result=await value.consume(...args);
        const source=result?.native?'native history':result?.scroll===0?'top':before?.tab===window.name?'tab snapshot':'per-story progress';
        historyTrace.selections.push({type,popstates:historyTrace.popstates,source,scroll:result?.scroll});return result;
      }};
    }});
  },{type,snapshot,chapter});
}
async function settled(p){
  await p.waitForSelector('#reader:not(.hidden) #chapter .para');
  await p.waitForFunction(()=>!NcaReaderPosition.isRestoring()&&[...document.querySelectorAll('#chapter img')].every(i=>i.complete)&&document.fonts.status==='loaded'&&scopedComments.state.flights.size===0);
}
async function at(p,y){
  await settled(p);await p.waitForFunction(y=>Math.abs(scrollY-y)<=2,y,{timeout:2000});await p.waitForTimeout(220);
  const actual=await p.evaluate(()=>scrollY);
  assert(Math.abs(actual-y)<=2,JSON.stringify({expected:y,actual,trace:await p.evaluate(()=>historyTrace)}));
}
test('twenty fresh cold back_forward contexts resume per-story progress at final 600',async()=>{
  const results=[];
  for(let round=0;round<20;round++){
    const signed=round%2===0,f=await browser.fixture({signed});
    try{
      await instrument(f);await f.page.goto(f.base+chapter);await at(f.page,600);
      const trace=await f.page.evaluate(()=>historyTrace);assert.equal(trace.popstates,0);assert.equal(trace.selections[0].source,'per-story progress');assert.equal(trace.selections[0].type,'back_forward');
      results.push({signed,final:await f.page.evaluate(()=>scrollY)});assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
  console.log(JSON.stringify({scenario:'cold bootstrap',type:'back_forward',popstates:0,source:'per-story progress',rounds:results.length,min:Math.min(...results.map(r=>r.final)),max:Math.max(...results.map(r=>r.final))}));
});
test('cold back_forward keeps surviving exact snapshot priority for guest and signed',async()=>{
  for(const signed of [false,true]){
    const f=await browser.fixture({signed});try{
      f.fixtures.reading_progress.forEach(row=>row.scroll_position=350);await instrument(f,{snapshot:signed?'user:reader':'guest'});
      await f.page.goto(f.base+chapter);await at(f.page,600);assert.equal((await f.page.evaluate(()=>historyTrace.selections))[0].source,'tab snapshot');assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});
test('cold back_forward waits for delayed signed progress without first painting or writing zero',async()=>{
  const f=await browser.fixture({signed:true});let release,releaseMember;f.state.progressGate=new Promise(r=>release=r);f.state.memberGate=new Promise(r=>releaseMember=r);
  try{
    await instrument(f);await f.page.goto(f.base+chapter);await f.page.waitForTimeout(200);
    assert.equal(await f.page.locator('#reader:not(.hidden)').count(),0);
    assert(f.requests.some(r=>r.table==='reading_progress'&&r.query.includes('story_id=eq.1')));
    assert.equal(f.requests.filter(r=>r.table==='reading_progress'&&r.method==='POST').length,0);
    release();await at(f.page,600);assert.equal(await f.page.evaluate(()=>activateMemberSync().progressReady),false);
    releaseMember();await f.page.waitForFunction(()=>activateMemberSync().progressReady);await at(f.page,600);assert.deepEqual(f.errors,[]);
  }finally{release();releaseMember();await f.close();}
});
test('actual live SPA Back and Forward retain browser positions despite conflicting saved progress',async()=>{
  const f=await browser.fixture();try{
    await instrument(f);await f.page.goto(f.base+chapter);await at(f.page,600);
    await f.page.evaluate(()=>scrollTo({top:350,behavior:'instant'}));await f.page.waitForTimeout(300);
    await f.page.evaluate(()=>moveChapter(1));await at(f.page,0);
    await f.page.evaluate(chapter=>localStorage.setItem('nca_reader_progress_v1:guest:1',JSON.stringify({version:1,owner:'guest',storyId:'1',chapterId:'1',path:chapter,scroll:900,at:Date.now()})),chapter);
    await f.page.goBack();await at(f.page,350);await f.page.goForward();await at(f.page,0);
    const trace=await f.page.evaluate(()=>historyTrace);assert.equal(trace.popstates,2);assert.deepEqual(trace.selections.slice(-2).map(s=>s.source),['native history','native history']);assert.equal(await f.page.evaluate(()=>history.scrollRestoration),'auto');assert.deepEqual(f.errors,[]);
    console.log(JSON.stringify({scenario:'live Back/Forward',popstates:trace.popstates,sources:trace.selections.slice(-2).map(s=>s.source),positions:[350,0]}));
  }finally{await f.close();}
});
test('persisted pageshow on a settled document preserves browser position without another read',async()=>{
  const f=await browser.fixture();try{
    await instrument(f,{type:'navigate'});await f.page.goto(f.base+chapter);await at(f.page,600);
    await f.page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));scrollTo({top:350,behavior:'instant'});dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    await at(f.page,350);const trace=await f.page.evaluate(()=>historyTrace);assert.equal(trace.persisted,1);assert.equal(trace.selections.length,1);assert.equal(f.requests.filter(r=>r.table==='story_views'&&r.method==='POST').length,1);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('persisted pageshow cancels a suspended correction before a pending image completes',async()=>{
  const f=await browser.fixture();let releaseImage;const image=new Promise(r=>releaseImage=r);
  try{
    await instrument(f,{type:'navigate'});f.fixtures.chapter_images=[{id:1,after_paragraph_number:70,image_path:'bfcache.svg',sort_order:1,alt_text:'Fixture'}];
    await f.page.route('**/storage/v1/**',async r=>{await image;await r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"/>'});});
    await f.page.goto(f.base+chapter,{waitUntil:'domcontentloaded'});await f.page.waitForFunction(()=>scrollY===600&&NcaReaderPosition.isRestoring());
    await f.page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));scrollTo({top:350,behavior:'instant'});dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    releaseImage();await at(f.page,350);assert.equal(await f.page.evaluate(()=>history.scrollRestoration),'auto');assert.deepEqual(f.errors,[]);
  }finally{releaseImage();await f.close();}
});
