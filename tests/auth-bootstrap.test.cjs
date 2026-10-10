const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const A='account-A',B='account-B',user=id=>({id,user_metadata:{full_name:'Auth '+id}});
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-expose-headers':'content-range'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
async function setup(){
 const page=await feedPage(0),mock={calls:[],profiles:new Map([[A,{id:A,display_name:'Profile A',avatar_url:'',role:'admin'}],[B,{id:B,display_name:'Profile B',avatar_url:'',role:'reader'}]]),profileHook:null,memberHook:null,failRead:false,failCreate:false};
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').pop(),uid=(url.searchParams.get('user_id')||url.searchParams.get('id')||'eq.').slice(3);
  if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});
  const body=req.postData()?req.postDataJSON():null,call={table,method:req.method(),uid,body};mock.calls.push(call);let data=[];
  if(table==='profiles'){
   if(mock.profileHook)await mock.profileHook(call);
   if(req.method()==='GET'){
    if(mock.failRead)return route.fulfill({status:500,headers,json:{message:'Read failure',code:'XX000'}});
    data=mock.profiles.has(uid)?[mock.profiles.get(uid)]:[];
   }else{
    if(mock.failCreate)return route.fulfill({status:403,headers,json:{message:'Create denied',code:'42501'}});
    const row=Array.isArray(body)?body[0]:body;mock.profiles.set(row.id,{...row,role:'reader'});data=[mock.profiles.get(row.id)];
   }
  }else if(table==='chapters')data=[{id:1,story_id:1,chapter_number:1,published:true}];
  else if(table==='reading_progress'){
   if(mock.memberHook)await mock.memberHook(call);
   data=[{user_id:uid,story_id:1,chapter_id:1,scroll_position:uid===A?111:222}];
  }else if(table==='saved_stories')data=mock.savedRows?mock.savedRows(uid):[{story_id:1}];
  else if(table==='nca_chapter_like_counts')data=body.p_chapter_ids.map(chapter_id=>({chapter_id,like_count:3}));
  else if(table==='nca_my_chapter_likes'){
   call.owner=await page.evaluate(()=>authUser?.id);const failed=mock.failMembership;
   if(mock.membershipHook)await mock.membershipHook(call);
   if(failed)return route.fulfill({status:503,headers,json:{message:'Membership unavailable'}});
   data=body.p_chapter_ids;
  }
  return route.fulfill({status:200,headers:{...headers,'content-range':'0-0/0'},json:data});
 });
 return {page,mock};
}
const emit=(page,event,id)=>page.evaluate(async({event,id})=>{await handleAuthState(event,id?{user:{id,user_metadata:{full_name:'Auth '+id}}}:null)}, {event,id});
function ownReads(mock,id){return mock.calls.filter(c=>c.table==='profiles'&&c.method==='GET'&&(!id||c.uid===id))}
function memberReads(mock,id){return mock.calls.filter(c=>['reading_progress','saved_stories'].includes(c.table)&&(!id||c.uid===id))}
for(const timing of ['before','after'])test(`signed bootstrap INITIAL_SESSION ${timing} getSession/work joins one account hydration`,async()=>{
 const requests=[];
 const init=new Function(`let sdk;Object.defineProperty(window,'supabase',{configurable:true,get(){return sdk},set(v){sdk=v;const create=v.createClient;v.createClient=(...args)=>{const client=create(...args),session={user:{id:'reader-user',user_metadata:{full_name:'Reader'}}};client.auth.getSession=async()=>{${timing==='before'?'await new Promise(r=>setTimeout(r,100));':''}return {data:{session}}};client.auth.onAuthStateChange=cb=>{window.emitSDK=event=>cb(event,session);${timing==='before'?"queueMicrotask(()=>cb('INITIAL_SESSION',session));":''}return {data:{subscription:{unsubscribe(){}}}}};return client}}});`);
 const page=await feedPage(0,{initScript:init,fixtures:{profiles:[{id:'reader-user',display_name:'Reader',role:'reader'}]},onRequest:(u,r)=>{if(u.pathname.startsWith('/rest/v1/')&&r.method()!=='OPTIONS')requests.push({table:u.pathname.split('/').pop(),method:r.method(),query:u.search})}});
 try{await page.waitForFunction(()=>authAccount.memberReady&&authAccount.profileReady);
 if(timing==='after')await page.evaluate(async()=>{emitSDK('INITIAL_SESSION');await authLastWork});
 assert.equal(requests.filter(r=>r.table==='profiles'&&r.query.includes('id=eq.reader-user')).length,1);
 assert.equal(requests.filter(r=>r.table==='reading_progress').length,1);assert.equal(requests.filter(r=>r.table==='saved_stories').length,1);
 assert.equal(requests.filter(r=>r.table==='notifications').length,2);
 assert.equal(requests.filter(r=>r.table==='stories').length,2);assert.equal(requests.filter(r=>r.table==='comments').length,1);assert.equal(requests.filter(r=>r.table==='reviews').length,1);
 assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('anonymous → signed: same INITIAL/SIGNED_IN/TOKEN and repeated UI render are no-op reads; USER_UPDATED profile only',async()=>{
 const {page,mock}=await setup();try{
 await emit(page,'SIGNED_IN',A);assert.equal(ownReads(mock).length,1);assert.equal(memberReads(mock).length,2);
 assert.equal(mock.calls.filter(c=>c.table==='notifications').length,2);assert(!mock.calls.some(c=>['comments','reviews','stories'].includes(c.table)));
 const epoch=await page.evaluate(()=>authAccount.epoch);mock.calls.length=0;
 await Promise.all(Array.from({length:4},()=>emit(page,'SIGNED_IN',A)));await emit(page,'INITIAL_SESSION',A);await emit(page,'TOKEN_REFRESHED',A);
 await page.evaluate(()=>{updateAuthUI();updateAuthUI()});assert.equal(mock.calls.length,0);assert.equal(await page.evaluate(()=>authAccount.epoch),epoch);
 mock.profiles.set(A,{id:A,display_name:'Updated A',role:'reader'});await emit(page,'USER_UPDATED',A);
 assert.equal(mock.calls.length,1);assert.equal(mock.calls[0].table,'profiles');assert.equal(await page.locator('#accountName').textContent(),'Updated A');assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('in-flight same-account sign-in joins both profile and member flights',async()=>{
 const {page,mock}=await setup(),hold=deferred();mock.profileHook=c=>c.uid===A?hold.promise:undefined;
 try{await page.evaluate(A=>{window.firstAuthJob=handleAuthState('SIGNED_IN',{user:{id:A}})},A);while(!ownReads(mock,A).length)await new Promise(r=>setTimeout(r,5));
 await page.evaluate(A=>{window.joinAuthJobs=Promise.all([handleAuthState('SIGNED_IN',{user:{id:A}}),handleAuthState('INITIAL_SESSION',{user:{id:A}})])},A);
 hold.resolve();await page.evaluate(async()=>{await firstAuthJob;await joinAuthJobs});assert.equal(ownReads(mock).length,1);assert.equal(memberReads(mock).length,2);assert.deepEqual(page.errors,[]);
 }finally{hold.resolve();await page.close()}
});
for(const kind of ['existing','missing'])test(`delayed ${kind} A profile cannot become B identity/name/avatar/admin or create after switch`,async()=>{
 const {page,mock}=await setup(),hold=deferred();if(kind==='missing')mock.profiles.delete(A);mock.profileHook=c=>c.uid===A&&c.method==='GET'?hold.promise:undefined;
 try{await page.evaluate(A=>{window.oldAuth=handleAuthState('SIGNED_IN',{user:{id:A,user_metadata:{full_name:'Old A'}}})},A);while(!ownReads(mock,A).length)await new Promise(r=>setTimeout(r,5));await emit(page,'SIGNED_IN',B);hold.resolve();await page.evaluate(()=>oldAuth);
 assert.deepEqual(await page.evaluate(()=>({owner:authUser.id,profile:memberProfile.id,name:userDisplayName(authUser),role:memberProfile.role})),{owner:B,profile:B,name:'Profile B',role:'reader'});
 assert.equal(memberReads(mock,A).length,0);assert(!mock.calls.some(c=>c.table==='profiles'&&c.method==='POST'&&c.body.id===A));assert.deepEqual(page.errors,[]);
 }finally{hold.resolve();await page.close()}
});
test('A→B→A creates fresh epochs; first A response cannot apply to second A',async()=>{
 const {page,mock}=await setup(),hold=deferred();let held=false;
 mock.profileHook=c=>{if(c.uid===A&&c.method==='GET'&&!held){held=true;return hold.promise}};
 try{await page.evaluate(A=>{window.oldA=handleAuthState('SIGNED_IN',{user:{id:A}})},A);while(!ownReads(mock,A).length)await new Promise(r=>setTimeout(r,5));const oldEpoch=await page.evaluate(()=>authAccount.epoch);
 await emit(page,'SIGNED_IN',B);await emit(page,'SIGNED_IN',A);const newEpoch=await page.evaluate(()=>authAccount.epoch);assert(newEpoch>oldEpoch);
 const before=await page.evaluate(()=>({profile:memberProfile.id,progress:progress[1].scroll,generation:authAccount.profileGeneration}));hold.resolve();await page.evaluate(()=>oldA);
 assert.deepEqual(await page.evaluate(()=>({profile:memberProfile.id,progress:progress[1].scroll,generation:authAccount.profileGeneration})),before);
 assert.equal(ownReads(mock,A).length,2);assert.equal(memberReads(mock,A).length,2);assert.equal(memberReads(mock,B).length,2);assert.deepEqual(page.errors,[]);
 }finally{hold.resolve();await page.close()}
});
for(const stage of ['profile','member'])test(`logout with ${stage} pending invalidates identity/private continuation`,async()=>{
 const {page,mock}=await setup(),hold=deferred();if(stage==='profile')mock.profileHook=c=>c.uid===A?hold.promise:undefined;else mock.memberHook=c=>c.uid===A?hold.promise:undefined;
 try{await page.evaluate(A=>{window.oldLogoutJob=handleAuthState('SIGNED_IN',{user:{id:A}})},A);while(!mock.calls.some(c=>c.table===(stage==='profile'?'profiles':'reading_progress')))await new Promise(r=>setTimeout(r,5));
 if(stage==='member')await page.evaluate(()=>openProfile('reading'));
 await emit(page,'SIGNED_OUT',null);hold.resolve();await page.evaluate(()=>oldLogoutJob);
 assert.deepEqual(await page.evaluate(()=>({profile:memberProfile,progress,saved,liked:likedChapters,ready:cloudSyncReady})),{profile:null,progress:{},saved:[],liked:[],ready:false});
 assert.equal(await page.locator('#accountName').textContent(),'');if(stage==='member')assert(!((await page.locator('#profileContent').textContent()).includes('Truyện thử nghiệm')));
 assert.deepEqual(page.errors,[]);
 }finally{hold.resolve();await page.close()}
});
test('Step 2 pending member reads cannot apply after switch; Step 3 membership loads only for B',async()=>{
 const {page,mock}=await setup(),hold=deferred();mock.memberHook=c=>c.uid===A?hold.promise:undefined;
 try{await page.evaluate(A=>{window.oldMember=handleAuthState('SIGNED_IN',{user:{id:A}})},A);while(!mock.calls.some(c=>c.table==='reading_progress'&&c.uid===A))await new Promise(r=>setTimeout(r,5));
 await emit(page,'SIGNED_IN',B);hold.resolve();await page.evaluate(()=>oldMember);
 assert.equal(await page.evaluate(()=>progress[1].scroll),222);assert.equal(await page.evaluate(()=>memberSyncOwner),B);assert.equal(await page.evaluate(()=>authAccount.memberReady),true);
 assert.equal(mock.calls.filter(c=>c.table==='nca_my_chapter_likes').length,1);assert.deepEqual(page.errors,[]);
 }finally{hold.resolve();await page.close()}
});
test('profile read failure never creates a profile; creation failure is retryable without rewriting member history',async()=>{
 const {page,mock}=await setup();try{
 mock.profiles.delete(A);mock.failRead=true;await emit(page,'SIGNED_IN',A);assert(!mock.calls.some(c=>c.table==='profiles'&&c.method==='POST'));assert.equal(memberReads(mock).length,2);
 mock.failRead=false;mock.failCreate=true;await emit(page,'SIGNED_IN',A);assert.equal(mock.calls.filter(c=>c.table==='profiles'&&c.method==='POST').length,1);
 mock.failCreate=false;await emit(page,'SIGNED_IN',A);assert.equal(await page.evaluate(()=>memberProfile.id),A);assert.equal(await page.evaluate(()=>memberProfile.role),'reader');assert.equal(memberReads(mock).length,2);
 const writes=mock.calls.filter(c=>c.table==='profiles'&&c.method==='POST');assert.equal(writes.length,2);assert(writes.every(c=>!Object.hasOwn(c.body,'role')));mock.calls.length=0;await emit(page,'SIGNED_IN',A);assert.equal(mock.calls.length,0);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('SDK INITIAL B before stale getSession A preserves B epoch',async()=>{
 const init=()=>{let sdk;Object.defineProperty(window,'supabase',{configurable:true,get(){return sdk},set(v){sdk=v;const create=v.createClient;v.createClient=(...args)=>{const client=create(...args);client.auth.getSession=async()=>{await new Promise(r=>setTimeout(r,100));return {data:{session:{user:{id:'old-A'}}}}};client.auth.onAuthStateChange=cb=>{queueMicrotask(()=>cb('INITIAL_SESSION',{user:{id:'reader-user'}}));return {data:{subscription:{unsubscribe(){}}}}};return client}}})};
 const page=await feedPage(0,{initScript:init,fixtures:{profiles:[{id:'reader-user',display_name:'Reader B',role:'reader'}]}});
 try{await page.waitForFunction(()=>authAccount.memberReady);assert.equal(await page.evaluate(()=>authUser.id),'reader-user');assert.equal(await page.evaluate(()=>memberProfile.id),'reader-user');assert.deepEqual(page.errors,[])}finally{await page.close()}
});
test('account switch during bootstrap abandons old profile wait; B metadata/member loads do not wait for A',async()=>{
 const {page,mock}=await setup(),hold=deferred();mock.profileHook=c=>c.uid===A&&c.method==='GET'?hold.promise:undefined;
 try{await page.evaluate(A=>{
  sb.auth.getSession=async()=>({data:{session:{user:{id:A}}}});sb.auth.onAuthStateChange=()=>({});
  const load=loadCloudStories;loadCloudStories=async()=>{window.metadataStarted=true;return true};
  window.pendingBootstrap=initAuth().finally(()=>loadCloudStories=load);
 },A);
 while(!ownReads(mock,A).length)await new Promise(r=>setTimeout(r,5));
 await page.evaluate(B=>{window.newBootstrapAccount=handleAuthState('SIGNED_IN',{user:{id:B}})},B);
 await page.waitForFunction(()=>window.metadataStarted&&authAccount.owner==='account-B'&&authAccount.memberReady);
 assert.equal(await page.evaluate(()=>memberProfile.id),B);assert.equal(memberReads(mock,B).length,2);
 hold.resolve();await page.evaluate(async()=>{await pendingBootstrap;await newBootstrapAccount});assert.equal(await page.evaluate(()=>memberProfile.id),B);assert.deepEqual(page.errors,[]);
 }finally{hold.resolve();await page.close()}
});
test('pending profile creation/save response belongs only to its captured account; logout clears own profile UI',async()=>{
 const {page,mock}=await setup(),hold=deferred();mock.profiles.delete(A);mock.profileHook=c=>c.method==='POST'&&c.body.id===A?hold.promise:undefined;
 try{
 await page.evaluate(A=>{window.createA=handleAuthState('SIGNED_IN',{user:{id:A}})},A);
 while(!mock.calls.some(c=>c.table==='profiles'&&c.method==='POST'))await new Promise(r=>setTimeout(r,5));
 await emit(page,'SIGNED_IN',B);hold.resolve();await page.evaluate(()=>createA);
 assert.equal(await page.evaluate(()=>memberProfile.id),B);
 mock.profileHook=null;await page.evaluate(()=>openProfile('edit'));
 const saveHold=deferred();mock.profileHook=c=>c.method==='PATCH'?saveHold.promise:undefined;
 await page.fill('#editDisplayName','Saved B');await page.evaluate(()=>{window.saveB=saveProfileChanges()});
 while(!mock.calls.some(c=>c.table==='profiles'&&c.method==='PATCH'))await new Promise(r=>setTimeout(r,5));
 await emit(page,'SIGNED_OUT',null);saveHold.resolve();await page.evaluate(()=>saveB);await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>memberProfile),null);assert.equal(await page.locator('#accountName').textContent(),'');assert.equal(await page.evaluate(()=>document.getElementById('profilePage').dataset.profileOwner),'');assert.deepEqual(page.errors,[]);
 }finally{hold.resolve();await page.close()}
});
test('late signOut completion from A cannot log out or navigate a newer B session',async()=>{
 const {page}=await setup();try{
 await emit(page,'SIGNED_IN',A);await page.evaluate(()=>{sb.auth.signOut=()=>new Promise(resolve=>window.releaseSignOut=()=>resolve({error:null}));window.oldSignOut=signOut()});
 await emit(page,'SIGNED_IN',B);await page.evaluate(()=>openProfile('profile'));const path=new URL(page.url()).pathname;
 await page.evaluate(async()=>{releaseSignOut();await oldSignOut});assert.equal(await page.evaluate(()=>authUser.id),B);assert.equal(await page.evaluate(()=>memberProfile.id),B);assert.equal(new URL(page.url()).pathname,path);assert.equal(await page.evaluate(()=>document.getElementById('profilePage').classList.contains('hidden')),false);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('account transition clears old saved-library cards immediately; B hydration and logout refresh only active library',async()=>{
 const {page,mock}=await setup(),hold=deferred();mock.savedRows=uid=>uid===A?[{story_id:1}]:[];
 try{
 await emit(page,'SIGNED_IN',A);await page.evaluate(()=>show('library'));assert.equal(await page.locator('#saved .story-card').count(),1);
 mock.profileHook=c=>c.uid===B?hold.promise:undefined;await page.evaluate(B=>{window.librarySwitch=handleAuthState('SIGNED_IN',{user:{id:B}})},B);
 assert.equal(await page.locator('#saved .story-card').count(),0);assert.equal(await page.evaluate(()=>document.getElementById('library').classList.contains('hidden')),false);
 hold.resolve();await page.evaluate(()=>librarySwitch);assert.equal(await page.locator('#saved .story-card').count(),0);await emit(page,'SIGNED_OUT',null);assert.equal(await page.locator('#saved .story-card').count(),0);assert.deepEqual(page.errors,[]);
 }finally{hold.resolve();await page.close()}
});

test('failed membership and failed retry remain retryable; only membership retries, ready history/profile stay cached',async()=>{
 const {page,mock}=await setup();try{
 mock.failMembership=true;await emit(page,'SIGNED_IN',A);
 assert.deepEqual(await page.evaluate(()=>({member:authAccount.memberReady,profile:authAccount.profileReady,likes:authAccount.likesCovered,liked:likedChapters,flight:authAccount.memberFlight})),{member:true,profile:true,likes:false,liked:[],flight:null});
 const initial=mock.calls.length;assert.equal(initial,8);mock.calls.length=0;
 await emit(page,'SIGNED_IN',A);assert.equal(mock.calls.length,1);assert.equal(mock.calls[0].table,'nca_my_chapter_likes');assert.equal(await page.evaluate(()=>authAccount.likesCovered),false);assert.equal(await page.evaluate(()=>authAccount.memberFlight),null);
 mock.failMembership=false;mock.calls.length=0;await emit(page,'SIGNED_IN',A);
 assert.equal(mock.calls.length,1);assert.equal(mock.calls[0].table,'nca_my_chapter_likes');assert.equal(await page.evaluate(()=>authAccount.likesCovered),true);assert.deepEqual(await page.evaluate(()=>likedChapters),['1_0']);
 mock.calls.length=0;await emit(page,'SIGNED_IN',A);assert.equal(mock.calls.length,0);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
for(const late of ['failure','success'])test(`late A membership ${late} cannot mark B covered or change membership`,async()=>{
 const {page,mock}=await setup(),hold=deferred();mock.failMembership=late==='failure';mock.membershipHook=c=>c.owner===A?hold.promise:undefined;
 try{
 await page.evaluate(A=>{window.oldMembershipJob=handleAuthState('SIGNED_IN',{user:{id:A}})},A);
 while(!mock.calls.some(c=>c.table==='nca_my_chapter_likes'&&c.owner===A))await new Promise(r=>setTimeout(r,5));
 mock.failMembership=true;await emit(page,'SIGNED_IN',B);assert.equal(await page.evaluate(()=>authAccount.likesCovered),false);
 hold.resolve();await page.evaluate(()=>oldMembershipJob);assert.deepEqual(await page.evaluate(()=>({owner:authAccount.owner,likes:authAccount.likesCovered,liked:likedChapters})),{owner:B,likes:false,liked:[]});
 mock.failMembership=false;mock.calls.length=0;await emit(page,'SIGNED_IN',B);assert.equal(mock.calls.length,1);assert.equal(mock.calls[0].table,'nca_my_chapter_likes');assert.equal(await page.evaluate(()=>authAccount.likesCovered),true);assert.deepEqual(await page.evaluate(()=>likedChapters),['1_0']);assert.deepEqual(page.errors,[]);
 }finally{hold.resolve();await page.close()}
});
test('bootstrap shared membership failure is not marked covered; later sign-in retries just membership',async()=>{
 const {page,mock}=await setup();try{
 mock.failMembership=true;
 await page.evaluate(async A=>{sb.auth.getSession=async()=>({data:{session:{user:{id:A}}}});sb.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});await initAuth();await authLastWork},A);
 assert.equal(mock.calls.filter(c=>c.table==='nca_my_chapter_likes').length,1);assert.equal(await page.evaluate(()=>authAccount.likesCovered),false);assert.equal(await page.evaluate(()=>authAccount.memberReady),true);
 mock.failMembership=false;mock.calls.length=0;await emit(page,'SIGNED_IN',A);assert.equal(mock.calls.length,1);assert.equal(mock.calls[0].table,'nca_my_chapter_likes');assert.equal(await page.evaluate(()=>authAccount.likesCovered),true);assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
