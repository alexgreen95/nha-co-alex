/* Initial/direct entry resumes this tab, then this story's progress; targets and history own their scroll. */
(function(root){
  'use strict';
  if(typeof root!=='object'||typeof document!=='object')return;
  const STORAGE_KEY='nca_reader_reload_position_v1',GUEST_PREFIX='nca_reader_progress_v1:guest:',MAX_AGE=6*60*60*1000,TAB_PREFIX='nca-reader-tab:';
  const cleanPath=path=>String(path||'').replace(/\/+$/,'');
  const readerPath=path=>/^\/truyen\/[^/]+\/chuong-\d+$/.test(cleanPath(path));
  const navigation=performance.getEntriesByType?.('navigation')[0]?.type||({0:'navigate',1:'reload',2:'back_forward'})[performance.navigation?.type];
  let tab=null,candidate=null,active=null,rendered=null,frame=0,consumed=false,historyEpoch=null,progressUnknown=false;
  let guestTimer=null,guestPending=null,guestSince=0;
  const owner=()=>typeof authUser==='undefined'||!authUser?'guest':'user:'+authUser.id;
  try{
    // sessionStorage may be copied to an opener's new tab; window.name is not.
    if(!new RegExp('^'+TAB_PREFIX+'[a-f0-9-]{32,36}$').test(root.name||''))root.name=TAB_PREFIX+(root.crypto.randomUUID?.()||Array.from(root.crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join(''));
    tab=root.name;
    const saved=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null'),age=Date.now()-saved?.at;
    const modern=saved?.version===2&&saved.tab===tab&&typeof saved.owner==='string'&&typeof saved.storyId==='string'&&typeof saved.chapterId==='string';
    // Old unowned records cannot establish account scope; use normal per-story progress instead.
    if(modern&&readerPath(saved.path)&&cleanPath(saved.path)===cleanPath(location.pathname)&&typeof saved.scroll==='number'&&Number.isFinite(saved.scroll)&&saved.scroll>=0&&Number.isFinite(age)&&age>=0&&age<=MAX_AGE)candidate=saved;
  }catch{}

  function flushGuest(){
    root.clearTimeout(guestTimer);guestTimer=null;guestSince=0;
    const value=guestPending;guestPending=null;
    if(!value||owner()!=='guest')return;
    try{
      const key=GUEST_PREFIX+value.storyId,old=JSON.parse(localStorage.getItem(key)||'null');
      if(!old||!(old.at>value.at))localStorage.setItem(key,JSON.stringify(value));
    }catch{}
  }
  function queueGuest(value){
    if(owner()!=='guest')return;
    if(guestPending&&guestPending.storyId!==value.storyId)flushGuest();
    guestPending={version:1,owner:'guest',...value,at:Date.now()};
    if(!guestSince)guestSince=Date.now();
    root.clearTimeout(guestTimer);
    guestTimer=root.setTimeout(flushGuest,Math.max(0,Math.min(250,1000-(Date.now()-guestSince))));
  }
  function guestProgress(target){
    let value=null;
    try{value=JSON.parse(localStorage.getItem(GUEST_PREFIX+target.storyId)||'null');}catch{}
    if(value?.owner!=='guest'||value.storyId!==target.storyId||value.chapterId!==target.chapterId||cleanPath(value.path)!==target.path||typeof value.scroll!=='number'||!Number.isFinite(value.scroll)||value.scroll<0||!Number.isFinite(value.at)||value.at>Date.now())return {scroll:0};
    return {scroll:value.scroll};
  }

  function identity(story,chapter){
    const row=story?.chapters?.[chapter];
    return row?{storyId:String(story.id),chapterId:String(row.id),path:cleanPath(chapterPath(story,chapter))}:null;
  }
  function current(job){
    return active===job&&owner()===job.owner&&rendered?.storyId===job.storyId&&rendered?.chapterId===job.chapterId&&cleanPath(location.pathname)===job.path&&navigationEpoch===job.epoch&&!document.getElementById('reader')?.classList.contains('hidden');
  }
  function persist(value){
    if(!tab)return;
    try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify({version:2,tab,owner:owner(),...value,at:Date.now()}));}catch{}
    queueGuest(value);
  }
  function snapshot(){
    frame=0;
    if(candidate||active||progressUnknown||!rendered||rendered.owner!==owner()||!readerPath(location.pathname)||cleanPath(location.pathname)!==rendered.path||document.getElementById('reader')?.classList.contains('hidden'))return;
    // A URL can advance while the old chapter DOM is still visible.
    const actual=typeof currentStory==='undefined'?null:identity(currentStory,currentChapter);
    if(actual?.storyId!==rendered.storyId||actual?.chapterId!==rendered.chapterId)return;
    persist({...rendered,scroll:Math.max(0,Math.round(root.scrollY||0))});
  }
  function queueSnapshot(){if(!frame)frame=root.requestAnimationFrame(snapshot);}
  function cancel(){
    candidate=null;
    progressUnknown=false;
    const job=active;active=null;
    if(job){job.observer?.disconnect();if(job.frame)root.cancelAnimationFrame(job.frame);job.cleanup?.();if(job.historyMode!==undefined)history.scrollRestoration=job.historyMode;}
  }
  function restoring(){
    if(active&&(active.epoch!==undefined?!current(active):owner()!==active.owner||navigationEpoch!==active.requestEpoch||cleanPath(location.pathname)!==active.path))cancel();
    return !!candidate||!!active||progressUnknown;
  }
  async function consume(story,chapter,explicit,updateRoute){
    const traversal=historyEpoch===navigationEpoch||!consumed&&navigation==='back_forward';historyEpoch=null;
    if(traversal&&explicit!==null&&updateRoute===false){consumed=true;cancel();return {native:true,scroll:0};}
    if(consumed)return null;consumed=true;
    const target=identity(story,chapter);
    if(explicit===null||updateRoute!==false||!target||target.path!==cleanPath(location.pathname)){cancel();return null;}
    const job={...target,story,chapter,owner:owner(),scroll:0,requestEpoch:navigationEpoch,historyMode:history.scrollRestoration};
    active=job;history.scrollRestoration='manual';
    // A surviving tab owns its exact position, independently of other tabs of the same story.
    const ownSnapshot=candidate&&candidate.owner===job.owner&&candidate.storyId===target.storyId&&candidate.chapterId===target.chapterId;
    const selected=ownSnapshot?{scroll:candidate.scroll}:job.owner==='guest'?guestProgress(target):await initialReaderProgress(story,chapter);
    candidate=null;
    if(selected.cancelled||owner()!==job.owner||navigationEpoch!==job.requestEpoch){if(active===job)cancel();return {cancelled:true};}
    if(active!==job)return {native:true,scroll:0,skipProgress:true}; // User interaction owns positioning, but must not strand the initial render.
    job.scroll=selected.scroll;job.skipProgress=selected.skipProgress===true;job.recheck=selected.recheck;return job;
  }
  function didRender(story,chapter,resume){
    rendered={...identity(story,chapter),owner:owner()};
    if(!active)progressUnknown=resume?.skipProgress===true;
    if(active){
      if(active.story!==story||active.chapter!==chapter||active.epoch!==undefined||navigationEpoch!==active.requestEpoch+1)cancel();
      else active.epoch=navigationEpoch;
    }
    queueSnapshot();
  }
  function restore(job){
    if(job.native)return; // Back/Forward belongs to the browser, not the initial-resume controller.
    if(active!==job)return;
    if(!current(job)){cancel();return;}
    const chapter=document.getElementById('chapter'),reader=document.getElementById('reader');
    const apply=()=>{
      job.frame=0;
      if(!current(job)){if(active===job)cancel();return;}
      const max=Math.max(0,document.documentElement.scrollHeight-root.innerHeight),top=Math.min(job.scroll,max);
      if(root.scrollY!==top||root.scrollX!==0)root.scrollTo({top,left:0,behavior:'instant'});
    };
    const queue=()=>{if(active===job&&!job.frame)job.frame=root.requestAnimationFrame(apply);};
    const cleanup=[];
    job.cleanup=()=>cleanup.forEach(fn=>fn());
    // React to actual layout/resource completion rather than a timer/retry loop.
    if(typeof ResizeObserver==='function'){job.observer=new ResizeObserver(queue);job.observer.observe(chapter);job.observer.observe(reader);}
    apply();
    const images=[...chapter.querySelectorAll('img')].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{
      const done=()=>{img.removeEventListener('load',done);img.removeEventListener('error',done);resolve();};
      img.addEventListener('load',done,{once:true});img.addEventListener('error',done,{once:true});cleanup.push(done);
    }));
    // Force font discovery before reading fonts.ready.
    chapter.getBoundingClientRect();
    Promise.all([...images,document.fonts?.ready]).then(()=>{
      if(!current(job))return;
      root.requestAnimationFrame(()=>root.requestAnimationFrame(()=>{
        if(!current(job))return;
        apply();cancel();progressUnknown=job.skipProgress;snapshot();
        // A genuinely shorter chapter uses the existing progress setter for its clamped position.
        if(!job.skipProgress&&typeof setReadingProgress==='function'&&Math.round(root.scrollY)!==Math.round(job.scroll))setReadingProgress(job.story.id,job.chapter,root.scrollY);
      }));
    }).catch(()=>{if(current(job)){apply();cancel();progressUnknown=job.skipProgress;snapshot();}});
  }
  root.addEventListener('scroll',queueSnapshot,{passive:true});
  const departing=()=>{
    if(candidate){if(candidate.owner===owner())persist({path:cleanPath(candidate.path),storyId:candidate.storyId,chapterId:candidate.chapterId,scroll:candidate.scroll});}
    else if(active){if(active.owner===owner()&&active.epoch!==undefined&&!active.skipProgress)persist({path:active.path,storyId:active.storyId,chapterId:active.chapterId,scroll:active.scroll});}
    else snapshot();
  };
  const flush=()=>{departing();flushGuest();};
  root.addEventListener('pagehide',flush);root.addEventListener('beforeunload',flush);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
  root.addEventListener('popstate',()=>{cancel();historyEpoch=navigationEpoch+1;});
  for(const type of ['wheel','touchstart','pointerdown'])root.addEventListener(type,cancel,{passive:true});
  root.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))cancel();});
  root.NcaReaderPosition=Object.freeze({consume,didRender,restore,cancel,isRestoring:restoring});
})(typeof window==='object'?window:globalThis);
