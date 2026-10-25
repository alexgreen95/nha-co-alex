/* Resolve validated push IDs to the site's canonical story/chapter/comment route. */
(function(root){
  'use strict';
  if(typeof document!=='object'||typeof location!=='object'||typeof history!=='object')return;
  const decimal=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
  function parse(){
    const q=new URLSearchParams(location.search),type=q.get('nca_push'),category=q.get('category');
    if(type==='content'){
      const story=q.get('story_id'),chapter=q.get('chapter_id');
      if(!['new_story','new_chapter'].includes(category)||!decimal(story)||
        (category==='new_story'?chapter!==null:!decimal(chapter)))return null;
      return {type,category,story,chapter};
    }
    if(type==='personal'){
      const notification=q.get('notification_id'),story=q.get('story_id'),chapter=q.get('chapter_id'),comment=q.get('comment_id');
      if(!['comment','reply','mention','comment_like'].includes(category)||!decimal(notification)||
        ![story,chapter,comment].every(v=>v===null||decimal(v))||(!comment&&!story))return null;
      return {type,category,notification,story,chapter,comment};
    }
    return null;
  }
  const intent=parse();if(!intent)return;
  const started=Date.now();let settled=false,running=false,timer=null;
  const retry=()=>{if(!settled)timer=root.setTimeout(run,220)};
  const fail=()=>{settled=true;if(timer)root.clearTimeout(timer);if(location.pathname==='/'&&location.search)history.replaceState(history.state,'','/')};
  const success=()=>{settled=true;if(timer)root.clearTimeout(timer)};
  async function run(){
    if(settled||running)return;
    if(Date.now()-started>20000){fail();return;}
    running=true;
    try{
      if(intent.type==='personal'&&intent.comment){
        const nav=root.scopedComments?.navigate;
        if(typeof nav!=='function')return;
        if(await nav(intent.comment)){success();return;}
        return;
      }
      const story=stories.find(s=>String(s.id)===intent.story);
      if(!story)return;
      const chapterId=intent.chapter;
      if(chapterId){
        const index=story.chapters?.findIndex(ch=>String(ch.id)===chapterId)??-1;
        if(index<0)return;
        await read(story.id,index);success();return;
      }
      openStory(story.id);success();
    }catch{}
    finally{running=false;if(!settled)retry()}
  }
  if(document.readyState==='complete')retry();
  else root.addEventListener('load',retry,{once:true});
})(typeof window==='object'?window:globalThis);
