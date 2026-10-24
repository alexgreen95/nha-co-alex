/* Publication-event freshness. Deliberately independent from Push and notification rows. */
(function (root) {
  'use strict';

  const THREE_DAYS_MS=3*24*60*60*1000;
  const MAX_SEQUENCE=9223372036854775807n;

  function asBigInt(value,fallback=0n){
    if(typeof value==='bigint')return value;
    if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value))return fallback;
    try{const result=BigInt(value);return result<=MAX_SEQUENCE?result:fallback}catch{return fallback}
  }
  function asTime(value){
    if(typeof value!=='string')return null;
    const ms=Date.parse(value);
    return Number.isFinite(ms)?ms:null;
  }
  function parseCatalog(payload){
    const nowMs=asTime(payload?.server_now);
    if(nowMs===null||!Array.isArray(payload?.stories))throw Error('INVALID_FRESHNESS_CATALOG');
    const stories=new Map();
    for(const row of payload.stories){
      const storyId=Number(row?.story_id);
      if(!Number.isSafeInteger(storyId)||storyId<=0||stories.has(storyId))throw Error('INVALID_FRESHNESS_CATALOG');
      const storySequence=row.story_sequence===null?null:asBigInt(row.story_sequence,-1n);
      const chapterSequence=row.chapter_sequence===null?null:asBigInt(row.chapter_sequence,-1n);
      const storyAt=row.story_occurred_at===null?null:asTime(row.story_occurred_at);
      const chapterAt=row.chapter_occurred_at===null?null:asTime(row.chapter_occurred_at);
      const chapterId=row.chapter_id===null?null:Number(row.chapter_id);
      if(storySequence===-1n||chapterSequence===-1n||
         (storySequence!==null&&storyAt===null)||
         (chapterSequence!==null&&(chapterAt===null||!Number.isSafeInteger(chapterId)||chapterId<=0))){
        throw Error('INVALID_FRESHNESS_CATALOG');
      }
      stories.set(storyId,Object.freeze({storyId,storySequence,storyAt,chapterSequence,chapterAt,chapterId}));
    }
    return Object.freeze({nowMs,stories});
  }
  function parseState(payload){
    const baselineCutoffMs=asTime(payload?.baseline_cutoff_at);
    if(baselineCutoffMs===null||!Array.isArray(payload?.acks))throw Error('INVALID_FRESHNESS_STATE');
    const acks=new Map();
    for(const row of payload.acks){
      const storyId=Number(row?.story_id);
      const storyAck=asBigInt(row?.story_ack_sequence,-1n);
      const chapterAck=asBigInt(row?.chapter_ack_sequence,-1n);
      if(!Number.isSafeInteger(storyId)||storyId<=0||storyAck<0n||chapterAck<0n||acks.has(storyId))throw Error('INVALID_FRESHNESS_STATE');
      acks.set(storyId,Object.freeze({storyAck,chapterAck}));
    }
    return Object.freeze({baselineCutoffMs,acks});
  }
  function markerFor(entry,{authenticated,catalogNowMs,baselineCutoffMs,ack}={}){
    if(!entry)return Object.freeze({isNew:false,storyNew:false,chapterNew:false,chapterId:null});
    const cutoffMs=authenticated?baselineCutoffMs:catalogNowMs-THREE_DAYS_MS;
    if(!Number.isFinite(cutoffMs))return Object.freeze({isNew:false,storyNew:false,chapterNew:false,chapterId:null});
    const storyAck=ack?.storyAck??0n,chapterAck=ack?.chapterAck??0n;
    const storyNew=entry.storySequence!==null&&entry.storyAt>=cutoffMs&&entry.storySequence>storyAck;
    const chapterNew=entry.chapterSequence!==null&&entry.chapterAt>=cutoffMs&&entry.chapterSequence>chapterAck;
    return Object.freeze({isNew:storyNew||chapterNew,storyNew,chapterNew,chapterId:chapterNew?entry.chapterId:null});
  }
  function create({sb,getAccount,onChange}={}){
    if(!sb?.rpc||typeof getAccount!=='function')throw Error('FRESHNESS_DEPENDENCIES_REQUIRED');
    let catalog=Object.freeze({nowMs:0,stories:new Map()}),state=null,generation=0;
    function emit(){try{onChange?.()}catch{}}
    async function rpc(name,args){
      const result=args?await sb.rpc(name,args):await sb.rpc(name);
      if(result?.error)throw result.error;
      return result?.data;
    }
    async function load(){
      const token=++generation,account=getAccount()||null;
      const [catalogPayload,statePayload]=await Promise.all([
        rpc('nca_get_freshness_catalog'),
        account?rpc('nca_get_freshness_state'):Promise.resolve(null)
      ]);
      if(token!==generation||account!==(getAccount()||null))return false;
      catalog=parseCatalog(catalogPayload);
      state=statePayload?parseState(statePayload):null;
      emit();
      return true;
    }
    function marker(storyId){
      const id=Number(storyId),entry=catalog.stories.get(id),account=getAccount()||null;
      return markerFor(entry,{
        authenticated:!!account,
        catalogNowMs:catalog.nowMs,
        baselineCutoffMs:state?.baselineCutoffMs,
        ack:state?.acks.get(id)
      });
    }
    async function ackStoryOpen(storyId){
      if(!getAccount())return false;
      const id=Number(storyId),current=marker(id);
      if(!current.storyNew)return false;
      const payload=await rpc('nca_ack_story_freshness',{p_story_id:id});
      if(payload?.acknowledged!==true)return false;
      const ackSequence=asBigInt(payload.story_ack_sequence,-1n);
      if(ackSequence<0n||!state)return false;
      const acks=new Map(state.acks),old=acks.get(id)||{storyAck:0n,chapterAck:0n};
      acks.set(id,Object.freeze({storyAck:old.storyAck>ackSequence?old.storyAck:ackSequence,chapterAck:old.chapterAck}));
      state=Object.freeze({...state,acks});emit();return true;
    }
    async function ackChapterOpen(storyId,chapterId){
      if(!getAccount())return false;
      const id=Number(storyId),cid=Number(chapterId),current=marker(id);
      if(!current.chapterNew||current.chapterId!==cid)return false;
      const payload=await rpc('nca_ack_chapter_freshness',{p_story_id:id,p_chapter_id:cid});
      if(payload?.acknowledged!==true)return false;
      const ackSequence=asBigInt(payload.chapter_ack_sequence,-1n);
      if(ackSequence<0n||!state)return false;
      const acks=new Map(state.acks),old=acks.get(id)||{storyAck:0n,chapterAck:0n};
      acks.set(id,Object.freeze({storyAck:old.storyAck,chapterAck:old.chapterAck>ackSequence?old.chapterAck:ackSequence}));
      state=Object.freeze({...state,acks});emit();return true;
    }
    function reset(){
      ++generation;catalog=Object.freeze({nowMs:0,stories:new Map()});state=null;emit();
    }
    return Object.freeze({
      load,reset,marker,ackStoryOpen,ackChapterOpen,
      get catalogLoaded(){return catalog.nowMs>0},
      get authenticated(){return !!getAccount()}
    });
  }
  root.NCAFreshness=Object.freeze({THREE_DAYS_MS,asBigInt,parseCatalog,parseState,markerFor,create});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.NCAFreshness;
})(typeof window!=='undefined'?window:globalThis);
