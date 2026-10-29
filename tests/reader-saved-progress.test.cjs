'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const browser=require('./helpers/performance-browser.cjs');
before(browser.start);after(browser.stop);
const A='/truyen/audit-story/chuong-1',B='/truyen/second-story/chuong-1',guestKey=id=>'nca_reader_progress_v1:guest:'+id;
function second(f){f.fixtures.stories.push({id:2,title:'Second Story',author:'Alex',published:true,status:'ongoing'});f.fixtures.chapters.push({id:3,story_id:2,chapter_number:1,title:'Other chapter',published:true});}
async function settled(p){await p.waitForSelector('#reader:not(.hidden) #chapter .para');await p.waitForFunction(()=>!NcaReaderPosition.isRestoring()&&scopedComments.state.flights.size===0);}
async function at(p,y){await settled(p);await p.waitForFunction(y=>Math.abs(scrollY-y)<=2,y);await p.waitForTimeout(220);assert(Math.abs(await p.evaluate(()=>scrollY)-y)<=2,'final scroll '+y);}
async function place(p,y){await settled(p);await p.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await p.waitForFunction(y=>JSON.parse(sessionStorage.getItem('nca_reader_reload_position_v1')).scroll===y,y);await p.waitForTimeout(300);}
async function seed(p,records){await p.addInitScript(records=>{for(const [id,chapterId,path,scroll] of records)localStorage.setItem('nca_reader_progress_v1:guest:'+id,JSON.stringify({version:1,owner:'guest',storyId:String(id),chapterId:String(chapterId),path,scroll,at:Date.now()}));},records);}
for(const signed of [false,true])test('fresh context and external entry restore each story independently: '+(signed?'signed':'guest'),async()=>{
  let storageState;
  if(!signed){const f=await browser.fixture();try{second(f);await f.page.goto(f.base+A);await place(f.page,600);const other=await f.context.newPage();await other.goto(f.base+B);await place(other,350);assert.equal(await f.page.evaluate(key=>JSON.parse(localStorage.getItem(key)).scroll,guestKey(1)),600);storageState=await f.context.storageState();}finally{await f.close();}}
  for(let round=0;round<3;round++){
    const f=await browser.fixture({signed,storageState});try{
      second(f);if(signed)f.fixtures.reading_progress.push({user_id:'reader',story_id:2,chapter_id:3,scroll_position:350});
      await f.page.goto(f.base+A);await at(f.page,600);const other=await f.context.newPage();await other.goto(f.base+B);await at(other,350);
      assert.notEqual(await other.evaluate(()=>window.name),await f.page.evaluate(()=>window.name));
      await other.goto(f.base+'/truyen/audit-story/chuong-2');await at(other,0);
      assert.equal(await f.page.evaluate(()=>scrollY),600);assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
});
for(const signed of [false,true])test('two surviving tabs of the same story retain their own exact snapshots: '+(signed?'signed':'guest'),async()=>{
  const f=await browser.fixture({signed});try{
    await f.page.goto(f.base+A);await place(f.page,600);const other=await f.context.newPage();await other.goto(f.base+A);await at(other,600);await place(other,350);
    for(let i=0;i<3;i++){await f.page.reload();await at(f.page,600);await other.reload();await at(other,350);}
    assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('different story with no saved record starts at top',async()=>{
  const f=await browser.fixture();try{second(f);await seed(f.page,[[1,1,A,600]]);await f.page.goto(f.base+B);await at(f.page,0);assert.deepEqual(f.errors,[]);}finally{await f.close();}
});
test('filtered story progress resolves before reader render without waiting for unrelated member hydration',async()=>{
  const f=await browser.fixture({signed:true});let release,releaseMember;f.state.progressGate=new Promise(r=>release=r);f.state.memberGate=new Promise(r=>releaseMember=r);
  try{
    await f.page.goto(f.base+A);await f.page.waitForFunction(()=>typeof initialReaderProgress==='function');
    while(!f.requests.some(r=>r.table==='reading_progress'&&r.query.includes('story_id=eq.1')))await f.page.waitForTimeout(20);
    await f.page.waitForTimeout(120);assert.equal(await f.page.locator('#reader:not(.hidden)').count(),0);assert.equal(f.requests.filter(r=>r.table==='reading_progress'&&r.method==='POST').length,0);
    await f.page.evaluate(()=>dispatchEvent(new Event('pagehide')));
    assert.equal(await f.page.evaluate(()=>sessionStorage.getItem('nca_reader_reload_position_v1')),null,'unresolved progress cannot become a zero tab snapshot');
    release();await at(f.page,600);assert.equal(await f.page.evaluate(()=>activateMemberSync().progressReady),false);
    releaseMember();await f.page.waitForFunction(()=>activateMemberSync().progressReady);await at(f.page,600);
    assert((await f.page.evaluate(()=>progress[1].scroll))===600);assert.deepEqual(f.errors,[]);
  }finally{release();releaseMember();await f.close();}
});
test('newer dirty progress beats an older filtered cloud response and later broad hydration',async()=>{
  const f=await browser.fixture({signed:true});let release,releaseMember;f.state.progressGate=new Promise(r=>release=r);f.state.memberGate=new Promise(r=>releaseMember=r);f.fixtures.reading_progress[0].scroll_position=200;
  try{
    await f.page.goto(f.base+A);while(!f.requests.some(r=>r.table==='reading_progress'&&r.query.includes('story_id=eq.1')))await f.page.waitForTimeout(20);
    await f.page.evaluate(()=>setReadingProgress(1,0,700));release();await at(f.page,700);releaseMember();await f.page.waitForFunction(()=>activateMemberSync().progressReady);await at(f.page,700);
    const writes=f.requests.filter(r=>r.table==='reading_progress'&&r.method==='POST').flatMap(r=>r.body);assert(writes.every(r=>r.scroll_position===700));assert.deepEqual(f.errors,[]);
  }finally{release();releaseMember();await f.close();}
});
test('old account lookup cannot paint or save after an account switch',async()=>{
  const f=await browser.fixture({signed:true});let release,releaseMember;f.state.progressGate=new Promise(r=>release=r);f.state.memberGate=new Promise(r=>releaseMember=r);
  try{
    await f.page.goto(f.base+A);while(!f.requests.some(r=>r.table==='reading_progress'&&r.query.includes('story_id=eq.1')))await f.page.waitForTimeout(20);
    await f.page.evaluate(()=>{applyAuthUser({id:'other',user_metadata:{}});activateMemberSync()});release();releaseMember();await f.page.waitForTimeout(250);
    assert.equal(await f.page.locator('#reader:not(.hidden)').count(),0);assert.equal(f.requests.filter(r=>r.table==='story_views'&&r.method==='POST').length,0);assert.equal(await f.page.evaluate(()=>progress[1]??null),null);
    assert.deepEqual(f.errors,[]);
  }finally{release();releaseMember();await f.close();}
});
test('newer local progress arriving while chapter content loads is rechecked before first paint',async()=>{
  const f=await browser.fixture({signed:true});let releaseContent,releaseMember,requested;const content=new Promise(r=>releaseContent=r),request=new Promise(r=>requested=r);f.state.memberGate=new Promise(r=>releaseMember=r);
  try{
    await f.page.route(url=>url.pathname.endsWith('/paragraphs'),async r=>{requested();await content;await r.fallback()});
    await f.page.goto(f.base+A);await f.page.waitForFunction(()=>currentStory?.id===1&&NcaReaderPosition.isRestoring());
    // read() has received the filtered cloud record before it requests chapter content.
    await request;
    await f.page.evaluate(()=>setReadingProgress(1,0,700));releaseMember();releaseContent();await at(f.page,700);
    await f.page.evaluate(()=>saveCloudMemberState());assert(f.requests.filter(r=>r.table==='reading_progress'&&r.method==='POST').flatMap(r=>r.body).every(r=>r.scroll_position===700));assert.deepEqual(f.errors,[]);
  }finally{releaseContent();releaseMember();await f.close();}
});
test('previous-account tab snapshot and guest storage cannot supply signed progress',async()=>{
  const f=await browser.fixture({signed:true,account:'other'});try{
    f.fixtures.reading_progress=[{user_id:'reader',story_id:1,chapter_id:1,scroll_position:600},{user_id:'other',story_id:1,chapter_id:1,scroll_position:170}];
    await seed(f.page,[[1,1,A,800]]);await f.page.addInitScript(path=>{window.name='nca-reader-tab:11111111-1111-4111-8111-111111111111';sessionStorage.setItem('nca_reader_reload_position_v1',JSON.stringify({version:2,tab:window.name,owner:'user:reader',storyId:'1',chapterId:'1',path,scroll:900,at:Date.now()}));},A);
    await f.page.goto(f.base+A);await at(f.page,170);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('failed initial progress lookup renders usable text without saving a false zero or later jumping',async()=>{
  const f=await browser.fixture({signed:true});f.state.progressFailure=true;try{
    await f.page.goto(f.base+A);await f.page.waitForSelector('#reader:not(.hidden) #chapter .para');await f.page.waitForTimeout(650);
    assert.equal(f.requests.filter(r=>r.table==='reading_progress'&&r.method==='POST').length,0);assert.equal(await f.page.evaluate(()=>scrollY),0);
    assert.equal(await f.page.evaluate(()=>sessionStorage.getItem('nca_reader_reload_position_v1')),null);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('interaction during a held lookup cancels positioning without stranding text or saving a false zero',async()=>{
  const f=await browser.fixture({signed:true});let release,releaseMember;f.state.progressGate=new Promise(r=>release=r);f.state.memberGate=new Promise(r=>releaseMember=r);
  try{
    await f.page.goto(f.base+A);while(!f.requests.some(r=>r.table==='reading_progress'&&r.query.includes('story_id=eq.1')))await f.page.waitForTimeout(20);
    await f.page.evaluate(()=>dispatchEvent(new Event('pointerdown')));release();await f.page.waitForSelector('#reader:not(.hidden) #chapter .para');await f.page.waitForTimeout(250);
    assert.equal(await f.page.evaluate(()=>sessionStorage.getItem('nca_reader_reload_position_v1')),null);
    assert.equal(await f.page.evaluate(()=>progress[1]??null),null);assert.equal(f.requests.filter(r=>r.table==='reading_progress'&&r.method==='POST').length,0);
    releaseMember();assert.deepEqual(f.errors,[]);
  }finally{release();releaseMember();await f.close();}
});
test('cold push and explicit chapter choice outrank saved progress',async()=>{
  const f=await browser.fixture();try{
    await seed(f.page,[[1,1,A,600]]);await f.page.goto(f.base+'/?nca_push=content&category=new_chapter&story_id=1&chapter_id=1');await f.page.waitForFunction(()=>NcaPushNavigation.getState()==='NAVIGATED');await at(f.page,0);
    await place(f.page,600);await f.page.evaluate(()=>goChapter(0));await at(f.page,0);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('paragraph target cancels a saved restore before delayed image completion',async()=>{
  const f=await browser.fixture();try{
    await seed(f.page,[[1,1,A,600]]);f.fixtures.chapter_images=[{id:1,after_paragraph_number:1,image_path:'target.svg',sort_order:1,alt_text:'Fixture'}];
    await f.page.route('**/storage/v1/**',async r=>{await new Promise(resolve=>setTimeout(resolve,700));await r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"/>'});});
    await f.page.goto(f.base+A);await f.page.waitForSelector('#reader:not(.hidden) #para_1_0_50');await f.page.evaluate(()=>jumpToParagraphOnly('1_0_50'));
    await settled(f.page);await f.page.waitForFunction(()=>[...document.querySelectorAll('#chapter img')].every(i=>i.complete));await f.page.waitForTimeout(350);
    assert(await f.page.evaluate(()=>scrollY>600));assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
