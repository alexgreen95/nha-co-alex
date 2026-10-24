const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../assets/freshness.js');

const now = Date.parse('2026-10-24T10:00:00Z');
function entry(overrides={}) {
  return {
    storyId:2,
    storySequence:1n,
    storyAt:Date.parse('2026-10-24T09:00:00Z'),
    chapterSequence:2n,
    chapterAt:Date.parse('2026-10-24T09:30:00Z'),
    chapterId:967,
    ...overrides
  };
}
function catalogPayload(){
  return {server_now:'2026-10-24T10:00:00Z',stories:[{
    story_id:2,story_sequence:'1',story_occurred_at:'2026-10-24T09:00:00Z',
    chapter_sequence:'2',chapter_occurred_at:'2026-10-24T09:30:00Z',chapter_id:967
  }],recent_chapters:[
    {story_id:2,chapter_id:966,chapter_sequence:'1',chapter_occurred_at:'2026-10-24T09:20:00Z'},
    {story_id:2,chapter_id:967,chapter_sequence:'2',chapter_occurred_at:'2026-10-24T09:30:00Z'}
  ]};
}
function statePayload(overrides={}){
  return {baseline_cutoff_at:'2026-10-21T10:00:00Z',acks:[],read_chapter_ids:[],...overrides};
}

test('guest uses moving 3-day server-time window only',()=>{
  assert.equal(F.markerFor(entry(),{authenticated:false,catalogNowMs:now}).isNew,true);
  const old=entry({storyAt:now-F.THREE_DAYS_MS-1,chapterAt:now-F.THREE_DAYS_MS-1});
  assert.deepEqual(F.markerFor(old,{authenticated:false,catalogNowMs:now}),{isNew:false,storyNew:false,chapterNew:false,chapterId:null});
});

test('authenticated old account also expires after rolling 3-day server window',()=>{
  const occurred=Date.parse('2026-10-24T09:00:00Z');
  const later=occurred+F.THREE_DAYS_MS+1;
  const old=entry({storyAt:occurred,chapterAt:occurred});
  const marker=F.markerFor(old,{
    authenticated:true,
    catalogNowMs:later,
    baselineCutoffMs:Date.parse('2026-10-01T00:00:00Z'),
    ack:{storyAck:0n,chapterAck:0n}
  });
  assert.deepEqual(marker,{isNew:false,storyNew:false,chapterNew:false,chapterId:null});
});

test('first account baseline limits initial history without acknowledging it',()=>{
  const baseline=Date.parse('2026-10-21T10:00:00Z');
  const e=entry({storyAt:baseline+1,chapterAt:baseline+1});
  const marker=F.markerFor(e,{authenticated:true,catalogNowMs:now,baselineCutoffMs:baseline,ack:undefined});
  assert.equal(marker.storyNew,true);
  assert.equal(marker.chapterNew,true);
});

test('story ack clears story only, not chapter',()=>{
  const marker=F.markerFor(entry(),{authenticated:true,catalogNowMs:now,baselineCutoffMs:Date.parse('2026-10-21T10:00:00Z'),ack:{storyAck:1n,chapterAck:0n}});
  assert.equal(marker.storyNew,false);
  assert.equal(marker.chapterNew,true);
  assert.equal(marker.isNew,true);
});

test('opening old chapter cannot clear latest chapter frontier',()=>{
  const marker=F.markerFor(entry(),{authenticated:true,catalogNowMs:now,baselineCutoffMs:Date.parse('2026-10-21T10:00:00Z'),ack:{storyAck:1n,chapterAck:1n}});
  assert.equal(marker.chapterNew,true);
  assert.equal(marker.chapterId,967);
});

test('newer genuine chapter reappears after prior frontier acknowledged',()=>{
  const next=entry({chapterSequence:3n,chapterId:968,chapterAt:Date.parse('2026-10-24T10:01:00Z')});
  const marker=F.markerFor(next,{authenticated:true,catalogNowMs:Date.parse('2026-10-24T10:02:00Z'),baselineCutoffMs:Date.parse('2026-10-21T10:00:00Z'),ack:{storyAck:1n,chapterAck:2n}});
  assert.equal(marker.chapterNew,true);
  assert.equal(marker.chapterId,968);
});

