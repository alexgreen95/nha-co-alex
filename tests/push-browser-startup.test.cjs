'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
for(const width of [375,1280])test('app startup/auth/detail remain usable with unsupported local push origin at '+width,async()=>{
 const requests=[];const page=await feedPage(0,{initScript:"window.pushPermissionCalls=0; if(window.Notification)Notification.requestPermission=()=>{window.pushPermissionCalls++;throw new Error('AUTOMATIC_PERMISSION_FORBIDDEN')}",onRequest:(url,req)=>requests.push(url.pathname)});
 try{
  await page.setViewportSize({width,height:950});
  for(const theme of ['light','pastel','night']){
   await page.evaluate(theme=>{setTheme(theme);openStory(1)},theme);
   assert.equal(await page.locator('.intro-tabs button').count(),3);
   assert.deepEqual(await page.locator('.intro-tabs button').allTextContents(),['Giới thiệu','Review','Danh sách chương']);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal(await page.evaluate(()=>typeof pushLifecycle.initialize),'function');
   assert.equal(await page.evaluate(async()=>{await pushLifecycle.initialize();return pushLifecycle.getState().status}),'UNSUPPORTED');
  }
  await page.evaluate(async()=>{applyAuthUser({id:'offline-account',user_metadata:{name:'Offline'}});await new Promise(r=>setTimeout(r,10));});
  assert.equal(await page.locator('#accountName').textContent(),'Offline');
  await page.evaluate(async()=>{await signOut()});
  assert.equal(await page.evaluate(()=>authUser),null);
  assert.equal(await page.evaluate(()=>window.pushPermissionCalls),0);
  assert(!requests.some(path=>path.startsWith('/api/push-')));
  assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
for(const fail of [false,true])test('current app signOut preserves Supabase sign-out after push cleanup '+(fail?'failure':'success'),async()=>{
 const source=fs.readFileSync('index.html','utf8'),start=source.indexOf('async function signOut(){'),end=source.indexOf('let memberProfile=null;',start),events=[];
 const ctx={pushLifecycle:{prepareLogout:async()=>{events.push('push');if(fail)throw Error('synthetic')}},authAccount:{owner:'offline'},sb:{auth:{signOut:async()=>{events.push('auth');return {error:null}}}},applyAuthUser:u=>events.push(u===null?'clear':'invalid'),show:page=>events.push(page),console:{warn:()=>assert.fail('must not log push errors')}};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end)+';this.run=signOut;',ctx);await ctx.run();assert.deepEqual(events,['push','auth','clear','home']);
});
