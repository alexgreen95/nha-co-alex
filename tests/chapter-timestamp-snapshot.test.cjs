'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),ui=fs.readFileSync(path.join(__dirname,'../assets/freshness-ui.js'),'utf8');
const loader=html.slice(html.indexOf('async function loadCloudStories(){'),html.indexOf('async function ensureChapterContent('));
const timestamps=ui.slice(ui.indexOf('  async function refreshChapterUpdateTimes('),ui.indexOf('  function configureNotificationRoleTab('));
function fixture({failed=false}={}){
  const calls=[];let ready;const rows=[{id:1,story_id:1,chapter_number:1,published:true,updated_at:'2026-10-29T00:00:00Z',content:'not retained'},{id:2,story_id:1,published:false,updated_at:'2026-10-30T00:00:00Z'}];
  const context={publicMetadataRevision:0,publicMetadataSnapshot:null,publicChapterTimestampSnapshot:null,publicRefreshGeneration:0,publicRefreshFlight:null,stories:[],introStory:null,authMetadataReady:new Promise(r=>ready=r),console:{warn(){}},mapStoryBaselines:s=>s,render(){},applyStoryUpdateOrder(){},root:{fetchAllRows:async(...args)=>{calls.push(args);return rows;},render(){}},fetchAllRows:async table=>{calls.push([table]);if(table==='chapters'&&failed)throw Error('fixture');return table==='chapters'?rows:[{id:1,title:'Story'}];}};
  vm.createContext(context);vm.runInContext('let chapterUpdateFlight=null,latestChapterUpdatedByStory=new Map();'+loader+timestamps+';this.load=loadCloudStories;this.refresh=refreshChapterUpdateTimes;this.times=()=>latestChapterUpdatedByStory;',context);
  return {context,calls,ready};
}
test('bootstrap joins public metadata and removes the separate timestamp read',async()=>{
  const f=fixture(),refresh=f.context.refresh({reuseBootstrap:true});assert.equal(f.calls.length,0);
  await f.context.load();f.ready();await refresh;
  assert.equal(f.calls.filter(c=>c[0]==='chapters').length,1);
  assert.equal(f.context.times().get('1'),Date.parse('2026-10-29T00:00:00Z'));
  assert.equal(f.context.publicChapterTimestampSnapshot.rows[0].content,undefined);
});
test('visibility refresh fetches new timestamps even when a bootstrap snapshot exists',async()=>{
  const f=fixture();await f.context.load();f.ready();await f.context.refresh({reuseBootstrap:true});await f.context.refresh();
  assert.equal(f.calls.filter(c=>c[0]==='chapters').length,2);
});
for(const kind of ['failed','stale'])test(kind+' metadata falls back to the original timestamp query',async()=>{
  const f=fixture({failed:kind==='failed'});await f.context.load();if(kind==='stale')f.context.publicMetadataRevision++;
  f.ready();await f.context.refresh({reuseBootstrap:true});assert.equal(f.calls.filter(c=>c[0]==='chapters').length,2);
});
