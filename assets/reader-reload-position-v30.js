/* Same-tab, exact-chapter resume. Initial positioning never uses smooth scrolling. */
(function(root){
  'use strict';
  if(typeof root!=='object'||typeof document!=='object')return;
  const STORAGE_KEY='nca_reader_reload_position_v1',MAX_AGE=6*60*60*1000,TAB_PREFIX='nca-reader-tab:';
  const cleanPath=path=>String(path||'').replace(/\/+$/,'');
  const readerPath=path=>/^\/truyen\/[^/]+\/chuong-\d+$/.test(cleanPath(path));
  const navigation=performance.getEntriesByType?.('navigation')[0]?.type||({0:'navigate',1:'reload',2:'back_forward'})[performance.navigation?.type];
  let tab=null,candidate=null,active=null,rendered=null,frame=0,consumed=false,historyEpoch=null;
  try{
    // sessionStorage may be copied to an opener's new tab; window.name is not.
    if(!new RegExp('^'+TAB_PREFIX+'[a-f0-9-]{32,36}$').test(root.name||''))root.name=TAB_PREFIX+(root.crypto.randomUUID?.()||Array.from(root.crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join(''));
    tab=root.name;
    const saved=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null'),age=Date.now()-saved?.at;
    const modern=saved?.version===2&&saved.tab===tab&&typeof saved.storyId==='string'&&typeof saved.chapterId==='string';
    const legacy=navigation==='reload'&&saved?.version===undefined; // One-time upgrade from the previous reload-only snapshot.
    if(saved&&saved.version===undefined&&!legacy)sessionStorage.removeItem(STORAGE_KEY);
    if((navigation==='reload'||navigation==='navigate')&&(modern||legacy)&&saved&&readerPath(saved.path)&&cleanPath(saved.path)===cleanPath(location.pathname)&&typeof saved.scroll==='number'&&Number.isFinite(saved.scroll)&&saved.scroll>=0&&Number.isFinite(age)&&age>=0&&age<=MAX_AGE)candidate=saved;
  }catch{}

  function identity(story,chapter){
    const row=story?.chapters?.[chapter];
    return row?{storyId:String(story.id),chapterId:String(row.id),path:cleanPath(chapterPath(story,chapter))}:null;
  }
  function current(job){
    return active===job&&rendered?.storyId===job.storyId&&rendered?.chapterId===job.chapterId&&cleanPath(location.pathname)===job.path&&navigationEpoch===job.epoch&&!document.getElementById('reader')?.classList.contains('hidden');
  }
  function persist(value){
    if(!tab)return;
    try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify({version:2,tab,...value,at:Date.now()}));}catch{}
  }
  function snapshot(){
    frame=0;
    if(candidate||active||!rendered||!readerPath(location.pathname)||cleanPath(location.pathname)!==rendered.path||document.getElementById('reader')?.classList.contains('hidden'))return;
    // A URL can advance while the old chapter DOM is still visible.
    const actual=typeof currentStory==='undefined'?null:identity(currentStory,currentChapter);
    if(actual?.storyId!==rendered.storyId||actual?.chapterId!==rendered.chapterId)return;
    persist({...rendered,scroll:Math.max(0,Math.round(root.scrollY||0))});
  }
  function queueSnapshot(){if(!frame)frame=root.requestAnimationFrame(snapshot);}
  function cancel(){
    candidate=null;
    const job=active;active=null;
    if(job){job.observer?.disconnect();if(job.frame)root.cancelAnimationFrame(job.frame);job.cleanup?.();if(job.historyMode!==undefined)history.scrollRestoration=job.historyMode;}
  }
  function restoring(){
    if(active&&(active.epoch!==undefined?!current(active):navigationEpoch!==active.requestEpoch||cleanPath(location.pathname)!==active.path))cancel();
    return !!candidate||!!active;
  }
  function consume(story,chapter,explicit,updateRoute){
    const traversal=historyEpoch===navigationEpoch||!consumed&&navigation==='back_forward';historyEpoch=null;
    if(traversal&&explicit!==null&&updateRoute===false){consumed=true;cancel();return {native:true,scroll:0};}
    if(consumed)return null;consumed=true;
    const saved=candidate;candidate=null;
    const target=identity(story,chapter);
    if(!saved||explicit===null||updateRoute!==false||!target||target.path!==cleanPath(location.pathname)||target.path!==cleanPath(saved.path)||saved.version===2&&(saved.storyId!==target.storyId||saved.chapterId!==target.chapterId))return null;
    const job={...target,story,chapter,scroll:saved.scroll,requestEpoch:navigationEpoch,historyMode:history.scrollRestoration};
    active=job;history.scrollRestoration='manual';return job;
  }
  function didRender(story,chapter){
    rendered=identity(story,chapter);
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
        apply();cancel();snapshot();
        // A genuinely shorter chapter uses the existing progress setter for its clamped position.
        if(typeof setReadingProgress==='function'&&Math.round(root.scrollY)!==Math.round(job.scroll))setReadingProgress(job.story.id,job.chapter,root.scrollY);
      }));
    }).catch(()=>{if(current(job)){apply();cancel();snapshot();}});
  }
  root.addEventListener('scroll',queueSnapshot,{passive:true});
  const departing=()=>{
    if(candidate){if(candidate.version===2)persist({path:cleanPath(candidate.path),storyId:candidate.storyId,chapterId:candidate.chapterId,scroll:candidate.scroll});}
    else if(active)persist({path:active.path,storyId:active.storyId,chapterId:active.chapterId,scroll:active.scroll});
    else snapshot();
  };
  root.addEventListener('pagehide',departing);root.addEventListener('beforeunload',departing);
  root.addEventListener('popstate',()=>{cancel();historyEpoch=navigationEpoch+1;});
  for(const type of ['wheel','touchstart','pointerdown'])root.addEventListener(type,cancel,{passive:true});
  root.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))cancel();});
  root.NcaReaderPosition=Object.freeze({consume,didRender,restore,cancel,isRestoring:restoring});
})(typeof window==='object'?window:globalThis);