test('sequences compare as bigint, not Number or lexicographic strings',()=>{
  const e=entry({chapterSequence:9007199254740993n});
  const marker=F.markerFor(e,{authenticated:true,catalogNowMs:now,baselineCutoffMs:Date.parse('2026-10-21T10:00:00Z'),ack:{storyAck:1n,chapterAck:9007199254740992n}});
  assert.equal(marker.chapterNew,true);
});

test('chapter marker is independent per recent genuine chapter',()=>{
  const catalog=F.parseCatalog(catalogPayload());
  const first=catalog.recentChapters.get('2:966'),second=catalog.recentChapters.get('2:967');
  assert.equal(F.chapterMarkerFor(first,{authenticated:true,catalogNowMs:now,baselineCutoffMs:Date.parse('2026-10-21T10:00:00Z'),read:false}).isNew,true);
  assert.equal(F.chapterMarkerFor(first,{authenticated:true,catalogNowMs:now,baselineCutoffMs:Date.parse('2026-10-21T10:00:00Z'),read:true}).isNew,false);
  assert.equal(F.chapterMarkerFor(second,{authenticated:true,catalogNowMs:now,baselineCutoffMs:Date.parse('2026-10-21T10:00:00Z'),read:false}).isNew,true);
});

test('chapter marker also expires at three days',()=>{
  const chapter={storyId:2,chapterId:966,sequence:1n,occurredAt:now-F.THREE_DAYS_MS-1};
  assert.equal(F.chapterMarkerFor(chapter,{authenticated:false,catalogNowMs:now}).isNew,false);
});

test('parser rejects malformed publication catalog',()=>{
  assert.throws(()=>F.parseCatalog({server_now:'2026-10-24T10:00:00Z',stories:[{story_id:2,story_sequence:'bad',story_occurred_at:'2026-10-24T09:00:00Z',chapter_sequence:null,chapter_occurred_at:null,chapter_id:null}]}),/INVALID_FRESHNESS_CATALOG/);
  assert.throws(()=>F.parseCatalog({server_now:'2026-10-24T10:00:00Z',stories:[],recent_chapters:[{story_id:2,chapter_id:4,chapter_sequence:'x',chapter_occurred_at:'2026-10-24T09:00:00Z'}]}),/INVALID_FRESHNESS_CATALOG/);
});

test('guest load never creates per-account state',async()=>{
  const calls=[];
  const sb={rpc:async(name,args)=>{calls.push([name,args]);return {data:catalogPayload()};}};
  const controller=F.create({sb,getAccount:()=>null});
  assert.equal(await controller.load(),true);
  assert.deepEqual(calls.map(([name])=>name),['nca_get_freshness_catalog']);
  assert.equal(controller.marker(2).isNew,true);
  assert.equal(controller.chapterMarker(2,966).isNew,true);
  assert.equal(await controller.markChapterRead(2,966),false);
  assert.equal(calls.length,1);
});

test('story acknowledgement is separate from chapter acknowledgement',async()=>{
  const calls=[];
  const account='user-1';
  const sb={rpc:async(name,args)=>{
    calls.push([name,args]);
    if(name==='nca_get_freshness_catalog')return {data:catalogPayload()};
    if(name==='nca_get_freshness_state')return {data:statePayload()};
    if(name==='nca_ack_story_freshness')return {data:{acknowledged:true,story_ack_sequence:'1'}};
    throw new Error('unexpected rpc '+name);
  }};
  const controller=F.create({sb,getAccount:()=>account});
  await controller.load();
  assert.equal(await controller.ackStoryOpen(2),true);
  const marker=controller.marker(2);
  assert.equal(marker.storyNew,false);
  assert.equal(marker.chapterNew,true);
  assert.deepEqual(calls.at(-1),['nca_ack_story_freshness',{p_story_id:2}]);
});

