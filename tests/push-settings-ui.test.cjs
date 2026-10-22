'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const keys=['comment','reply','mention','comment_like','new_story','new_chapter'];
const preferenceValue=(revision='0',on=[])=>Object.fromEntries([['revision',revision],...keys.flatMap(k=>[[k+'_enabled',on.includes(k)],[k+'_enabled_since',on.includes(k)?'2026-10-22T02:38:44.669456+00:00':null]])]);
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const init=`(()=>{
 const f=window.pushUIFixture={state:{status:'SETUP_REQUIRED',risk:false,permission:'default'},calls:[],permissions:0,hold:null,fail:false,probe:false,probeRequired:false};
 if(window.Notification)Notification.requestPermission=()=>{f.permissions++;return Promise.resolve('granted')};
 const record=(op,args)=>{f.calls.push({op,args,active:navigator.userActivation.isActive,synchronous:!f.probeRequired||f.probe});if(f.probeRequired&&!f.probe&&['enable','repair'].includes(op))throw Error('ASYNC_GESTURE_CALL');};
 const complete=(op)=>{if(f.fail)return Promise.reject(Error('DO_NOT_DISPLAY_SENSITIVE_DETAIL'));if(f.hold===op)return new Promise((resolve,reject)=>{f.release=()=>{f.hold=null;f.state={...f.state,status:op==='disable'?'DISABLED':op==='initialize'?f.state.status:'ACTIVE'};resolve(f.state)};f.reject=()=>{f.hold=null;reject(Error('DO_NOT_DISPLAY_SENSITIVE_DETAIL'))}});if(op!=='initialize')f.state={...f.state,status:op==='disable'?'DISABLED':'ACTIVE'};return Promise.resolve(f.state)};
 const fake={getState(){record('getState');return f.state},initialize(){record('initialize');return complete('initialize')},enable(){record('enable');Notification.requestPermission();return complete('enable')},repair(){record('repair');Notification.requestPermission();return complete('repair')},disable(args){record('disable',args);return complete('disable')},authChanged(){},prepareLogout(){return Promise.resolve()}};
 Object.defineProperty(window,'NcaPushLifecycle',{configurable:true,set(){},get(){return {create:()=>fake}}});
})();`;
async function fixture(){
 const requests=[],page=await feedPage(0,{initScript:init,onRequest:u=>requests.push(u.pathname)});
 const prefs={calls:[],value:preferenceValue(),getHook:null,setHook:null};
 await page.route('**/rest/v1/rpc/nca_*push_preferences*',async route=>{
  const req=route.request(),name=new URL(req.url()).pathname.split('/').pop();
  if(req.method()==='OPTIONS')return route.fulfill({status:200,headers,body:''});
  const call={name,args:req.postDataJSON(),authorization:req.headers().authorization};prefs.calls.push(call);
  const hook=name==='nca_get_push_preferences'?prefs.getHook:prefs.setHook;
  if(hook)return hook(route,call);
  if(name==='nca_set_push_preferences'){
   prefs.value=preferenceValue(String(BigInt(prefs.value.revision)+1n),keys.filter(k=>call.args['p_'+k+'_enabled']));
  }
  return route.fulfill({status:200,headers,json:prefs.value});
 });
 await page.evaluate(async()=>{
  applyAuthUser({id:'offline-settings-A',user_metadata:{name:'Settings A'}});
  sb.auth.getSession=async()=>({data:{session:authUser?{user:{id:authUser.id},access_token:'offline-fixture-'+authUser.id}:null},error:null});
  await new Promise(r=>setTimeout(r,10));pushUIFixture.calls=[];
 });
 return {page,requests,prefs};
}
async function menu(page){await page.mouse.move(0,0);await page.evaluate(()=>{cancelAccountClose();document.getElementById('accountMenu').classList.remove('open')});await page.locator('.account-trigger').focus();await page.locator('.account-trigger').press('Enter');}
async function open(page,waitCategories=true){await menu(page);await page.locator('#pushSettingsMenuBtn').focus();await page.locator('#pushSettingsMenuBtn').press('Enter');await page.waitForFunction(()=>document.getElementById('pushSettingsDialog').open&&document.getElementById('pushSettingsDialog').getAttribute('data-pending')==='false');if(waitCategories)await page.waitForFunction(()=>document.getElementById('pushCategorySettings').dataset.state!=='loading');}
async function state(page,status,risk=false){await page.evaluate(({status,risk})=>{pushUIFixture.state={status,risk,permission:'default'};pushUIFixture.calls=[]},{status,risk});}
const mutations=page=>page.evaluate(()=>pushUIFixture.calls.filter(x=>['enable','repair','disable'].includes(x.op)));

