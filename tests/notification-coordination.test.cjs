const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const A='reader-user',B='other-user';
const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-expose-headers':'content-range'};
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
async function wait(f){for(let i=0;i<1000;i++){if(f())return;await new Promise(r=>setTimeout(r,5))}throw Error('held request did not start')}
async function setup(){
 const page=await feedPage(0,{initScript:()=>{const old=setInterval;window.setInterval=(fn,ms,...args)=>ms===30000?0:old(fn,ms,...args)}});
 const calls=[],m={hook:null,fail:null,rows:[{id:'n',user_id:A,actor_id:'admin-user',type:'mention',is_read:false},{id:'b',user_id:B,actor_id:'admin-user',type:'reply',is_read:false}]};
 await page.route('**/rest/v1/notifications**',async route=>{
  const req=route.request(),u=new URL(req.url());if(req.method()==='OPTIONS')return route.fulfill({status:200,headers:H});
  const method=req.method(),owner=(u.searchParams.get('user_id')||'').slice(3),type=u.searchParams.get('type'),id=u.searchParams.get('id');
  let rows=m.rows.filter(n=>n.user_id===owner);if(type)rows=rows.filter(n=>type.startsWith('eq.')?'eq.'+n.type===type:type.includes(n.type));if(id)rows=rows.filter(n=>'eq.'+n.id===id);if(u.searchParams.has('is_read'))rows=rows.filter(n=>!n.is_read);
  const data=rows.map(n=>({...n})),call={stage:method,owner,query:u.search};calls.push(call);const fail=m.fail===method;
  if(m.hook)await m.hook(call);
  if(fail)return route.fulfill({status:400,headers:H,json:{message:'deliberate failure'}});
  if(method==='PATCH'){rows.forEach(n=>n.is_read=true);return route.fulfill({status:204,headers:H})}
  return route.fulfill({status:200,headers:{...H,'content-range':`0-${Math.max(0,data.length-1)}/${data.length}`},contentType:'application/json',body:method==='HEAD'?'':JSON.stringify(data)});
 });
 await page.route('**/rest/v1/profiles**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:200,headers:H});const call={stage:'profile'};calls.push(call);const fail=m.fail==='profile';if(m.hook)await m.hook(call);
  return route.fulfill({status:fail?400:200,headers:H,json:fail?{message:'profile failed'}:[{id:'admin-user',display_name:'Actor'}]});
 });
 await page.evaluate(A=>{authUser={id:A};resetAuthAccount(A)},A);
 return {page,calls,m};
}
const ui=p=>p.evaluate(()=>({ids:[...notificationRows.keys()],unread:[...document.querySelectorAll('#notifList .unread')].map(n=>n.dataset.notificationId),badge:document.getElementById('notifBadge').textContent,text:document.getElementById('notifList').textContent}));
async function hold(m,stage){const g=gate();let started=false;m.hook=call=>{if(!started&&call.stage===stage){started=true;return g.promise}};return {g,started:()=>started}}
for(const order of ['full-first','poll-first'])test(`${order}: separate list/badge freshness keeps new list and newest count`,async()=>{
 const {page,m}=await setup();const h=await hold(m,order==='full-first'?'GET':'HEAD');
 try{
  if(order==='full-first')await page.evaluate(()=>{window.pending=loadNotifications(false,{forceRefresh:true})});else await page.evaluate(()=>{window.pending=loadNotifications(true)});
  await wait(h.started);m.rows.push({id:'new',user_id:A,actor_id:'admin-user',type:'mention',is_read:false});
  if(order==='full-first')await page.evaluate(()=>loadNotifications(true));else await page.evaluate(()=>loadNotifications(false,{forceRefresh:true}));
  h.g.resolve();await page.evaluate(()=>pending);const result=await ui(page);
  assert.deepEqual(result.ids,order==='full-first'?['n']:['n','new']);assert.equal(result.badge,'2');assert.deepEqual(page.errors,[]);
 }finally{h.g.resolve();await page.close()}
});
test('forced newer full refresh wins over older response',async()=>{
 const {page,calls,m}=await setup(),h=await hold(m,'GET');try{
 await page.evaluate(()=>{window.oldFull=loadNotifications(false,{forceRefresh:true})});await wait(h.started);m.rows.push({id:'new',user_id:A,actor_id:'admin-user',type:'mention',is_read:false});await page.evaluate(()=>loadNotifications(false,{forceRefresh:true}));h.g.resolve();await page.evaluate(()=>oldFull);
 assert.deepEqual((await ui(page)).ids,['n','new']);assert.equal(calls.filter(c=>c.stage==='GET').length,2);assert.equal(calls.filter(c=>c.stage==='HEAD').length,2);
 }finally{h.g.resolve();await page.close()}
});
for(const kind of ['one','all'])for(const stage of ['GET','HEAD','profile'])test(`successful mark-${kind} invalidates older ${stage} response`,async()=>{
 const {page,m}=await setup();await page.evaluate(()=>loadNotifications(false,{forceRefresh:true}));const h=await hold(m,stage);
 try{
 await page.evaluate(()=>{window.oldRead=loadNotifications(false,{forceRefresh:true})});await wait(h.started);await page.evaluate(kind=>kind==='one'?openNotification('n'):markNotificationsRead(),kind);
 assert.deepEqual((await ui(page)).unread,[]);h.g.resolve();await page.evaluate(()=>oldRead);assert.deepEqual((await ui(page)).unread,[]);assert.equal((await ui(page)).badge,'0');assert.deepEqual(page.errors,[]);
 }finally{h.g.resolve();await page.close()}
});
for(const kind of ['one','all'])test(`badge poll cannot cancel post-mark-${kind} full-list refresh`,async()=>{
 const {page,m}=await setup();await page.evaluate(()=>loadNotifications(false,{forceRefresh:true}));const h=await hold(m,'GET');
 try{
 await page.evaluate(kind=>{window.markJob=kind==='one'?openNotification('n'):markNotificationsRead()},kind);await wait(h.started);await page.evaluate(()=>loadNotifications(true));h.g.resolve();await page.evaluate(()=>markJob);
 assert.deepEqual((await ui(page)).unread,[]);assert.equal((await ui(page)).badge,'0');
 }finally{h.g.resolve();await page.close()}
});
for(const scenario of ['B','B-A','logout'])for(const stage of ['PATCH','GET','profile'])test(`held ${stage} cannot continue original A work after ${scenario}`,async()=>{
 const {page,calls,m}=await setup();m.rows[0].story_id=1;await page.evaluate(()=>loadNotifications(false,{forceRefresh:true}));await page.evaluate(()=>{window.nav=[];openStory=id=>nav.push(id)});const h=await hold(m,stage);
 try{
 await page.evaluate(()=>{window.oldOpen=openNotification('n')});await wait(h.started);
 await page.evaluate(async({scenario,B,A})=>{authUser=scenario==='logout'?null:{id:B};resetAuthAccount(authUser?.id||null);await loadNotifications(false,{forceRefresh:true});if(scenario==='B-A'){authUser={id:A};resetAuthAccount(A);await loadNotifications(false,{forceRefresh:true})}},{scenario,B,A});
 const expected=await ui(page),before=calls.length;h.g.resolve();await page.evaluate(()=>oldOpen);
 assert.deepEqual(await ui(page),expected);assert.deepEqual(await page.evaluate(()=>nav),[]);assert.equal(calls.length,before,'Old continuation must not start refresh/navigation requests');assert.deepEqual(page.errors,[]);
 }finally{h.g.resolve();await page.close()}
});
for(const method of ['one','all'])test(`held ${method} mutation success after A-B-A cannot refresh new epoch`,async()=>{
 const {page,calls,m}=await setup();await page.evaluate(()=>loadNotifications(false,{forceRefresh:true}));const h=await hold(m,'PATCH');try{
 await page.evaluate(method=>{window.oldMark=method==='one'?openNotification('n'):markNotificationsRead()},method);await wait(h.started);
 await page.evaluate(async({A,B})=>{for(const id of [B,A]){authUser={id};resetAuthAccount(id);await loadNotifications(false,{forceRefresh:true})}},{A,B});const before=calls.length,expected=await ui(page);h.g.resolve();await page.evaluate(()=>oldMark);assert.equal(calls.length,before);assert.deepEqual(await ui(page),expected);
 }finally{h.g.resolve();await page.close()}
});
for(const stage of ['GET','HEAD','profile','PATCH'])test(`${stage} failure does not poison a later retry`,async()=>{
 const {page,m}=await setup();try{
 await page.evaluate(()=>loadNotifications(false,{forceRefresh:true}));m.fail=stage;
 if(stage==='PATCH'){await page.evaluate(()=>markNotificationsRead());assert.equal(m.rows[0].is_read,false)}else await page.evaluate(()=>loadNotifications(false,{forceRefresh:true}));
 m.fail=null;if(stage==='PATCH')await page.evaluate(()=>markNotificationsRead());else await page.evaluate(()=>loadNotifications(false,{forceRefresh:true}));
 assert.deepEqual((await ui(page)).ids,['n']);assert.match((await ui(page)).text,/Actor/);assert.equal((await ui(page)).badge,stage==='PATCH'?'0':'1');assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('selected like-filter mark-all changes only like rows; global badge semantics preserved',async()=>{
 const {page,m}=await setup();try{
 m.rows.push({id:'like',user_id:A,actor_id:'admin-user',type:'story_like',is_read:false});await page.evaluate(async()=>{notifFilter='like';await loadNotifications(false,{forceRefresh:true});await markNotificationsRead()});
 assert.equal(m.rows[0].is_read,false);assert.equal(m.rows.find(n=>n.id==='like').is_read,true);assert.deepEqual((await ui(page)).ids,['like']);assert.equal((await ui(page)).badge,'1');
 }finally{await page.close()}
});

for(const scenario of ['B','B-A','logout'])test(`held comment lookup cannot navigate after ${scenario}`,async()=>{
 const {page,m}=await setup(),g=gate();let started=false;
 try{
 m.rows[0].comment_id='comment-0';await page.evaluate(()=>loadNotifications(false,{forceRefresh:true}));
 await page.evaluate(()=>{window.commentLoads=0;window.nav=[];loadCloudComments=async()=>{commentLoads++};openStory=id=>nav.push(id)});
 await page.route('**/rest/v1/comments**',async route=>{if(route.request().method()==='OPTIONS')return route.fulfill({status:200,headers:H});started=true;await g.promise;return route.fulfill({status:200,headers:H,json:{id:'comment-0',user_id:A,scope:'story',story_id:1}})});
 await page.evaluate(()=>{window.openJob=openNotification('n')});await wait(()=>started);
 await page.evaluate(async({scenario,A,B})=>{authUser=scenario==='logout'?null:{id:B};resetAuthAccount(authUser?.id||null);await loadNotifications(false,{forceRefresh:true});if(scenario==='B-A'){authUser={id:A};resetAuthAccount(A);await loadNotifications(false,{forceRefresh:true})}},{scenario,A,B});
 g.resolve();await page.evaluate(()=>openJob);assert.equal(await page.evaluate(()=>commentLoads),0);assert.deepEqual(await page.evaluate(()=>nav),[]);assert.deepEqual(page.errors,[]);
 }finally{g.resolve();await page.close()}
});

for(const kind of ['full','actor','badge','mixed'])test(`equivalent pending ${kind} work joins`,async()=>{
 const {page,calls,m}=await setup(),h=await hold(m,kind==='actor'?'profile':['badge','mixed'].includes(kind)?'HEAD':'GET');
 try{
 await page.evaluate(kind=>{window.first=loadNotifications(kind==='badge')},kind);await wait(h.started);
 const before=await page.evaluate(()=>[notificationLoad,notificationBadgeLoad]);
 await page.evaluate(kind=>{window.second=loadNotifications(kind==='badge');if(kind==='mixed')window.poll=loadNotifications(true)},kind);
 await new Promise(r=>setTimeout(r,30));assert.deepEqual(await page.evaluate(()=>[notificationLoad,notificationBadgeLoad]),before);
 h.g.resolve();await page.evaluate(()=>Promise.all([first,second,window.poll]));
 assert.equal(calls.filter(c=>c.stage==='GET').length,kind==='badge'?0:1);
 assert.equal(calls.filter(c=>c.stage==='HEAD').length,1);
 assert.equal(calls.filter(c=>c.stage==='profile').length,kind==='badge'?0:1);
 await page.evaluate(kind=>loadNotifications(kind==='badge'),kind);
 assert.equal(calls.filter(c=>c.stage==='HEAD').length,2,'No completed-result cache');
 }finally{h.g.resolve();await page.close()}
});
for(const failure of ['GET','HEAD','profile'])test(`forced ${failure} failure releases replacement while obsolete normal remains held`,async()=>{
 const {page,calls,m}=await setup(),h=await hold(m,'GET');try{
 await page.evaluate(()=>{window.old=loadNotifications()});await wait(h.started);
 m.fail=failure;assert.equal(await page.evaluate(()=>loadNotifications(false,{forceRefresh:true})),false);
 m.fail=null;m.rows.push({id:'fresh',user_id:A,actor_id:'admin-user',type:'mention',is_read:false});
 assert.equal(await page.evaluate(()=>loadNotifications()),true);assert.deepEqual((await ui(page)).ids,['n','fresh']);
 h.g.resolve();await page.evaluate(()=>old);assert.deepEqual((await ui(page)).ids,['n','fresh']);
 assert.equal(await page.evaluate(()=>notificationFullFlight),null);
 assert.equal(await page.evaluate(()=>loadNotifications()),true);
 }finally{h.g.resolve();await page.close()}
});
test('all-like-all replaces obsolete pending all and its finalizer cannot clear current flight',async()=>{
 const {page,calls,m}=await setup(),h=await hold(m,'GET');try{
 await page.evaluate(()=>{window.old=loadNotifications()});await wait(h.started);
 await page.evaluate(async()=>{notifFilter='like';await loadNotifications();notifFilter='all';window.replacement=loadNotifications()});
 await page.evaluate(()=>replacement);assert.equal(calls.filter(c=>c.stage==='GET').length,3);
 h.g.resolve();await page.evaluate(()=>old);assert.deepEqual((await ui(page)).ids,['n']);
 }finally{h.g.resolve();await page.close()}
});
for(const order of ['full-poll','poll-full'])test(`${order} pending HEAD sharing respects full freshness`,async()=>{
 const {page,calls,m}=await setup(),h=await hold(m,'HEAD');try{
 await page.evaluate(order=>{window.first=loadNotifications(order==='poll-full')},order);await wait(h.started);
 await page.evaluate(order=>{window.second=loadNotifications(order==='full-poll')},order);
 await new Promise(r=>setTimeout(r,30));h.g.resolve();await page.evaluate(()=>Promise.all([first,second]));
 assert.equal(calls.filter(c=>c.stage==='HEAD').length,order==='full-poll'?1:2);assert.deepEqual((await ui(page)).ids,['n']);
 }finally{h.g.resolve();await page.close()}
});
test('obsolete finalizer cannot remove a held replacement; same-filter selection joins it',async()=>{
 const {page,calls,m}=await setup(),first=gate(),second=gate();let gets=0;
 m.hook=c=>{if(c.stage==='GET'){gets++;return gets===1?first.promise:gets===2?second.promise:undefined}};
 try{
 await page.evaluate(()=>{window.old=loadNotifications()});await wait(()=>gets===1);
 await page.evaluate(()=>{window.newJob=loadNotifications(false,{forceRefresh:true})});await wait(()=>gets===2);
 first.resolve();await page.evaluate(()=>old);assert.equal(await page.evaluate(()=>!!notificationFullFlight),true);
 await page.evaluate(()=>setNotifFilter('all'));await new Promise(r=>setTimeout(r,30));assert.equal(gets,2);
 second.resolve();await page.evaluate(()=>newJob);assert.deepEqual((await ui(page)).ids,['n']);
 }finally{first.resolve();second.resolve();await page.close()}
});
test('50-row query limit and global unread HEAD remain unchanged',async()=>{
 const {page,calls}=await setup();try{await page.evaluate(()=>loadNotifications());
 assert.match(calls.find(c=>c.stage==='GET').query,/limit=50/);assert.match(calls.find(c=>c.stage==='HEAD').query,/is_read=eq.false/);
 }finally{await page.close()}
});