test('old chapter is rejected client-side before frontier ack rpc',async()=>{
  const calls=[];
  const account='user-1';
  const sb={rpc:async(name,args)=>{
    calls.push([name,args]);
    if(name==='nca_get_freshness_catalog')return {data:catalogPayload()};
    if(name==='nca_get_freshness_state')return {data:statePayload()};
    throw new Error('unexpected rpc '+name);
  }};
  const controller=F.create({sb,getAccount:()=>account});
  await controller.load();
  const before=calls.length;
  assert.equal(await controller.ackChapterOpen(2,966),false);
  assert.equal(calls.length,before);
  assert.equal(controller.marker(2).chapterNew,true);
});

test('reading one recent chapter clears only its chapter marker',async()=>{
  const calls=[];
  const account='user-1';
  const sb={rpc:async(name,args)=>{
    calls.push([name,args]);
    if(name==='nca_get_freshness_catalog')return {data:catalogPayload()};
    if(name==='nca_get_freshness_state')return {data:statePayload()};
    if(name==='nca_mark_chapter_freshness_read')return {data:{acknowledged:true,story_id:2,chapter_id:966,chapter_sequence:'1'}};
    throw new Error('unexpected rpc '+name);
  }};
  const controller=F.create({sb,getAccount:()=>account});
  await controller.load();
  assert.equal(controller.chapterMarker(2,966).isNew,true);
  assert.equal(controller.chapterMarker(2,967).isNew,true);
  assert.equal(await controller.markChapterRead(2,966),true);
  assert.equal(controller.chapterMarker(2,966).isNew,false);
  assert.equal(controller.chapterMarker(2,967).isNew,true);
  assert.deepEqual(calls.at(-1),['nca_mark_chapter_freshness_read',{p_story_id:2,p_chapter_id:966}]);
});

test('saved chapter read state is restored per account',async()=>{
  const account='user-1';
  const sb={rpc:async(name)=>{
    if(name==='nca_get_freshness_catalog')return {data:catalogPayload()};
    if(name==='nca_get_freshness_state')return {data:statePayload({read_chapter_ids:[966]})};
    throw new Error('unexpected rpc '+name);
  }};
  const controller=F.create({sb,getAccount:()=>account});
  await controller.load();
  assert.equal(controller.chapterMarker(2,966).isNew,false);
  assert.equal(controller.chapterMarker(2,967).isNew,true);
});

test('controller schedules the nearest server-time 3-day expiry',async()=>{
  const sb={rpc:async(name)=>{
    if(name==='nca_get_freshness_catalog')return {data:catalogPayload()};
    throw new Error('unexpected rpc '+name);
  }};
  const controller=F.create({sb,getAccount:()=>null});
  await controller.load();
  assert.equal(controller.msUntilNextExpiry(),F.THREE_DAYS_MS-60*60*1000);
});

test('ribbon CSS tucks home ribbon into card and uses small cover ribbon',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../assets/freshness-ui.js'),'utf8');
  assert.match(source,/\.freshness-ribbon\[hidden\]\{display:none!important\}/);
  assert.match(source,/\.story-card\{overflow:hidden\}/);
  assert.match(source,/\.story-card>\.freshness-ribbon\{right:-19px;bottom:20px/);
  assert.match(source,/\.profile-story-cover>\.freshness-ribbon\{left:-23px;top:13px;width:78px;height:19px/);
  assert.match(source,/body\.smoky\{--fresh-ribbon-bg:#8f748e/);
  assert.match(source,/border-radius:0/);
});

test('chapter list UI renders fresh badges and completes only after reader interaction',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../assets/freshness-ui.js'),'utf8');
  assert.match(source,/chapter-freshness-badge/);
  assert.match(source,/document\.querySelectorAll\('#introChapters button'\)/);
  assert.match(source,/activeCompletion\.gesture/);
  assert.match(source,/ncaFreshness/);
  assert.match(source,/markChapterRead/);
});
