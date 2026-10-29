'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/freshness-ui.js'),'utf8');
const start=source.indexOf('  function patchReaderAction(name){'),end=source.indexOf('  function installInteractionHooks()',start);
function fixture(){
  const pending=[],acks=[];
  const c={navigationEpoch:0,current:null,currentChapterDescriptor:()=>c.current,activeCompletionCurrent:()=>false,armChapterCompletion(){},controller:{ackChapterOpen:async(story,chapter)=>acks.push(chapter)},root:{read(id){c.current={storyId:1,chapterId:id};c.navigationEpoch++;return new Promise(resolve=>pending.push(resolve));}}};
  vm.createContext(c);vm.runInContext(source.slice(start,end)+';patchReaderAction("read");',c);return {c,pending,acks};
}
test('late accounting completion cannot acknowledge a newer chapter',async()=>{
  const f=fixture(),a=f.c.root.read(1);f.c.navigationEpoch++;const b=f.c.root.read(2);f.c.navigationEpoch++;
  f.pending[0]();await a;await new Promise(setImmediate);assert.deepEqual(f.acks,[]);
  f.pending[1]();await b;await new Promise(setImmediate);assert.deepEqual(f.acks,[2]);
});
test('newer navigation to the same chapter still invalidates an old acknowledgement',async()=>{
  const f=fixture(),a=f.c.root.read(1);f.c.navigationEpoch+=3;f.pending[0]();await a;await new Promise(setImmediate);assert.deepEqual(f.acks,[]);
});
test('initial direct route continues to avoid an interactive freshness acknowledgement',async()=>{
  const f=fixture(),a=f.c.root.read(1,0,false);f.c.navigationEpoch++;f.pending[0]();await a;await new Promise(setImmediate);assert.deepEqual(f.acks,[]);
});
