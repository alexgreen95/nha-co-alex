/* Resolve validated push IDs even when iOS launches the Home Screen app at its root instead of the requested URL. */
(function(root){
  'use strict';
  if(typeof document!=='object'||typeof location!=='object'||typeof history!=='object')return;
  const decimal=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
  function normalize(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
    const type=raw.type,category=raw.category;
    if(type==='content'){
      const story=raw.story_id??raw.story,chapter=raw.chapter_id??raw.chapter??null;
      if(!['new_story','new_chapter'].includes(category)||!decimal(story)||
        (category==='new_story'?chapter!==null:!decimal(chapter)))return null;
      return {type,category,story,chapter};
    }
    if(type==='personal'){
      const notification=raw.notification_id??raw.notification,story=raw.story_id??raw.story??null,
        chapter=raw.chapter_id??raw.chapter??null,comment=raw.comment_id??raw.comment??null;
      if(!['comment','reply','mention','comment_like'].includes(category)||!decimal(notification)||
        ![story,chapter,comment].every(v=>v===null||decimal(v))||(!comment&&!story))return null;
      return {type,category,notification,story,chapter,comment};
    }
    return null;
  }
  function fromUrl(){
    const q=new URLSearchParams(location.search),type=q.get('nca_push');
    if(!type)return null;
    return normalize({type,category:q.get('category'),notification_id:q.get('notification_id'),
      story_id:q.get('story_id'),chapter_id:q.get('chapter_id'),comment_id:q.get('comment_id')});
  }
  let pending=null,started=0,running=false,timer=null,lastKey='',lastAt=0;
  const keyOf=i=>JSON.stringify([i.type,i.category,i.notification||'',i.story||'',i.chapter||'',i.comment||'']);
  function cleanPushQuery(){
    const q=new URLSearchParams(location.search);
    if(!q.has('nca_push'))return;
    ['nca_push','category','notification_id','story_id','chapter_id','comment_id'].forEach(k=>q.delete(k));
    const suffix=q.toString()?'?'+q.toString():'';
    history.replaceState(history.state,'',location.pathname+suffix+location.hash);
  }
  function settle(){pending=null;started=0;if(timer){root.clearTimeout(timer);timer=null;}cleanPushQuery();}
  function retry(){if(pending&&!timer)timer=root.setTimeout(()=>{timer=null;run();},180)};
  function enqueue(raw){
    const intent=normalize(raw);if(!intent)return false;
    const key=keyOf(intent),now=Date.now();if(key===lastKey&&now-lastAt<10000)return true;
    lastKey=key;lastAt=now;pending=intent;started=now;retry();return true;
  }
  async function run(){
    if(!pending||running)return;
    if(Date.now()-started>30000){settle();return;}
    running=true;
    const intent=pending;
    try{
      if(intent.type==='personal'&&intent.comment){
        const nav=root.scopedComments?.navigate;
        if(typeof nav!=='function')return;
        if(await nav(intent.comment)){settle();return;}
        return;
      }
      if(typeof stories==='undefined'||!Array.isArray(stories))return;
      const story=stories.find(s=>String(s.id)===intent.story);if(!story)return;
      if(intent.chapter){
        const index=story.chapters?.findIndex(ch=>String(ch.id)===intent.chapter)??-1;
        if(index<0||typeof read!=='function')return;
        await read(story.id,index);settle();return;
      }
      if(typeof openStory!=='function')return;
      openStory(story.id);settle();
    }catch{}
    finally{running=false;if(pending)retry()}
  }
  if(root.navigator?.serviceWorker){
    root.navigator.serviceWorker.addEventListener('message',event=>{
      const data=event.data;
      if(!data||data.type!=='nca-push-click-v1')return;
      enqueue(data.intent);
    });
    const update=async()=>{try{const reg=await root.navigator.serviceWorker.getRegistration('/');if(reg)await reg.update();}catch{}};
    if(document.readyState==='complete')update();else root.addEventListener('load',update,{once:true});
  }
  const initial=fromUrl();if(initial)enqueue(initial);
})(typeof window==='object'?window:globalThis);
