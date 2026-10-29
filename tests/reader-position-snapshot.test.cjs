'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/reader-reload-position-v30.js'),'utf8');
const tab='nca-reader-tab:11111111-1111-4111-8111-111111111111',readerPath='/truyen/story/chuong-1';
const saved=()=>({version:2,tab,owner:'guest',path:readerPath,storyId:'1',chapterId:'10',scroll:600,at:Date.now()});
function fixture(record,{type='navigate',url=readerPath,user=null,local=null,cloud={scroll:350}}={}){
  const story={id:1,chapters:[{id:10},{id:11}]},events=new Map();let stored=JSON.stringify(record),cloudCalls=0;
  const c={authUser:user,name:tab,crypto:{randomUUID:()=>assert.fail('same tab must retain identity')},location:{pathname:url},performance:{getEntriesByType:()=>[{type}]},history:{scrollRestoration:'auto'},document:{addEventListener(){}},sessionStorage:{getItem:()=>stored,setItem:(key,value)=>stored=value,removeItem:()=>stored=null},localStorage:{getItem:()=>JSON.stringify(local)},addEventListener:(name,fn)=>events.set(name,fn),requestAnimationFrame:()=>1,cancelAnimationFrame(){},chapterPath:(s,i)=>'/truyen/story/chuong-'+(i+1),navigationEpoch:1,initialReaderProgress:async()=>{cloudCalls++;return cloud;}};
  c.window=c;vm.createContext(c);vm.runInContext(source,c);return {c,story,events,get cloudCalls(){return cloudCalls},take:(explicit=0,update=false)=>c.NcaReaderPosition.consume(story,0,explicit,update)};
}
test('exact surviving tab snapshot wins over per-story fallback on reload and re-entry',async()=>{
  for(const type of ['navigate','reload','back_forward']){
    const f=fixture(saved(),{type,url:readerPath+'/',local:{...saved(),scroll:350}});assert.equal((await f.take()).scroll,600);assert.equal(await f.take(),null);assert.equal(f.c.history.scrollRestoration,'manual');
    const signed=fixture({...saved(),owner:'user:A'},{type,user:{id:'A'}});assert.equal((await signed.take()).scroll,600);assert.equal(signed.cloudCalls,0);
  }
});
for(const [label,patch] of [['other tab',{tab:'unrelated'}],['other path',{path:'/truyen/story/chuong-2'}],['other story',{storyId:'2'}],['other chapter',{chapterId:'11'}],['expired',{at:Date.now()-7*60*60*1000}],['future',{at:Date.now()+60000}],['negative',{scroll:-1}],['infinite',{scroll:Infinity}],['coerced string',{scroll:'600'}],['other account',{owner:'user:A'}]])test('rejects '+label+' snapshot and uses this story fallback',async()=>{
  const f=fixture({...saved(),...patch},{local:{...saved(),scroll:350}});assert.equal((await f.take()).scroll,350);
});
test('fresh context reads guest progress by exact story/chapter, independently of navigation type',async()=>{
  for(const type of ['navigate','reload','back_forward'])assert.equal((await fixture(null,{type,local:saved()}).take()).scroll,600);
  for(const patch of [{storyId:'2'},{chapterId:'11'},{owner:'user:A'},{scroll:-1}])assert.equal((await fixture(null,{local:{...saved(),...patch}}).take()).scroll,0);
});
test('account snapshot cannot leak into another account or guest, and guest storage cannot leak into signed',async()=>{
  const f=fixture({...saved(),owner:'user:A'},{user:{id:'B'},local:saved(),cloud:{scroll:170}});
  assert.equal((await f.take()).scroll,170);assert.equal(f.cloudCalls,1);
  assert.equal((await fixture({...saved(),owner:'user:A'}).take()).scroll,0);
});
test('interactive chapter selection, Continue and history traversal keep their existing positioning',async()=>{
  assert.equal(await fixture(saved()).take(0,true),null);assert.equal(await fixture(saved()).take(null,true),null);
  const live=fixture(saved(),{type:'back_forward'});live.events.get('popstate')();live.c.navigationEpoch++;
  assert.equal((await live.take()).native,true);
});
test('unowned old snapshots cannot establish account scope; fall back to per-story progress',async()=>{
  for(const old of [{path:readerPath,scroll:600,at:Date.now()},{...saved(),owner:undefined}]){
    assert.equal((await fixture(old,{type:'reload'}).take()).scroll,0);
    assert.equal((await fixture(old,{local:{...saved(),scroll:170}}).take()).scroll,170);
    assert.equal((await fixture(old,{type:'reload',user:{id:'B'}}).take()).scroll,350);
  }
});
test('history navigation cancels pending restore and only the routed popstate epoch yields to browser',async()=>{
  const f=fixture(saved());await f.take();f.events.get('popstate')();assert.equal(f.c.NcaReaderPosition.isRestoring(),false);assert.equal(f.c.history.scrollRestoration,'auto');
  f.c.navigationEpoch++;assert.equal((await f.take()).native,true);assert.equal(await f.take(0,true),null);
});
