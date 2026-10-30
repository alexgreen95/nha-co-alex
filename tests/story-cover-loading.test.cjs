'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const browser=require('./helpers/performance-browser.cjs');
before(browser.start);after(browser.stop);
const storage='https://cwwulyrutdvuekydydew.supabase.co/storage/v1/object/public/';
async function setup({signed=false}={}){
 const f=await browser.fixture({signed}),images=[],uploads=[];
 f.fixtures.stories=Array.from({length:20},(_,i)=>({id:i+1,title:i?'Story '+(i+1):'Audit Story',author:'Alex',published:true,status:i>=15?'completed':'ongoing',main_genre:i%2?'Hiện đại':'Huyền ảo',cover_url:storage+'covers/'+(i+1)+'.svg'}));
 f.fixtures.chapters.push(...Array.from({length:19},(_,i)=>({id:i+3,story_id:i+2,chapter_number:1,title:'Chapter',published:true})));
 f.fixtures.profiles[0].avatar_url=storage+'avatars/reader.svg';
 f.fixtures.reviews=Array.from({length:6},(_,i)=>({id:i+1,story_id:20-i,user_id:'reader',content:'Fixture review',created_at:'2026-10-29T00:00:00Z'}));
 await f.context.route('**/storage/v1/**',async r=>{
  if(r.request().method()!=='GET'){uploads.push(r.request().method());return r.fulfill({status:400,json:{message:'unexpected fixture upload'}});}
  images.push(new URL(r.request().url()).pathname);
  return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="silver"/></svg>'});
 });
 return Object.assign(f,{images,uploads});
}
const covers=f=>f.images.filter(p=>p.includes('/covers/'));
async function ready(p,selector='#stories img'){await p.waitForFunction(selector=>[...document.querySelectorAll(selector)].length>0&&[...document.querySelectorAll(selector)].every(i=>i.hasAttribute('src')&&i.complete&&i.naturalWidth>0),selector);await p.waitForTimeout(150);}
test('mobile Home mounts six cards; hidden/review covers wait until explicitly revealed',async()=>{
 const f=await setup();try{
  await f.page.goto(f.base+'/');await ready(f.page);await f.page.waitForTimeout(350);
  assert.equal(await f.page.locator('#stories .story-card').count(),6);assert.equal(covers(f).length,6);assert.equal(f.images.filter(p=>p.includes('/avatars/')).length,0);
  await f.page.locator('#moreStoriesBtn').click();await ready(f.page);
  assert.equal(await f.page.locator('#stories .story-card').count(),20);assert.equal(new Set(covers(f)).size,20);
  await f.page.locator('#moreStoriesBtn').click();assert.equal(await f.page.locator('#stories .story-card').count(),6);await ready(f.page);
  await f.page.evaluate(()=>switchHomeTab('reviewsPanel',document.querySelectorAll('.home-tab')[1]));await ready(f.page,'#reviewsPanel img');
  assert.equal(f.images.filter(p=>p.includes('/avatars/')).length,1);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
test('search, sort and filter keep matching covers after bounded rendering',async()=>{
 const f=await setup();try{
  await f.page.goto(f.base+'/');await ready(f.page);await f.page.locator('#q').fill('Story 19');await ready(f.page);
  assert.equal(await f.page.locator('#stories .story-card').count(),1);assert((await f.page.locator('#stories img').getAttribute('src')).endsWith('/19.svg'));
  await f.page.locator('#q').fill('');await f.page.evaluate(()=>{stories.forEach(s=>s.views=s.id);chooseSort({stopPropagation(){}},'views','views_desc','Lượt đọc')});await ready(f.page);
  assert((await f.page.locator('#stories img').first().getAttribute('src')).endsWith('/20.svg'));
  await f.page.evaluate(()=>chooseSort({stopPropagation(){}},'status','completed','Hoàn thành'));await ready(f.page);
  assert.equal(await f.page.locator('#stories .story-card').count(),5);assert.equal(await f.page.locator('#moreStoriesBtn').isVisible(),false);
  assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
for(const signed of [false,true])test('direct reader loads chapter images without catalog covers: '+(signed?'signed':'guest'),async()=>{
 const f=await setup({signed});try{
  f.fixtures.chapter_images=[{id:1,after_paragraph_number:1,image_path:'chapter.svg',sort_order:1,alt_text:'Fixture'}];
  await f.page.goto(f.base+'/truyen/audit-story/chuong-1');await ready(f.page,'#chapter img');await f.page.waitForTimeout(450);
  assert.equal(covers(f).length,0);assert.equal(f.images.filter(p=>p.includes('/story-images/')).length,1);
  assert.equal(f.images.filter(p=>p.includes('/avatars/')).length,signed?1:0);
  assert.equal(await f.page.locator('#home').evaluate(e=>e.classList.contains('hidden')),true);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
test('direct intro/profile and library only activate their own images',async()=>{
 const f=await setup({signed:true});try{
  await f.page.goto(f.base+'/truyen/story-20');await ready(f.page,'#introCover img');await f.page.waitForTimeout(300);
  assert.deepEqual(covers(f),['/storage/v1/object/public/covers/20.svg']);
  await f.page.goto(f.base+'/user/reader');await ready(f.page,'#profileAvatar');await f.page.waitForTimeout(300);
  assert.equal(covers(f).length,1);
  await f.page.evaluate(()=>show('library'));await ready(f.page,'#saved img');
  assert.equal(await f.page.locator('#saved .story-card').count(),1);assert((await f.page.locator('#saved img').getAttribute('src')).endsWith('/1.svg'));assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
test('future cover uploads reject oversized/invalid files before any Storage upload, keeping GIF bytes supported',async()=>{
 const f=await setup();try{
  await f.page.goto(f.base+'/');await ready(f.page);
  const result=await f.page.evaluate(async()=>{
   const input=document.getElementById('manageCover'),d=new DataTransfer();d.items.add(new File([new Uint8Array(16*1024*1024)],'huge.jpg',{type:'image/jpeg'}));input.files=d.files;
   let message='';try{await uploadManagedCover(2)}catch(e){message=e.message}
   return {message,note:document.getElementById('manageCoverNote').textContent,invalid:coverUploadError(new File(['text'],'cover.txt',{type:'text/plain'})),gif:coverUploadError(new File(['GIF89a'],'cover.gif',{type:'image/gif'})),limit:coverUploadError(new File([new Uint8Array(2*1024*1024)],'cover.png',{type:'image/png'}))};
  });
  assert.match(result.message,/2 MB/);assert.equal(result.message,result.note);assert(result.invalid);assert.equal(result.gif,'');assert.equal(result.limit,'');assert.deepEqual(f.uploads,[]);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
