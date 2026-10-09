const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const rows=[{id:101,chapter_id:'real-18',paragraph_number:5,content:'Đoạn một\nDòng tiếp theo'},{id:102,chapter_id:'real-18',paragraph_number:52,content:'Đoạn có ảnh'}];
async function adminPage(){
 const page=await feedPage(0,{fixtures:{chapters:Array.from({length:18},(_,i)=>({id:i===17?'real-18':'chapter-'+i,chapter_number:i+1,story_id:1,title:'Chương '+(i+1),published:true})),paragraphs:rows}});
 await page.evaluate(()=>{authUser={id:'admin-user',user_metadata:{full_name:'Alex'}};memberProfile={display_name:'Alex',role:'admin'};});
 return page;
}
test('cold editor restores raw numbered paragraphs; drafts survive reopening; publish updates IDs in place',async()=>{
 const page=await adminPage();const writes=[];
 try{
  await page.evaluate(async()=>{await openChapterAdmin(1,17);});
  assert.equal(await page.locator('#chapterEditBody').inputValue(),rows.map(r=>r.content).join('\n\n'));
  assert.equal(await page.locator('#chapterEditTitle').inputValue(),'Chương 18');
  assert.equal(await page.evaluate(()=>stories[0].chapters[17]._parasLoaded),false);
  await page.locator('#chapterEditBody').fill('Đoạn một sửa\nDòng tiếp theo\n\nĐoạn có ảnh');
  await page.evaluate(()=>saveChapterDraftNow());
  await page.evaluate(async()=>{await openChapterAdmin(1,17);});
  assert.equal(await page.locator('#chapterEditBody').inputValue(),'Đoạn một sửa\nDòng tiếp theo\n\nĐoạn có ảnh');
  await page.route('**/rest/v1/**',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(req.method()==='PATCH'){
    writes.push({table:url.pathname.split('/').pop(),id:url.searchParams.get('id'),chapter:url.searchParams.get('chapter_id'),body:req.postDataJSON()});
    if(url.pathname.endsWith('/paragraphs'))rows.find(r=>'eq.'+r.id===url.searchParams.get('id')).content=req.postDataJSON().content;
    return route.fulfill({status:204,body:''});
   }
   return route.fallback();
  });
  await page.evaluate(async()=>{await publishManagedChapter();});
  assert.deepEqual(writes,[{table:'paragraphs',id:'eq.101',chapter:'eq.real-18',body:{content:'Đoạn một sửa\nDòng tiếp theo'}},{table:'chapters',id:'eq.real-18',chapter:null,body:{title:'Chương 18'}}]);
  assert.equal(await page.evaluate(()=>stories[0].chapters[17].publishState),'published');
  assert.deepEqual(await page.evaluate(()=>stories[0].chapters[17]._paragraphNumbers),[null,5,52]);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('new in-memory draft needs no cloud paragraph load and retains existing draft save',async()=>{
 const page=await adminPage();
 try{
  await page.evaluate(async()=>{managedDrafts=[{id:'draft-new',title:'Bản nháp',chapters:[{title:'Chương nháp',paras:['Nội dung nháp'],publishState:'draft'}]}];await openChapterAdmin('draft-new',0);});
  assert.equal(await page.locator('#chapterEditBody').inputValue(),'Nội dung nháp');
  await page.locator('#chapterEditBody').fill('Nội dung mới\n\nĐoạn mới');
  await page.evaluate(()=>saveChapterDraftNow());
  assert.deepEqual(await page.evaluate(()=>managedDrafts[0].chapters[0].paras),['Nội dung mới','Đoạn mới']);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('load failure blocks empty save; changed paragraph boundaries block publishing without writes',async()=>{
 const page=await adminPage();let writes=0;
 try{
  await page.route('**/rest/v1/paragraphs**',route=>route.fulfill({status:500,contentType:'application/json',body:'{"message":"Load failed"}'}));
  await page.evaluate(async()=>{await openChapterAdmin(1,17);saveChapterDraftNow();});
  assert(await page.locator('#chapterEditBody').isDisabled());
  assert.equal(await page.evaluate(()=>stories[0].chapters[17].publishState),'published');
  await page.unroute('**/rest/v1/paragraphs**');
  await page.evaluate(async()=>{await openChapterAdmin(1,17);});
  await page.route('**/rest/v1/**',route=>{if(route.request().method()==='PATCH')writes++;return route.fallback();});
  await page.locator('#chapterEditBody').fill('Gộp thành một đoạn');
  await page.evaluate(async()=>{await publishManagedChapter();});
  assert.equal(writes,0);
  assert.match(await page.locator('#chapterAutosaveState').textContent(),/giữ nguyên số đoạn/);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('editor loads every page beyond the Supabase thousand-row limit',async()=>{
 const page=await adminPage();const offsets=[];
 try{
  await page.route('**/rest/v1/paragraphs**',route=>{
   const url=new URL(route.request().url()),offset=Number(url.searchParams.get('offset')||0);offsets.push(offset);
   const count=offset===0?1000:1;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Array.from({length:count},(_,i)=>({id:offset+i,chapter_id:'real-18',paragraph_number:offset+i+1,content:'Đoạn '+(offset+i+1)})))});
  });
  await page.evaluate(async()=>{await openChapterAdmin(1,17);});
  assert.deepEqual(offsets,[0,1000]);
  assert.equal((await page.locator('#chapterEditBody').inputValue()).split('\n\n').length,1001);
  assert((await page.locator('#chapterEditBody').inputValue()).endsWith('Đoạn 1001'));
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