test('opening focuses the dialog without a transient close-button ring in mobile/desktop themes',async()=>{const {page}=await fixture();try{
 await page.evaluate(()=>{window.settingsFocusTargets=[];document.addEventListener('focusin',event=>settingsFocusTargets.push(event.target.id))});
 for(const width of [375,1280]){await page.setViewportSize({width,height:800});for(const theme of ['light','smoky','dustyrose','mistblue','pastel','night','purplenight']){
  await page.evaluate(theme=>{setTheme(theme);settingsFocusTargets=[]},theme);await open(page);
  const focus=await page.evaluate(()=>{
   const dialog=document.getElementById('pushSettingsDialog'),close=document.getElementById('pushSettingsClose'),d=getComputedStyle(dialog),c=getComputedStyle(close),r=close.getBoundingClientRect();
   return {active:document.activeElement.id,targets:settingsFocusTargets,tabindex:dialog.getAttribute('tabindex'),autofocus:dialog.hasAttribute('autofocus'),dialogOutline:d.outlineStyle,closeOutline:c.outlineWidth,border:c.borderTopWidth,bg:c.backgroundColor,shadow:c.boxShadow,width:r.width,height:r.height};
  });
  assert.equal(focus.active,'pushSettingsDialog');assert.equal(focus.tabindex,'-1');assert(focus.autofocus);assert(!focus.targets.includes('pushSettingsClose'),JSON.stringify({width,theme,targets:focus.targets}));
  assert.equal(focus.dialogOutline,'none');assert.equal(focus.closeOutline,'0px');assert.equal(focus.border,'0px');assert.equal(focus.bg,'rgba(0, 0, 0, 0)');assert.equal(focus.shadow,'none');assert(focus.width>=44&&focus.height>=44);
  await page.locator('#pushSettingsClose').click();
 }}assert.deepEqual(page.errors,[]);
 }finally{await page.close()}});

test('keyboard Tab reaches close with visible focus indication and Escape restores opener focus',async()=>{const {page}=await fixture();try{
 await page.setViewportSize({width:1280,height:800});await open(page);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'pushSettingsDialog');await page.keyboard.press('Tab');
 const focus=await page.locator('#pushSettingsClose').evaluate(e=>{const s=getComputedStyle(e);return {active:e===document.activeElement,visible:e.matches(':focus-visible'),tabindex:e.tabIndex,outline:s.outlineStyle,width:s.outlineWidth,color:s.outlineColor,accent:getComputedStyle(e.closest('dialog')).getPropertyValue('--accent').trim()}});
 assert(focus.active&&focus.visible);assert.equal(focus.tabindex,0);assert.equal(focus.outline,'solid');assert.equal(focus.width,'2px');assert.notEqual(focus.color,'rgba(0, 0, 0, 0)');
 await page.keyboard.press('Escape');assert(!(await page.locator('#pushSettingsDialog').evaluate(e=>e.open)));await page.waitForFunction(()=>document.activeElement?.matches('.account-trigger'));assert.deepEqual(page.errors,[]);
 }finally{await page.close()}});

test('signed-in menu exposes settings; startup/login/account rendering never prompts or mutates',async()=>{const {page,requests}=await fixture();try{
 assert.equal(await page.locator('#pushSettingsMenuBtn').getAttribute('aria-controls'),'pushSettingsDialog');await open(page);
 assert.equal(await page.locator('#pushSettingsAction').textContent(),'Bật thông báo');
 assert.deepEqual(await mutations(page),[]);assert.equal(await page.evaluate(()=>pushUIFixture.permissions),0);assert.equal(await page.evaluate(()=>pushUIFixture.calls.filter(x=>x.op==='initialize').length),1);
 await page.evaluate(()=>{applyAuthUser({id:'offline-settings-B',user_metadata:{name:'Settings B'}})});assert(!(await page.locator('#pushSettingsDialog').evaluate(e=>e.open)));assert.deepEqual(await mutations(page),[]);
 assert(!requests.some(x=>x.startsWith('/api/push-')));assert.deepEqual(page.errors,[]);
 }finally{await page.close()}});

test('all required lifecycle states render fixed safe controls and warnings with read-only opening',async()=>{const {page}=await fixture();try{
 const cases=[['SETUP_REQUIRED','Bật thông báo',false],['ACTIVE','Tắt thông báo',false],['DISABLED','Bật thông báo',false],['REPAIR_REQUIRED','Sửa thông báo',false],['PERMISSION_DENIED',null,false],['HOME_SCREEN_REQUIRED',null,false],['UNSUPPORTED',null,false],['UNSUPPORTED_COORDINATION',null,false],['OLD_ACCOUNT_PUSH_RISK','Sửa thông báo',true],['OUTCOME_UNKNOWN',null,true],['SIGN_IN_REQUIRED',null,false]];
 for(const [status,label,warn] of cases){await state(page,status);await open(page);const button=page.locator('#pushSettingsAction');assert.equal(await button.isVisible(),!!label,status);if(label)assert.equal(await button.textContent(),label);assert.equal(await page.locator('#pushSettingsWarning').isVisible(),warn,status);assert.deepEqual(await mutations(page),[]);assert.equal(await page.evaluate(()=>pushUIFixture.permissions),0);if(status==='HOME_SCREEN_REQUIRED'){const text=await page.locator('#pushSettingsMessage').textContent();assert(text.includes('iPhone/iPad'));assert(text.includes('Màn hình chính'));assert(text.includes('Safari'));}await page.locator('#pushSettingsClose').click();}
 }finally{await page.close()}});

for(const [status,op] of [['SETUP_REQUIRED','enable'],['REPAIR_REQUIRED','repair']])test('explicit '+op+' is called synchronously in the original click stack and trusted activation',async()=>{const {page}=await fixture();try{
 await state(page,status);await open(page);await page.locator('#pushSettingsAction').click();let calls=await mutations(page);assert.equal(calls.length,1);assert.equal(calls[0].op,op);assert.equal(calls[0].active,true);assert.equal(await page.evaluate(()=>pushUIFixture.permissions),1);
 await page.locator('#pushSettingsClose').click();await state(page,status);await open(page);
 await page.evaluate(()=>{pushUIFixture.probeRequired=true;pushUIFixture.probe=true;document.getElementById('pushSettingsAction').click();pushUIFixture.probe=false});
 calls=await mutations(page);assert.equal(calls.length,1);assert.equal(calls[0].op,op);assert.equal(calls[0].synchronous,true);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}});

