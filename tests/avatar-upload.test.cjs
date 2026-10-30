'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),formats=require('./fixtures/avatar-formats.json');
const browser=require('./helpers/performance-browser.cjs');before(browser.start);after(browser.stop);
const publicBase='https://cwwulyrutdvuekydydew.supabase.co/storage/v1/object/public/avatars/';
const original='reader/original.png';
async function setup(){
 const f=await browser.fixture({signed:true}),uploads=[],updates=[],objects=new Map(),control={uploadFail:false,profileFail:false,hold:null};
 f.fixtures.profiles[0].avatar_url=publicBase+original;
 f.fixtures.comments=[{id:'1',story_id:1,user_id:'reader',scope:'chapter',chapter_index:0,paragraph_index:null,parent_id:null,content:'Avatar fixture',created_at:'2026-10-29T00:00:00Z'}];
 await f.context.route('**/storage/v1/**',async route=>{
  const request=route.request(),key=decodeURIComponent(new URL(request.url()).pathname.split('/avatars/')[1]||'');
  if(request.method()==='GET'){
   const file=objects.get(key);
   return file?route.fulfill({contentType:file.type,body:file.bytes}):route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="pink"/></svg>'});
  }
  assert.equal(request.method(),'POST','this flow must not delete or overwrite existing avatars');
  const response=new Response(request.postDataBuffer(),{headers:{'content-type':request.headers()['content-type']}}),form=await response.formData();
  const file=[...form.values()].find(v=>typeof v?.arrayBuffer==='function');assert(file);
  const data={key,type:file.type,bytes:Buffer.from(await file.arrayBuffer()),upsert:request.headers()['x-upsert']};uploads.push(data);
  if(control.hold)await control.hold;
  if(control.uploadFail)return route.fulfill({status:503,json:{message:'fixture upload failure'}});
  objects.set(key,data);return route.fulfill({status:200,json:{Key:'avatars/'+key}});
 });
 await f.context.route(url=>url.pathname.endsWith('/profiles'),async route=>{
  if(route.request().method()!=='PATCH')return route.fallback();
  const row=route.request().postDataJSON();updates.push(row);
  if(control.profileFail)return route.fulfill({status:403,json:{message:'fixture profile failure'}});
  Object.assign(f.fixtures.profiles[0],row);return route.fulfill({status:200,json:f.fixtures.profiles[0]});
 });
 await f.page.goto(f.base+'/');await f.page.waitForFunction(()=>authAccount?.profileReady&&authAccount?.memberReady);
 await f.page.evaluate(()=>openProfile('edit'));await f.page.waitForSelector('#editAvatarFile',{state:'attached'});
 return Object.assign(f,{uploads,updates,objects,control});
}
async function select(page,{width=2048,height=1536,type='image/jpeg',alpha=false,noise=true}={}){
 return page.evaluate(async({width,height,type,alpha,noise})=>{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
  if(noise){const d=ctx.createImageData(width,height);let seed=123;for(let i=0;i<d.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)|0;d.data[i]=seed&255;d.data[i+1]=seed>>>8&255;d.data[i+2]=seed>>>16&255;d.data[i+3]=255}ctx.putImageData(d,0,0)}
  else{ctx.fillStyle='red';ctx.fillRect(0,0,alpha?width/2:width,height)}
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,.95)),file=new File([blob],'input.'+(type==='image/jpeg'?'jpg':'png'),{type});
  const transfer=new DataTransfer();transfer.items.add(file);const input=document.getElementById('editAvatarFile');input.files=transfer.files;previewProfileAvatar(input);return {bytes:file.size,width,height};
 },{width,height,type,alpha,noise});
}
async function imageInfo(page,base64,type){return page.evaluate(async({base64,type})=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type}));const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);const pixel=[...canvas.getContext('2d').getImageData(image.width-1,0,1,1).data];return {width:image.width,height:image.height,pixel};},{base64,type});}
async function readyImage(page,selector){await page.waitForFunction(selector=>{const img=document.querySelector(selector);return img?.hasAttribute('src')&&img.complete&&img.naturalWidth>0},selector);}
test('large static avatar is resized/encoded before one upload; updated URL renders across surfaces',async()=>{
 const f=await setup();try{
  const before=await select(f.page);assert(before.bytes>1024*1024);await f.page.evaluate(()=>saveProfileChanges());
  assert.equal(f.uploads.length,1);assert.equal(f.updates.length,1);const file=f.uploads[0],url=publicBase+file.key;
  assert(file.bytes.length<=200*1024);assert.equal(file.type,'image/webp');assert(file.key.endsWith('.webp'));assert.notEqual(file.key,original);assert.notEqual(file.upsert,'true');
  const info=await imageInfo(f.page,file.bytes.toString('base64'),file.type);assert.equal(info.width,512);assert.equal(info.height,384);assert.equal(f.fixtures.profiles[0].avatar_url,url);
  await readyImage(f.page,'#accountAvatar');assert.equal(await f.page.locator('#accountAvatar').getAttribute('src'),url);
  await f.page.reload();await f.page.waitForFunction(()=>authAccount?.memberReady);await f.page.evaluate(()=>openProfile('profile'));await readyImage(f.page,'#profileAvatar');assert.equal(await f.page.locator('#profileAvatar').getAttribute('src'),url);
  await f.page.evaluate(()=>read(1,0));await f.page.waitForSelector('#chapterCommentsList .comment-item');await f.page.locator('#chapterCommentsList .comment-item').scrollIntoViewIfNeeded();await readyImage(f.page,'#chapterCommentsList .comment-avatar img');
  assert.equal(await f.page.locator('#chapterCommentsList .comment-avatar img').first().getAttribute('src'),url);
  await f.page.evaluate(url=>{document.getElementById('notifList').innerHTML=notificationRowMarkup({id:'1',type:'mention',actor_id:'reader',story_id:1,comment_id:'1'}, {reader:{display_name:'Reader',avatar_url:url}});document.getElementById('notifPanel').classList.add('open')},url);
  await readyImage(f.page,'#notifList .notif-actor-avatar');assert.equal(await f.page.locator('#notifList .notif-actor-avatar').getAttribute('src'),url);
  await f.page.evaluate(()=>openProfile('activity'));await readyImage(f.page,'#profileAvatar');assert.equal(await f.page.locator('#profileAvatar').getAttribute('src'),url);
  console.log(JSON.stringify({scenario:'synthetic JPEG avatar',before:before.bytes,after:file.bytes.length,width:info.width,height:info.height,savedPercent:Math.round((1-file.bytes.length/before.bytes)*100)}));assert.deepEqual(f.errors,[]);
 }finally{await f.close()}
});
test('small transparent avatar is not upscaled or re-encoded unnecessarily',async()=>{
 const f=await setup();try{const input=await select(f.page,{width:64,height:64,type:'image/png',alpha:true,noise:false});await f.page.evaluate(()=>saveProfileChanges());const file=f.uploads[0],info=await imageInfo(f.page,file.bytes.toString('base64'),file.type);assert.equal(file.type,'image/png');assert.equal(file.bytes.length,input.bytes);assert.equal(info.width,64);assert.equal(info.pixel[3],0);assert.deepEqual(f.errors,[]);}finally{await f.close()}
});
for(const alpha of [false,true])test('browser without WebP encoder preserves '+(alpha?'transparency via PNG':'opaque image via JPEG'),async()=>{
 const f=await setup();try{await f.page.evaluate(()=>{const raw=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){return raw.call(this,callback,type==='image/webp'?'image/png':type,quality)}});await select(f.page,{width:1024,height:768,type:'image/png',alpha,noise:false});await f.page.evaluate(()=>saveProfileChanges());const file=f.uploads[0],info=await imageInfo(f.page,file.bytes.toString('base64'),file.type);assert.equal(file.type,alpha?'image/png':'image/jpeg');assert.equal(info.width,512);assert.equal(info.height,384);assert(file.bytes.length<=200*1024);if(alpha)assert.equal(info.pixel[3],0);assert.deepEqual(f.errors,[]);}finally{await f.close()}
});
test('EXIF portrait orientation is retained',async()=>{
 const f=await setup();try{await f.page.evaluate(base64=>{pendingAvatarFile=new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'portrait.jpg',{type:'image/jpeg'})},formats.oriented_jpeg);await f.page.evaluate(()=>saveProfileChanges());const file=f.uploads[0],info=await imageInfo(f.page,file.bytes.toString('base64'),file.type);assert.equal(info.width,256);assert.equal(info.height,512);assert.deepEqual(f.errors,[]);}finally{await f.close()}
});
test('image-element decoder and unique-name fallback work without createImageBitmap/randomUUID',async()=>{
 const f=await setup();try{
  await select(f.page,{width:800,height:600,noise:false});
  await f.page.evaluate(async()=>{const bitmap=createImageBitmap;window.createImageBitmap=undefined;Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});try{await saveProfileChanges()}finally{window.createImageBitmap=bitmap}});
  assert.equal(f.uploads.length,1);assert.match(f.uploads[0].key,/avatar-[a-f0-9]{32}\./);const info=await imageInfo(f.page,f.uploads[0].bytes.toString('base64'),f.uploads[0].type);assert.equal(info.width,512);assert.equal(info.height,384);assert.deepEqual(f.errors,[]);
 }finally{await f.close()}
});
test('unsupported, corrupt, oversized and animated files cannot reach Storage or profile writes',async()=>{
 const f=await setup();try{
  const errors=await f.page.evaluate(async formats=>{
   const files=[new File([new Uint8Array(5*1024*1024+1)],'big.jpg',{type:'image/jpeg'}),new File(['text'],'bad.jpg',{type:'image/jpeg'}),new File(['x'],'bad.heic',{type:'image/heic'}),new File([],'empty.png',{type:'image/png'}),...['png','webp','gif'].map(ext=>new File([Uint8Array.from(atob(formats[ext]),c=>c.charCodeAt(0))],'animated.'+ext,{type:'image/'+ext}))];const result=[];
   for(const file of files){pendingAvatarFile=file;await saveProfileChanges();result.push(document.getElementById('profileEditMessage').textContent)}return result;
  },formats);assert.equal(errors.length,7);assert(errors.every(e=>e&&!e.includes('Đã lưu')));assert.match(errors[0],/5 MB/);assert.match(errors[4],/động/);assert.match(errors[5],/động/);assert.deepEqual(f.uploads,[]);assert.deepEqual(f.updates,[]);assert.equal(f.fixtures.profiles[0].avatar_url,publicBase+original);assert.deepEqual(f.errors,[]);
 }finally{await f.close()}
});
test('two Save calls share one optimized upload and profile update',async()=>{
 const f=await setup();try{await select(f.page,{width:800,height:600,noise:false});const same=await f.page.evaluate(async()=>{const a=saveProfileChanges(),b=saveProfileChanges();const same=a===b;await Promise.all([a,b]);return same});assert(same);assert.equal(f.uploads.length,1);assert.equal(f.updates.length,1);assert.deepEqual(f.errors,[]);}finally{await f.close()}
});
test('changing selection during optimization cancels the old write',async()=>{
 const f=await setup();try{await select(f.page,{width:800,height:600,noise:false});await f.page.evaluate(()=>{const raw=NcaAvatarUpload;let release;const gate=new Promise(r=>release=r);window.releaseAvatar=release;window.rawAvatar=raw;window.NcaAvatarUpload={...raw,optimize:async file=>{await gate;return raw.optimize(file)}};window.avatarSave=saveProfileChanges()});await select(f.page,{width:900,height:600,type:'image/png',noise:false});await f.page.evaluate(async()=>{releaseAvatar();await avatarSave;NcaAvatarUpload=rawAvatar});assert.equal(f.uploads.length,0);assert.equal(f.updates.length,0);assert.match(await f.page.locator('#profileEditMessage').textContent(),/Ảnh đã thay đổi/);assert.deepEqual(f.errors,[]);}finally{await f.close()}
});
test('account switch during optimization cannot upload or apply the old account avatar',async()=>{
 const f=await setup();try{await select(f.page,{width:800,height:600,noise:false});await f.page.evaluate(()=>{const raw=NcaAvatarUpload;let release;const gate=new Promise(r=>release=r);window.releaseAvatar=release;NcaAvatarUpload={...raw,optimize:async file=>{await gate;return raw.optimize(file)}};window.avatarSave=saveProfileChanges()});await f.page.evaluate(async()=>{applyAuthUser({id:'other',user_metadata:{}});releaseAvatar();await avatarSave});assert.equal(f.uploads.length,0);assert.equal(f.updates.length,0);assert.deepEqual(f.errors,[]);}finally{await f.close()}
});
test('a reopened editor can save its own selection while the previous editor is still optimizing',async()=>{
 const f=await setup();try{
  await select(f.page,{width:800,height:600,noise:false});
  await f.page.evaluate(()=>{const raw=NcaAvatarUpload;let release;const gate=new Promise(r=>release=r);window.releaseAvatar=release;NcaAvatarUpload={...raw,optimize:async file=>{await gate;return raw.optimize(file)}};window.oldEditorSave=saveProfileChanges();openProfile('profile');openProfile('edit')});
  await select(f.page,{width:900,height:600,noise:false});
  await f.page.evaluate(async()=>{const current=saveProfileChanges();window.distinctEditorJobs=current!==oldEditorSave;releaseAvatar();await Promise.all([oldEditorSave,current])});
  assert.equal(await f.page.evaluate(()=>distinctEditorJobs),true);assert.equal(f.uploads.length,1);assert.equal(f.updates.length,1);assert.deepEqual(f.errors,[]);
 }finally{await f.close()}
});
for(const kind of ['uploadFail','profileFail'])test(kind+' preserves the previous profile avatar URL',async()=>{
 const f=await setup();try{f.control[kind]=true;await select(f.page,{width:800,height:600,noise:false});await f.page.evaluate(()=>saveProfileChanges());assert.equal(f.fixtures.profiles[0].avatar_url,publicBase+original);assert.equal(await f.page.evaluate(()=>memberProfile.avatar_url),publicBase+original);assert.equal(f.updates.length,kind==='uploadFail'?0:1);assert.deepEqual(f.errors,[]);}finally{await f.close()}
});
