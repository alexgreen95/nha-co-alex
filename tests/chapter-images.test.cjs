const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
test('chapter images use real row numbers and IDs without changing paragraph keys',async()=>{
 const requests=[];
 const chapterId='chapter-real-uuid';
 const page=await feedPage(0,{onRequest:url=>requests.push(url),fixtures:{
  chapters:[{id:chapterId,story_id:1,title:'Chương ảnh',chapter_number:11,published:true}],
  paragraphs:[{chapter_id:chapterId,paragraph_number:5,content:'Đoạn năm dòng một\nĐoạn năm dòng hai'},{chapter_id:chapterId,paragraph_number:52,content:'Đoạn năm mươi hai'},{chapter_id:chapterId,paragraph_number:70,content:'Đoạn cuối'}],
  chapter_images:[
   {id:2,after_paragraph_number:52,sort_order:2,image_path:'ban-gai-quai-vat/Lobday.gif',alt_text:'Ảnh động'},
   {id:1,after_paragraph_number:52,sort_order:1,image_path:'ban-gai-quai-vat/ch011-after-p052-01.jpeg',alt_text:'Ảnh một'},
   {id:3,after_paragraph_number:5,sort_order:0,image_path:'ban-gai-quai-vat/early.jpeg',alt_text:'Ảnh sớm'},
   {id:4,after_paragraph_number:999,sort_order:0,image_path:'not-a-paragraph.jpeg'}
  ]
 }});
 try{
  // Render a wide test image at all storage paths; GIF URL stays unchanged in the DOM.
  await page.route('**/storage/v1/object/public/story-images/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="pink"/></svg>'}));
  await page.evaluate(async()=>{await read(1,0);});
  const imageRequest=requests.find(url=>url.pathname.endsWith('/chapter_images'));
  assert.equal(imageRequest.searchParams.get('chapter_id'),'eq.'+chapterId);
  assert.equal(imageRequest.searchParams.get('order'),'sort_order.asc');
  assert.deepEqual(await page.evaluate(()=>currentStory.chapters[0].paras),['Đoạn năm dòng một','Đoạn năm dòng hai','Đoạn năm mươi hai','Đoạn cuối']);
  assert.deepEqual(await page.locator('#chapter > .para-wrap').evaluateAll(els=>els.map(el=>el.id)),['para_1_0_0','para_1_0_1','para_1_0_2','para_1_0_3']);
  assert.deepEqual(await page.locator('#chapter > *').evaluateAll(els=>els.map(el=>el.id||el.querySelector('img').alt)),['para_1_0_0','para_1_0_1','Ảnh sớm','para_1_0_2','Ảnh một','Ảnh động','para_1_0_3']);
  const srcs=await page.locator('#chapter .chapter-image img').evaluateAll(els=>els.map(el=>el.src));
  assert(srcs.every(src=>src.includes('/storage/v1/object/public/story-images/ban-gai-quai-vat/')));
  assert(srcs[2].endsWith('/Lobday.gif'));
  assert.equal(await page.locator('#chapter .chapter-image [data-comment-key]').count(),0);
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:844});
   await page.locator('#chapter .chapter-image img').evaluateAll(async imgs=>{await Promise.all(imgs.map(img=>img.decode()));});
   const sizes=await page.locator('#chapter .chapter-image img').evaluateAll(imgs=>imgs.map(img=>{const r=img.getBoundingClientRect(),box=document.getElementById('chapter').getBoundingClientRect();return {w:r.width,h:r.height,left:r.left,right:r.right,boxLeft:box.left,boxRight:box.right};}));
   for(const size of sizes){assert(size.w<=(size.boxRight-size.boxLeft)*2/3+1);assert(Math.abs(size.w/size.h-2)<.01);assert(size.left>=size.boxLeft-1&&size.right<=size.boxRight+1);assert(Math.abs((size.left+size.right)-(size.boxLeft+size.boxRight))<2);}
  }
  const before=requests.filter(url=>url.pathname.endsWith('/chapter_images')).length;
  await page.evaluate(async()=>{await ensureChapterContent(currentStory,0);renderChapter(123);});
  assert.equal(requests.filter(url=>url.pathname.endsWith('/chapter_images')).length,before);
  assert.equal(await page.evaluate(()=>progress[1].scroll),123);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('chapters without image rows preserve normal reader text',async()=>{
 const page=await feedPage(0,{fixtures:{paragraphs:[{paragraph_number:1,content:'Chương không có ảnh'}]}});
 try{await page.evaluate(async()=>{await read(1,0);});assert.equal(await page.locator('#chapter .chapter-image').count(),0);assert.equal(await page.locator('#chapter .para').textContent(),'Chương không có ảnh');assert.deepEqual(page.errors,[]);}finally{await page.close();}
});