test('active disable calls exactly disable({disable:true}) and never permission',async()=>{const {page}=await fixture();try{await state(page,'ACTIVE');await open(page);await page.locator('#pushSettingsAction').click();const calls=await mutations(page);assert.deepEqual(calls.map(x=>[x.op,x.args]),[['disable',{disable:true}]]);assert.equal(await page.locator('#pushSettingsAction').textContent(),'Bật thông báo');assert.equal(await page.evaluate(()=>pushUIFixture.permissions),0);}finally{await page.close()}});

test('unknown outcome never offers mutation and only explicit state check initializes once',async()=>{const {page}=await fixture();try{await state(page,'OUTCOME_UNKNOWN',true);await open(page);assert(await page.locator('#pushSettingsWarning').isVisible());assert(!(await page.locator('#pushSettingsAction').isVisible()));await page.locator('#pushSettingsRefresh').click();assert.deepEqual(await mutations(page),[]);assert.equal(await page.evaluate(()=>pushUIFixture.calls.filter(x=>x.op==='initialize').length),2);assert((await page.locator('#pushSettingsWarning').textContent()).includes('Không bật hoặc tắt lại'));}finally{await page.close()}});

test('old-account risk is prominent; repair needs an explicit click and never retries itself',async()=>{const {page}=await fixture();try{await state(page,'OLD_ACCOUNT_PUSH_RISK',true);await open(page);assert.deepEqual(await mutations(page),[]);const warning=await page.locator('#pushSettingsWarning').textContent();assert(warning.includes('tài khoản trước'));assert(warning.includes('cài đặt trình duyệt hoặc thiết bị'));await page.locator('#pushSettingsAction').click();assert.deepEqual((await mutations(page)).map(x=>x.op),['repair']);assert.equal(await page.evaluate(()=>pushUIFixture.permissions),1);}finally{await page.close()}});

test('pending mutation blocks duplicate clicks even after closing/reopening; no automatic retry',async()=>{const {page}=await fixture();try{await open(page);await page.evaluate(()=>pushUIFixture.hold='enable');await page.locator('#pushSettingsAction').click();assert(await page.locator('#pushSettingsAction').isDisabled());await page.evaluate(()=>document.getElementById('pushSettingsAction').click());await page.locator('#pushSettingsClose').click();await menu(page);await page.locator('#pushSettingsMenuBtn').focus();await page.locator('#pushSettingsMenuBtn').press('Enter');assert(await page.locator('#pushSettingsRefresh').isDisabled());assert.equal((await mutations(page)).length,1);await page.evaluate(()=>pushUIFixture.release());await page.waitForFunction(()=>document.getElementById('pushSettingsDialog').getAttribute('data-pending')==='false');assert.equal((await mutations(page)).length,1);assert(!(await page.locator('#pushSettingsAction').isVisible()));assert((await page.locator('#pushSettingsMessage').textContent()).includes('kiểm tra lại'));}finally{await page.close()}});

test('account change closes pending settings and ignores the old completion for new account',async()=>{const {page}=await fixture();try{await open(page);await page.evaluate(()=>pushUIFixture.hold='enable');await page.locator('#pushSettingsAction').click();await page.evaluate(()=>applyAuthUser({id:'offline-settings-B',user_metadata:{name:'Settings B'}}));assert(!(await page.locator('#pushSettingsDialog').evaluate(e=>e.open)));await menu(page);await page.locator('#pushSettingsMenuBtn').focus();await page.locator('#pushSettingsMenuBtn').press('Enter');await page.evaluate(()=>pushUIFixture.release());await page.waitForFunction(()=>document.getElementById('pushSettingsDialog').getAttribute('data-pending')==='false');assert(!(await page.locator('#pushSettingsAction').isVisible()));assert.deepEqual((await mutations(page)).map(x=>x.op),['enable']);await page.evaluate(()=>applyAuthUser(null));assert(!(await page.locator('#pushSettingsDialog').evaluate(e=>e.open)));await page.waitForFunction(()=>document.activeElement.id==='loginBtn');assert.equal(await page.evaluate(()=>document.activeElement.id),'loginBtn');}finally{await page.close()}});

test('rejected mutations show fixed unknown-outcome warning without leaking errors or retrying',async()=>{const {page}=await fixture();try{await open(page);await page.evaluate(()=>pushUIFixture.fail=true);await page.locator('#pushSettingsAction').click();await page.waitForFunction(()=>document.getElementById('pushSettingsDialog').getAttribute('data-pending')==='false');assert(await page.locator('#pushSettingsWarning').isVisible());assert(!(await page.locator('#pushSettingsAction').isVisible()));assert(!(await page.locator('#pushSettingsDialog').textContent()).includes('DO_NOT_DISPLAY'));assert.deepEqual((await mutations(page)).map(x=>x.op),['enable']);assert.deepEqual(page.errors,[]);}finally{await page.close()}});

test('unknown/poisoned state is never echoed as text or HTML; read-only failures stay nonmutating',async()=>{const {page}=await fixture();try{await state(page,'<img src=x onerror=alert(1)>');await open(page);assert.equal(await page.locator('#pushSettingsDialog img').count(),0);assert(!(await page.locator('#pushSettingsDialog').textContent()).includes('<img'));assert(!(await page.locator('#pushSettingsAction').isVisible()));await page.evaluate(()=>pushUIFixture.fail=true);await page.locator('#pushSettingsRefresh').click();assert.deepEqual(await mutations(page),[]);assert.deepEqual(page.errors,[]);}finally{await page.close()}});

