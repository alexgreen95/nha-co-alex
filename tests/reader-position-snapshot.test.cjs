'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/reader-reload-position-v30.js'),'utf8');
const tab='nca-reader-tab:11111111-1111-4111-8111-111111111111',readerPath='/truyen/story/chuong-1';
const saved=()=>({version:2,tab,path:readerPath,storyId:'1',chapterId:'10',scroll:600,at:Date.now()});
function fixture(record,{type='navigate',url=readerPath,legacyTiming=false}={}){
  const story={id:1,chapters:[{id:10},{id:11}]},events=new Map();let stored=JSON.stringify(record);
  const c={name:tab,crypto:{randomUUID:()=>assert.fail('same tab must retain identity')},location:{pathname:url},performance:{getEntriesByType:()=>legacyTiming?[]:[{type}],navigation:{type:legacyTiming?1:0}},history:{scrollRestoration:'auto'},document:{},sessionStorage:{getItem:()=>stored,setItem:(key,value)=>stored=value,removeItem:()=>stored=null},addEventListener:(name,fn)=>events.set(name,fn),requestAnimationFrame:()=>1,cancelAnimationFrame(){},chapterPath:(s,i)=>'/truyen/story/chuong-'+(i+1),navigationEpoch:1};
  c.window=c;vm.createContext(c);vm.runInContext(source,c);return {c,story,events,take:(explicit=0,update=false)=>c.NcaReaderPosition.consume(story,0,explicit,update)};
}
test('same-tab exact normalized path is eligible once for reload and re-entry',()=>{
  for(const type of ['navigate','reload']){
    const f=fixture(saved(),{type,url:readerPath+'/'});assert.equal(f.take().scroll,600);assert.equal(f.take(),null);assert.equal(f.c.history.scrollRestoration,'manual');
  }
});
for(const [label,patch] of [['other tab',{tab:'unrelated'}],['other path',{path:'/truyen/story/chuong-2'}],['other story',{storyId:'2'}],['other chapter',{chapterId:'11'}],['expired',{at:Date.now()-7*60*60*1000}],['future',{at:Date.now()+60000}],['negative',{scroll:-1}],['infinite',{scroll:Infinity}],['coerced string',{scroll:'600'}]])test('rejects '+label+' snapshot',()=>{
  const f=fixture({...saved(),...patch});assert.equal(f.take(),null);assert.equal(f.c.history.scrollRestoration,'auto');
});
test('interactive chapter selection, cloud Continue and history traversal do not consume a resume',()=>{
  assert.equal(fixture(saved()).take(0,true),null);assert.equal(fixture(saved()).take(null,true),null);
  assert.equal(fixture(saved(),{type:'back_forward'}).take().native,true);
});
test('legacy reload snapshots upgrade, including the older navigation timing API',()=>{
  const old={path:readerPath,scroll:600,at:Date.now()};
  assert.equal(fixture(old,{type:'reload'}).take().scroll,600);
  assert.equal(fixture(old,{legacyTiming:true}).take().scroll,600);
  const navigate=fixture(old);assert.equal(navigate.take(),null);
  assert.equal(navigate.c.sessionStorage.getItem(),null,'an unowned legacy copy must not become eligible on a later reload');
});
test('history navigation cancels an in-flight resume and restores native scroll mode',()=>{
  const f=fixture(saved());f.take();f.events.get('popstate')();assert.equal(f.c.NcaReaderPosition.isRestoring(),false);assert.equal(f.c.history.scrollRestoration,'auto');
});
test('only the routed popstate epoch yields to native history restoration',()=>{
  const f=fixture(saved());f.take();f.events.get('popstate')();f.c.navigationEpoch++;
  assert.equal(f.take().native,true);assert.equal(f.take(0,true),null);
});
