'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const start=html.indexOf(' function drafts(fn){');
assert(start>=0,'scoped comment draft preservation must exist');
const end=html.indexOf('\n function storyFor(',start);
assert(end>start,'draft preservation boundary must exist');
const source=html.slice(start,end);

function fixture({x=0,y=600}={}){
  const calls=[],tokens=[{id:'mention',start:0,end:4}];
  const input={id:'reply',value:'@Alex draft',selectionStart:2,selectionEnd:7,disabled:true,focus(options){calls.push(['focus',options]);},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}};
  const panel={scrollTop:37};
  const context={scrollX:x,scrollY:y,mentionInputSelector:'.draft',mentionDrafts:new Map(),reconcileMentionDraft:()=>({tokens}),closeMentionPopup(){},closeEmojiPicker(){},
    document:{activeElement:input,querySelectorAll:selector=>selector==='.draft'?[input]:[panel],getElementById:()=>input},
    window:{scrollTo(a,b){calls.push(['scroll',a,b]);context.scrollX=a;context.scrollY=b;},syncStoryCommentMore(){calls.push(['sync']);}}};
  vm.createContext(context);vm.runInContext(source+';this.run=drafts;',context);
  return {context,input,panel,calls,run:context.run};
}

test('comment repaint does not issue an unchanged window scroll that interrupts reader restoration',()=>{
  for(const position of [{x:0,y:0},{x:0,y:600},{x:12,y:600}]){
    const f=fixture(position);f.run(()=>{});
    assert.deepEqual(f.calls.filter(c=>c[0]==='scroll'),[]);
  }
});

test('comment repaint still restores displaced window and panel positions',()=>{
  const f=fixture({x:12,y:600});
  f.run(()=>{f.context.scrollX=0;f.context.scrollY=11;f.panel.scrollTop=0;});
  assert.deepEqual(f.calls.filter(c=>c[0]==='scroll'),[['scroll',12,600]]);
  assert.equal(f.panel.scrollTop,37);
});

test('comment repaint preserves focused draft, selection, mentions and disabled state',()=>{
  const f=fixture();
  f.run(()=>{f.input.value='replacement';f.input.disabled=false;f.input.selectionStart=0;f.input.selectionEnd=0;});
  assert.equal(f.input.value,'@Alex draft');assert.equal(f.input.disabled,true);
  assert.equal(f.input.selectionStart,2);assert.equal(f.input.selectionEnd,7);
  assert.deepEqual(JSON.parse(JSON.stringify(f.context.mentionDrafts.get(f.input))),{value:'@Alex draft',tokens:[{id:'mention',start:0,end:4}]});
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.filter(c=>c[0]==='focus'))),[['focus',{preventScroll:true}]]);
  assert.equal(f.calls.filter(c=>c[0]==='sync').length,1);
});

test('inline application scripts remain valid JavaScript',()=>{
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
    if(!/\bsrc\s*=/.test(match[1]))new vm.Script(match[2]);
  }
});