test('mobile/desktop settings and menu remain bounded/readable in seven themes; keyboard closes/restores focus',async()=>{const {page}=await fixture();try{
 for(const width of [320,375,430,1280]){await page.setViewportSize({width,height:800});for(const theme of ['light','smoky','dustyrose','mistblue','pastel','night','purplenight']){
  await page.evaluate(theme=>setTheme(theme),theme);await state(page,'OLD_ACCOUNT_PUSH_RISK',true);await open(page);
  const x=await page.evaluate(()=>{const d=document.getElementById('pushSettingsDialog'),r=d.getBoundingClientRect(),w=document.getElementById('pushSettingsWarning'),s=getComputedStyle(w);return {x:r.x,right:r.right,width:r.width,overflow:document.documentElement.scrollWidth>innerWidth,scroll:d.scrollWidth,client:d.clientWidth,color:s.color,bg:s.backgroundColor,buttons:[...d.querySelectorAll('button')].filter(e=>!e.hidden).map(e=>{const q=e.getBoundingClientRect();return {x:q.x,right:q.right,height:q.height}})}});
  assert(!x.overflow);assert(x.x>=15&&x.right<=width-15);assert(x.scroll<=x.client+1);assert.notEqual(x.color,x.bg);for(const b of x.buttons){assert(b.x>=x.x&&b.right<=x.right);assert(b.height>=44);}
  await page.keyboard.press('Escape');assert(!(await page.locator('#pushSettingsDialog').evaluate(e=>e.open)));await page.waitForFunction(()=>document.activeElement?.matches('.account-trigger'));assert(await page.locator('.account-trigger').evaluate(e=>e===document.activeElement));
 }}
 assert.equal(await page.locator('#accountMenu button.logout').getAttribute('onclick'),'signOut()');assert.equal(await page.locator('#accountMenu button[onclick="openProfile(\'saved\')"]').count(),1);assert.deepEqual(await mutations(page),[]);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}});

test('pending public unknown outcome appears promptly without initialize/mutation polling, including reopen',async()=>{const {page}=await fixture();try{
 await open(page);await page.evaluate(()=>pushUIFixture.hold='enable');await page.locator('#pushSettingsAction').click();
 await page.evaluate(()=>pushUIFixture.state={status:'OUTCOME_UNKNOWN',risk:true,permission:'granted'});
 await page.waitForFunction(()=>!document.getElementById('pushSettingsWarning').hidden);
 assert((await page.locator('#pushSettingsWarning').textContent()).includes('Chưa xác định'));assert.equal(await page.locator('#pushSettingsDialog').getAttribute('aria-busy'),null);assert.equal(await page.locator('#pushSettingsWarning').getAttribute('role'),'alert');assert(!(await page.locator('#pushSettingsAction').isVisible()));assert(await page.locator('#pushSettingsRefresh').isDisabled());
 assert.deepEqual((await mutations(page)).map(x=>x.op),['enable']);assert.equal(await page.evaluate(()=>pushUIFixture.calls.filter(x=>x.op==='initialize').length),1);
 await page.locator('#pushSettingsClose').click();const count=await page.evaluate(()=>pushUIFixture.calls.filter(x=>x.op==='getState').length);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>pushUIFixture.calls.filter(x=>x.op==='getState').length),count);
 await menu(page);await page.locator('#pushSettingsMenuBtn').focus();await page.locator('#pushSettingsMenuBtn').press('Enter');assert(await page.locator('#pushSettingsWarning').isVisible());assert(await page.locator('#pushSettingsRefresh').isDisabled());assert.equal(await page.evaluate(()=>pushUIFixture.calls.filter(x=>x.op==='initialize').length),1);assert.equal((await mutations(page)).length,1);
 await page.evaluate(()=>pushUIFixture.release());await page.waitForFunction(()=>document.getElementById('pushSettingsDialog').getAttribute('data-pending')==='false');assert(await page.locator('#pushSettingsWarning').isVisible());assert.equal(await page.locator('#pushSettingsAction').textContent(),'Sửa thông báo');await page.locator('#pushSettingsAction').click();assert.deepEqual((await mutations(page)).map(x=>x.op),['enable','repair']);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}});

