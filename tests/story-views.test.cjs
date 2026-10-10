const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const fixtures={chapters:[{id:11,story_id:1,title:'Một',chapter_number:1,published:true},{id:12,story_id:1,title:'Hai',chapter_number:2,published:true}],paragraphs:[{paragraph_number:1,content:'Nội dung'}],nca_story_view_counts:[{story_id:1,view_count:100000}]};
async function mockCounts(page,start=100000){
 let count=start,failInsert=false,failCount=false;const requests=[];
 await page.route('**/rest/v1/story_views**',async route=>{
  const req=route.request();requests.push({kind:'view',method:req.method(),body:req.postDataJSON()});
  assert.equal(req.method(),'POST','Never download view history');
  if(!failInsert)count++;
  await route.fulfill({status:failInsert?403:201,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:failInsert?'{"message":"denied"}':'[]'});
 });
 await page.route('**/rest/v1/rpc/nca_story_view_counts',async route=>{
  requests.push({kind:'count',method:route.request().method(),body:route.request().postDataJSON()});
  await route.fulfill({status:failCount?500:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:failCount?'{"message":"unavailable"}':JSON.stringify([{story_id:1,view_count:count}])});
 });
 return {requests,get count(){return count},set failInsert(v){failInsert=v},set failCount(v){failCount=v}};
}
test('anonymous: uncached/cached opens, navigation, refresh and bounded requests',async()=>{
 const traffic=[];const page=await feedPage(0,{fixtures,onRequest:url=>traffic.push(url)});
 try{
  assert(!traffic.some(u=>u.pathname.endsWith('/story_views')));
  assert.equal(traffic.filter(u=>u.pathname.startsWith('/rest/v1/')).length,11);
  assert.equal(await page.evaluate(()=>stories[0].views),100000);
  const mock=await mockCounts(page);
  traffic.length=0;
  await page.evaluate(async()=>{await read(1,0)});
  assert.equal(traffic.filter(u=>/\/(paragraphs|chapter_images)$/.test(u.pathname)).length,2);
  assert.equal(mock.requests.length,2); // 2 content GET + INSERT + aggregate RPC = 4.
  assert.equal(traffic.filter(u=>u.pathname.startsWith('/rest/v1/')).length+mock.requests.length,4);
  assert.equal(mock.requests[0].body.user_id,null);
  assert.equal(await page.evaluate(()=>stories[0].views),100001);
  assert.equal((await page.locator('.story-card .stats .stat').first().textContent()).trim(),'100K');
  traffic.length=0;mock.requests.length=0;
  await page.evaluate(async()=>{await read(1,0)});
  assert.equal(traffic.filter(u=>/\/(paragraphs|chapter_images)$/.test(u.pathname)).length,0);
  assert.equal(mock.requests.length,2); // Cached: INSERT + RPC only.
  assert.equal(traffic.filter(u=>u.pathname.startsWith('/rest/v1/')).length+mock.requests.length,2);
  await page.evaluate(async()=>{await moveChapter(1)});
  assert.equal(mock.count,100003);
  await page.evaluate(async()=>{await goChapter(0)});
  assert.equal(mock.count,100004);
  const before=mock.count;
  await page.evaluate(async()=>{render();renderChapter();await refreshPublicStoryCloudFields()});
  assert.equal(mock.count,before,'render/hydration must not write views');
  traffic.length=0;mock.requests.length=0;
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>currentStory&&stories[0].views===100005);
  assert.equal(mock.count,100005,'refresh reader records exactly one event');
  assert.equal(traffic.filter(u=>u.pathname.startsWith('/rest/v1/')).length+mock.requests.length,15);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('signed-in payload, failed INSERT/count, concurrency and stale responses',async()=>{
 const page=await feedPage(0,{fixtures});
 try{
  const mock=await mockCounts(page);
  await page.evaluate(()=>{authUser={id:'00000000-0000-0000-0000-000000000001'}});
  await page.evaluate(async()=>{await read(1,0)});
  assert.equal(mock.requests[0].body.user_id,'00000000-0000-0000-0000-000000000001');
  mock.failInsert=true;mock.requests.length=0;
  assert.equal(await page.evaluate(()=>recordStoryView(1)),false);
  assert.equal(mock.requests.length,1);assert.equal(await page.evaluate(()=>stories[0].views),100001);
  mock.failInsert=false;mock.failCount=true;
  assert.equal(await page.evaluate(()=>recordStoryView(1)),true);
  assert.equal(await page.evaluate(()=>stories[0].views),100002);
  mock.failCount=false;
  await page.evaluate(async()=>{await Promise.all(Array.from({length:10},()=>recordStoryView(1)))});
  await page.evaluate(()=>refreshStoryViewCounts([1]));
  assert.equal(await page.evaluate(()=>stories[0].views),mock.count);
  const result=await page.evaluate(async()=>{
   const original=sb.rpc;const pending=[];
   sb.rpc=()=>new Promise(resolve=>pending.push(resolve));
   const old=refreshStoryViewCounts([1]),recent=refreshStoryViewCounts([1]);
   pending[1]({data:[{story_id:1,view_count:200000}],error:null});await recent;
   pending[0]({data:[{story_id:1,view_count:100}],error:null});await old;
   sb.rpc=original;return stories[0].views;
  });
  assert.equal(result,200000);
  assert.deepEqual(page.errors,[]);
 }finally{await page.close()}
});
test('aggregate batches contain at most 100 unique IDs',async()=>{
 const page=await feedPage(0,{fixtures});
 try{
  const batches=await page.evaluate(async()=>{
   const original=sb.rpc,batches=[];
   sb.rpc=async(name,args)=>{batches.push(args.p_story_ids);return {data:[],error:null}};
   await refreshStoryViewCounts([...Array.from({length:205},(_,i)=>i+1),1,'bad']);
   await refreshStoryViewCounts([]);sb.rpc=original;return batches;
  });
  assert.deepEqual(batches.map(b=>b.length),[100,100,5]);
  assert.equal(new Set(batches.flat()).size,205);
 }finally{await page.close()}
});
