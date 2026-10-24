const test = require('node:test');
const assert = require('node:assert/strict');
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

test('guest uses moving 3-day server-time window only',()=>{
  assert.equal(F.markerFor(entry(),{authenticated:false,catalogNowMs:now}).isNew,true);
  const old=entry({storyAt:now-F.THREE_DAYS_MS-1,chapterAt:now-F.THREE_DAYS_MS-1});
  assert.deepEqual(F.markerFor(old,{authenticated:false,catalogNowMs:now}),{isNew:false,storyNew:false,chapterNew:false,chapterId:null});
});

test('authenticated baseline cutoff is fixed and does not expire with wall time',()=>{
  const cutoff=Date.parse('2026-10-21T10:00:00Z');
  const e=entry({storyAt:cutoff+1,chapterAt:cutoff+1});
  const marker=F.markerFor(e,{authenticated:true,catalogNowMs:Date.parse('2027-01-01T00:00:00Z'),baselineCutoffMs:cutoff,ack:{storyAck:0n,chapterAck:0n}});
  assert.equal(marker.isNew,true);
});

test('baseline does not mean acknowledged',()=>{
  const marker=F.markerFor(entry(),{authenticated:true,catalogNowMs:now,baselineCutoffMs:Date.parse('2026-10-21T10:00:00Z'),ack:undefined});
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

test('parser rejects malformed publication catalog',()=>{
  assert.throws(()=>F.parseCatalog({server_now:'2026-10-24T10:00:00Z',stories:[{story_id:2,story_sequence:'bad',story_occurred_at:'2026-10-24T09:00:00Z',chapter_sequence:null,chapter_occurred_at:null,chapter_id:null}]}),/INVALID_FRESHNESS_CATALOG/);
});