test('UI source uses only five approved lifecycle methods, no direct network/storage or permission API; auth cleanup unchanged',()=>{
 const src=fs.readFileSync('assets/push-settings.js','utf8'),methods=[...src.matchAll(/lifecycle\??\.([A-Za-z]+)\(/g)].map(x=>x[1]);assert.deepEqual([...new Set(methods)].sort(),['disable','enable','getState','initialize','repair']);assert(!/\bfetch\s*\(|localStorage|document\.cookie|requestPermission|console\.|setInterval/.test(src));
 const before=cp.execFileSync('git',['show','4b28e72c46b4ecb2f7afddd052642ca33abba128:index.html'],{encoding:'utf8'}),after=fs.readFileSync('index.html','utf8');for(const [start,end] of [['async function signOut(){','let memberProfile=null;'],['function applyAuthUser(user){','function refreshAuthOwnedView(state){'],['function handleAuthState(event,session){','function updateAuthUI(){']])assert.equal(after.slice(after.indexOf(start),after.indexOf(end)),before.slice(before.indexOf(start),before.indexOf(end)));
 for(const file of ['assets/push-lifecycle.js','api/push-subscriptions.js','server/push-api.cjs','push-sw.js','vercel.json'])assert(fs.readFileSync(file).equals(cp.execFileSync('git',['show','4b28e72c46b4ecb2f7afddd052642ca33abba128:'+file])));
});

test('category getter enables six independent fields; toggles never auto-save or invoke lifecycle',async()=>{const {page,prefs}=await fixture();try{
 await state(page,'ACTIVE');await open(page);
 assert.equal(await page.locator('#pushSettingsAction').textContent(),'Tắt thông báo');
 assert.equal(await page.locator('#pushCategoryTitle').textContent(),'Loại thông báo muốn nhận');
 const rows=await page.locator('[data-push-category]').evaluateAll(es=>es.map(e=>({key:e.dataset.pushCategory,unknown:e.indeterminate,disabled:e.disabled,label:e.closest('label').textContent.trim()})));
 assert.deepEqual(rows.map(r=>r.key),keys);assert.deepEqual(rows.map(r=>r.label),['Bình luận','Trả lời','Nhắc đến bạn','Tim bình luận','Truyện mới','Chương mới']);assert(rows.every(r=>!r.unknown&&!r.disabled));
 assert.deepEqual(prefs.calls.map(c=>c.name),['nca_get_push_preferences']);assert.deepEqual(prefs.calls[0].args,{});
 assert(await page.locator('#pushCategorySave').isDisabled());
 await page.locator('[data-push-category="new_story"]').check();assert(await page.locator('#pushCategorySave').isEnabled());
 assert.equal(prefs.calls.length,1);assert.deepEqual(await mutations(page),[]);assert.equal(await page.evaluate(()=>pushUIFixture.permissions),0);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}});

test('categories clear at account switch and anonymous cannot read or save even through stale DOM',async()=>{const {page,prefs}=await fixture();try{
 await open(page);await page.locator('[data-push-category="new_story"]').check();
 await page.evaluate(()=>applyAuthUser({id:'offline-settings-B',user_metadata:{name:'Settings B'}}));assert(!(await page.locator('#pushSettingsDialog').evaluate(e=>e.open)));
 await open(page);assert(!(await page.locator('[data-push-category="new_story"]').isChecked()));
 await page.evaluate(()=>applyAuthUser(null));const before=prefs.calls.length;
 await page.evaluate(()=>{openPushNotificationSettings();document.getElementById('pushCategorySave').dispatchEvent(new Event('click',{bubbles:true}))});
 assert(!(await page.locator('#pushCategorySettings').isVisible()));assert(await page.locator('#pushCategorySave').isDisabled());assert.equal(prefs.calls.length,before);assert.deepEqual(await mutations(page),[]);assert.equal(await page.evaluate(()=>pushUIFixture.permissions),0);
 }finally{await page.close()}});

test('device disable leaves account preferences/draft untouched and performs no preference setter',async()=>{const {page,prefs}=await fixture();try{
 await state(page,'ACTIVE');await open(page);await page.locator('[data-push-category="mention"]').check();
 const before=await page.locator('[data-push-category]').evaluateAll(es=>es.map(e=>[e.dataset.pushCategory,e.checked,e.disabled]));const count=prefs.calls.length;
 await page.locator('#pushSettingsAction').click();assert.deepEqual((await mutations(page)).map(x=>x.op),['disable']);
 assert.deepEqual(await page.locator('[data-push-category]').evaluateAll(es=>es.map(e=>[e.dataset.pushCategory,e.checked,e.disabled])),before);assert(await page.locator('#pushCategorySave').isEnabled());assert.equal(prefs.calls.length,count);
 }finally{await page.close()}});

test('category rows fit iPhone widths and close is a box-free 44px target in all seven themes',async()=>{const {page}=await fixture();try{
 for(const width of [320,375,390,430]){await page.setViewportSize({width,height:750});for(const theme of ['light','smoky','dustyrose','mistblue','pastel','night','purplenight']){
  await page.evaluate(theme=>setTheme(theme),theme);await open(page);
  const x=await page.evaluate(()=>{const d=document.getElementById('pushSettingsDialog'),r=d.getBoundingClientRect(),c=document.getElementById('pushSettingsClose'),s=getComputedStyle(c),q=c.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,scroll:d.scrollWidth,client:d.clientWidth,left:r.left,right:r.right,close:{width:q.width,height:q.height,bg:s.backgroundColor,border:s.borderTopWidth,shadow:s.boxShadow},rows:[...d.querySelectorAll('.push-category-row')].map(e=>{const t=e.querySelector('input'),l=e.querySelector('span'),a=t.getBoundingClientRect(),b=l.getBoundingClientRect();return {labelRight:b.right,toggleLeft:a.left,toggleRight:a.right,unknown:t.indeterminate,disabled:t.disabled}})}});
  assert(!x.overflow);assert(x.scroll<=x.client+1);assert(x.left>=15&&x.right<=width-15);assert.equal(x.close.bg,'rgba(0, 0, 0, 0)');assert.equal(x.close.border,'0px');assert.equal(x.close.shadow,'none');assert(x.close.width>=44&&x.close.height>=44);for(const row of x.rows){assert(row.labelRight<=row.toggleLeft);assert(row.toggleRight<x.right);assert(!row.unknown&&!row.disabled)}
  await page.locator('#pushSettingsClose').click();assert(!(await page.locator('#pushSettingsDialog').evaluate(e=>e.open)));await page.waitForFunction(()=>document.activeElement?.matches('.account-trigger'));
 }}assert.deepEqual(page.errors,[]);
 }finally{await page.close()}});

test('closed preference contract is durable; lifecycle/auth/server/worker sources remain unchanged',()=>{
 const doc=fs.readFileSync('docs/push-category-preferences-contract-v1.md','utf8');assert(doc.includes('CONTRACT CLOSED'));assert(doc.includes('2026-10-22T02:38:44.669456+00:00'));assert(doc.includes('Client-side safety rules'));
 for(const file of ['assets/push-lifecycle.js','push-sw.js','api/push-config.js','api/push-subscriptions.js','server/push-api.cjs','server/push-db.cjs','server/personal-push-worker.cjs','server/personal-push-transport.cjs','vercel.json'])assert(fs.readFileSync(file).equals(cp.execFileSync('git',['show','5691c7c6cb6c0341653972c7335e49151faf57a4:'+file])));
});

const waitCategory=(page,state)=>page.waitForFunction(state=>document.getElementById('pushCategorySettings').dataset.state===state,state);
const tick=page=>page.waitForLoadState('networkidle');

test('exact seven setter keys, six independent values, pinned existing session and lossless bigint CAS',async()=>{const {page,prefs}=await fixture();try{
 prefs.value=preferenceValue('9007199254740993',['reply','new_chapter']);await open(page);
 await page.locator('[data-push-category="comment"]').check();await page.locator('[data-push-category="comment_like"]').check();
 assert.equal(prefs.calls.length,1);await page.locator('#pushCategorySave').click();await waitCategory(page,'success');
 const save=prefs.calls.find(c=>c.name==='nca_set_push_preferences');
 assert.deepEqual(save.args,{p_expected_revision:'9007199254740993',p_comment_enabled:true,p_reply_enabled:true,p_mention_enabled:false,p_comment_like_enabled:true,p_new_story_enabled:false,p_new_chapter_enabled:true});
 assert.equal(save.authorization,'Bearer offline-fixture-offline-settings-A');assert.equal(typeof save.args.p_expected_revision,'string');
 assert.equal(prefs.value.revision,'9007199254740994');assert((await page.locator('#pushCategoryStatus').textContent()).includes('Đã lưu'));
 await page.locator('[data-push-category="mention"]').check();await page.locator('#pushCategorySave').click();await waitCategory(page,'success');
 assert.equal(prefs.calls.filter(c=>c.name==='nca_set_push_preferences')[1].args.p_expected_revision,'9007199254740994');
 assert.deepEqual(await mutations(page),[]);assert.equal(await page.evaluate(()=>pushUIFixture.permissions),0);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}});

test('missing-row getter representation is accepted without manufacturing defaults',async()=>{const {page,prefs}=await fixture();try{
 prefs.value=preferenceValue();await open(page);
 assert.deepEqual(await page.locator('[data-push-category]').evaluateAll(es=>es.map(e=>[e.checked,e.indeterminate,e.disabled])),keys.map(()=>[false,false,false]));
 await page.locator('[data-push-category="new_chapter"]').check();await page.locator('#pushCategorySave').click();await waitCategory(page,'success');
 assert.equal(prefs.calls[1].args.p_expected_revision,'0');assert.equal(prefs.calls[1].args.p_new_chapter_enabled,true);
 }finally{await page.close()}});

test('response validator rejects malformed envelopes, noncanonical bigint and invalid timestamp/calendar values',()=>{
 const {parsePreferences}=require('../assets/push-settings.js');
 assert.equal(parsePreferences(preferenceValue('9223372036854775807')).revision,'9223372036854775807');
 for(const revision of [0,9007199254740992,null,'','00','01','+1','-1','1.0',' 1','1 ','1e3','9223372036854775808','9'.repeat(100)])assert.throws(()=>parsePreferences({...preferenceValue(),revision}));
 for(const value of [null,[],{},JSON.stringify(preferenceValue()),{...preferenceValue(),extra:true},Object.assign(Object.create(null),preferenceValue())])assert.throws(()=>parsePreferences(value));
 for(const key of keys){
  const missing=preferenceValue();delete missing[key+'_enabled'];assert.throws(()=>parsePreferences(missing));
  for(const value of [null,0,1,'false',[],{}])assert.throws(()=>parsePreferences({...preferenceValue(),[key+'_enabled']:value}));
  for(const value of [0,false,{},[],'infinity','2026-02-30T00:00:00Z','2026-13-01T00:00:00Z','2026-01-01T24:00:00Z','2026-01-01T00:00:60Z','2026-01-01','2026-01-01T00:00:00+99:99',' 2026-01-01T00:00:00Z'])assert.throws(()=>parsePreferences({...preferenceValue(),[key+'_enabled_since']:value}));
 }
 for(const timestamp of ['2024-02-29T00:00:00Z','2026-10-22T02:38:44.669456+00:00','2026-10-22T09:38:44+07:00'])assert.equal(parsePreferences({...preferenceValue(),mention_enabled_since:timestamp}).mention_enabled_since,timestamp);
});

test('malformed getter fails closed with indeterminate disabled fields, no fallback save or internal text',async()=>{const {page,prefs}=await fixture();try{
 prefs.value={...preferenceValue(),mention_enabled:'DO_NOT_DISPLAY_INTERNAL_DETAIL'};await open(page);await waitCategory(page,'error');
 assert(await page.locator('#pushCategorySave').isDisabled());assert(await page.locator('[data-push-category="mention"]').evaluate(e=>e.indeterminate&&e.disabled));
 assert(!(await page.locator('#pushCategorySettings').textContent()).includes('DO_NOT_DISPLAY'));
 await page.evaluate(()=>document.getElementById('pushCategorySave').dispatchEvent(new Event('click')));
 assert.equal(prefs.calls.length,1);assert.deepEqual(await mutations(page),[]);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}});

test('malformed setter success is unconfirmed and reconciled by one getter without mutation replay',async()=>{const {page,prefs}=await fixture();try{
 await open(page);prefs.setHook=route=>{prefs.value=preferenceValue('1',['comment']);return route.fulfill({status:200,headers,json:{...prefs.value,revision:1}})};
 await page.locator('[data-push-category="comment"]').check();await page.locator('#pushCategorySave').click();await waitCategory(page,'unknown');
 assert.deepEqual(prefs.calls.map(c=>c.name),['nca_get_push_preferences','nca_set_push_preferences','nca_get_push_preferences']);
 assert(!(await page.locator('#pushCategoryStatus').textContent()).includes('Đã lưu'));assert(await page.locator('[data-push-category="comment"]').isChecked());assert(await page.locator('#pushCategorySave').isDisabled());
 assert.deepEqual(await mutations(page),[]);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}});

test('setter response with wrong increment or values is never accepted as confirmed',async()=>{const {page,prefs}=await fixture();try{
 for(const bad of [preferenceValue('2',['comment']),preferenceValue('1',[])]){
  prefs.value=preferenceValue();prefs.setHook=route=>route.fulfill({status:200,headers,json:bad});await open(page);
  await page.locator('[data-push-category="comment"]').check();await page.locator('#pushCategorySave').click();await waitCategory(page,'unknown');
  assert(!(await page.locator('#pushCategoryStatus').textContent()).includes('Đã lưu'));await page.locator('#pushSettingsClose').click();
 }
 assert.equal(prefs.calls.filter(c=>c.name==='nca_set_push_preferences').length,2);
 }finally{await page.close()}});

test('PT409 refreshes authoritative state/revision once, discards draft and requires another explicit save',async()=>{const {page,prefs}=await fixture();try{
 await open(page);prefs.setHook=route=>{prefs.value=preferenceValue('5',['reply']);return route.fulfill({status:409,headers,json:{code:'PT409',message:'DO_NOT_DISPLAY_INTERNAL_DETAIL'}})};
 await page.locator('[data-push-category="comment"]').check();await page.locator('#pushCategorySave').click();await waitCategory(page,'conflict');
 assert.deepEqual(prefs.calls.map(c=>c.name),['nca_get_push_preferences','nca_set_push_preferences','nca_get_push_preferences']);
 assert(!(await page.locator('[data-push-category="comment"]').isChecked()));assert(await page.locator('[data-push-category="reply"]').isChecked());
 assert((await page.locator('#pushCategoryStatus').textContent()).includes('nơi khác'));assert(!(await page.locator('#pushCategoryStatus').textContent()).includes('DO_NOT_DISPLAY'));
 prefs.setHook=null;await page.locator('[data-push-category="mention"]').check();await page.locator('#pushCategorySave').click();await waitCategory(page,'success');
 assert.equal(prefs.calls.filter(c=>c.name==='nca_set_push_preferences')[1].args.p_expected_revision,'5');assert.deepEqual(await mutations(page),[]);
 }finally{await page.close()}});

for(const code of ['40001','40P01'])test(code+' never triggers an application business-conflict retry',async()=>{const {page,prefs}=await fixture();try{
 await open(page);prefs.setHook=route=>route.fulfill({status:500,headers,json:{code,message:'DO_NOT_DISPLAY_INTERNAL_DETAIL'}});
 await page.locator('[data-push-category="mention"]').check();await page.locator('#pushCategorySave').click();await waitCategory(page,'unknown');
 assert.equal(prefs.calls.filter(c=>c.name==='nca_set_push_preferences').length,1);assert.equal(prefs.calls.filter(c=>c.name==='nca_get_push_preferences').length,2);
 assert(!(await page.locator('#pushCategoryStatus').textContent()).includes(code));assert.deepEqual(await mutations(page),[]);
 }finally{await page.close()}});

test('ambiguous network failure performs one getter, never claims save succeeded and never retries setter',async()=>{const {page,prefs}=await fixture();try{
 await open(page);prefs.setHook=route=>{prefs.value=preferenceValue('1',['mention']);return route.abort('failed')};
 await page.locator('[data-push-category="mention"]').check();await page.locator('#pushCategorySave').click();await waitCategory(page,'unknown');
 assert.equal(prefs.calls.filter(c=>c.name==='nca_set_push_preferences').length,1);assert.equal(prefs.calls.filter(c=>c.name==='nca_get_push_preferences').length,2);
 assert(await page.locator('[data-push-category="mention"]').isChecked());assert(!(await page.locator('#pushCategoryStatus').textContent()).includes('Đã lưu'));assert.deepEqual(await mutations(page),[]);
 }finally{await page.close()}});

test('failed reconciliation clears authority and leaves controls disabled without loops',async()=>{const {page,prefs}=await fixture();try{
 await open(page);prefs.setHook=route=>{prefs.getHook=r=>r.fulfill({status:503,headers,json:{message:'DO_NOT_DISPLAY_INTERNAL_DETAIL'}});return route.abort('failed')};
 await page.locator('[data-push-category="mention"]').check();await page.locator('#pushCategorySave').click();await waitCategory(page,'error');
 assert.equal(prefs.calls.length,3);assert(await page.locator('#pushCategorySave').isDisabled());assert(await page.locator('[data-push-category="mention"]').evaluate(e=>e.indeterminate&&e.disabled));
 assert(!(await page.locator('#pushCategoryStatus').textContent()).includes('DO_NOT_DISPLAY'));
 }finally{await page.close()}});

test('delayed read is discarded across A to B to A account generations',async()=>{const {page,prefs}=await fixture();const gate=deferred();try{
 prefs.getHook=async route=>{await gate.promise;return route.fulfill({status:200,headers,json:preferenceValue('88',['comment'])})};
 await open(page,false);await page.waitForFunction(()=>document.getElementById('pushCategorySettings').dataset.state==='loading');
 await page.evaluate(()=>applyAuthUser({id:'offline-settings-B',user_metadata:{name:'B'}}));
 prefs.getHook=null;await open(page);assert(!(await page.locator('[data-push-category="comment"]').isChecked()));
 await page.evaluate(()=>applyAuthUser({id:'offline-settings-A',user_metadata:{name:'A'}}));await open(page);
 gate.resolve();await tick(page);assert(!(await page.locator('[data-push-category="comment"]').isChecked()));
 assert.equal(prefs.calls.filter(c=>c.name==='nca_set_push_preferences').length,0);assert.deepEqual(page.errors,[]);
 }finally{gate.resolve();await page.close()}});

test('delayed save response never applies old-account preferences or revision to the new account',async()=>{const {page,prefs}=await fixture();const gate=deferred();try{
 await open(page);prefs.setHook=async route=>{await gate.promise;return route.fulfill({status:200,headers,json:preferenceValue('1',['comment'])})};
 await page.locator('[data-push-category="comment"]').check();await page.locator('#pushCategorySave').click();
 await page.evaluate(()=>applyAuthUser({id:'offline-settings-B',user_metadata:{name:'B'}}));prefs.value=preferenceValue('12',['reply']);await open(page);
 assert(await page.locator('#pushCategorySave').isDisabled());gate.resolve();await tick(page);
 assert(!(await page.locator('[data-push-category="comment"]').isChecked()));assert(await page.locator('[data-push-category="reply"]').isChecked());
 prefs.setHook=null;await page.locator('[data-push-category="mention"]').check();await page.locator('#pushCategorySave').click();await waitCategory(page,'success');
 const saves=prefs.calls.filter(c=>c.name==='nca_set_push_preferences');assert.equal(saves.length,2);assert.equal(saves[1].args.p_expected_revision,'12');assert.equal(saves[1].authorization,'Bearer offline-fixture-offline-settings-B');assert.deepEqual(page.errors,[]);
 }finally{gate.resolve();await page.close()}});

test('pending write blocks duplicate saving across close/reopen and reconciles the same account once settled',async()=>{const {page,prefs}=await fixture();const gate=deferred();try{
 await open(page);prefs.setHook=async route=>{await gate.promise;prefs.value=preferenceValue('1',['comment']);return route.fulfill({status:200,headers,json:prefs.value})};
 await page.locator('[data-push-category="comment"]').check();await page.locator('#pushCategorySave').click();
 await page.locator('#pushSettingsClose').click();await open(page);assert(await page.locator('#pushCategorySave').isDisabled());
 await page.evaluate(()=>document.getElementById('pushCategorySave').dispatchEvent(new Event('click')));
 assert.equal(prefs.calls.filter(c=>c.name==='nca_set_push_preferences').length,1);gate.resolve();
 await page.waitForFunction(()=>document.getElementById('pushCategorySettings').getAttribute('aria-busy')==='false');
 assert(await page.locator('[data-push-category="comment"]').isChecked());assert(await page.locator('#pushCategorySave').isDisabled());assert.deepEqual(page.errors,[]);
 }finally{gate.resolve();await page.close()}});

test('account switch during async credential capture prevents stale setter dispatch',async()=>{const {page,prefs}=await fixture();try{
 await open(page);await page.evaluate(()=>{sb.auth.getSession=()=>new Promise(resolve=>{window.releasePreferenceSession=()=>resolve({data:{session:{user:{id:'offline-settings-A'},access_token:'offline-fixture-A'}},error:null})})});
 await page.locator('[data-push-category="comment"]').check();await page.locator('#pushCategorySave').click();
 await page.evaluate(()=>{applyAuthUser({id:'offline-settings-B',user_metadata:{name:'B'}});releasePreferenceSession()});await tick(page);
 assert.equal(prefs.calls.filter(c=>c.name==='nca_set_push_preferences').length,0);assert(!(await page.locator('#pushSettingsDialog').evaluate(e=>e.open)));assert.deepEqual(page.errors,[]);
 }finally{await page.close()}});

test('account switching after builder creation cannot replace the captured Authorization header',async()=>{const {page,prefs}=await fixture();try{
 await open(page);await page.evaluate(()=>{
  const rpc=sb.rpc.bind(sb);sb.rpc=(name,args)=>{const request=rpc(name,args);if(name==='nca_set_push_preferences')applyAuthUser({id:'offline-settings-B',user_metadata:{name:'B'}});return request};
 });
 await page.locator('[data-push-category="comment"]').check();await page.locator('#pushCategorySave').click();await tick(page);
 const save=prefs.calls.find(c=>c.name==='nca_set_push_preferences');assert(save);assert.equal(save.authorization,'Bearer offline-fixture-offline-settings-A');assert(!(await page.locator('#pushSettingsDialog').evaluate(e=>e.open)));assert.deepEqual(page.errors,[]);
 }finally{await page.close()}});

test('mismatched existing session fails closed before any preference RPC',async()=>{const {page,prefs}=await fixture();try{
 await page.evaluate(()=>{sb.auth.getSession=async()=>({data:{session:{user:{id:'different-account'},access_token:'offline-fixture-other'}},error:null})});
 await open(page);await waitCategory(page,'error');assert.equal(prefs.calls.length,0);assert(await page.locator('#pushCategorySave').isDisabled());assert.deepEqual(await mutations(page),[]);
 }finally{await page.close()}});
