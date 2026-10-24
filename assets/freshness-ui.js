/* UI adapter for publication freshness. Loaded separately from Push logic. */
(function(root){
  'use strict';

  const STYLE_ID='nca-freshness-style';
  let controller=null;
  let refreshQueued=false;
  let expiryTimer=null;
  let activeCompletion=null;
  let latestChapterUpdatedByStory=new Map();
  let chapterUpdateFlight=null;

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      :root{--fresh-ribbon-bg:#d789a4;--fresh-ribbon-fold:#a95770;--fresh-ribbon-fg:#fffafd}
      body.light{--fresh-ribbon-bg:#d789a4;--fresh-ribbon-fold:#a95770;--fresh-ribbon-fg:#fffafd}
      body.smoky{--fresh-ribbon-bg:#8f748e;--fresh-ribbon-fold:#625060;--fresh-ribbon-fg:#fffaff}
      body.dustyrose{--fresh-ribbon-bg:#b86f84;--fresh-ribbon-fold:#844a5c;--fresh-ribbon-fg:#fff8fa}
      body.mistblue{--fresh-ribbon-bg:#668f9a;--fresh-ribbon-fold:#466a73;--fresh-ribbon-fg:#f7fcfd}
      body.pastel{--fresh-ribbon-bg:#a98bc6;--fresh-ribbon-fold:#795f96;--fresh-ribbon-fg:#fffaff}
      body.night{--fresh-ribbon-bg:#718aa3;--fresh-ribbon-fold:#4b6176;--fresh-ribbon-fg:#f7fbff}
      body.purplenight{--fresh-ribbon-bg:#9878b8;--fresh-ribbon-fold:#684d83;--fresh-ribbon-fg:#fffaff}
      .story-card,.profile-story-cover{position:relative}
      .profile-story-cover{overflow:hidden}
      .freshness-ribbon{position:absolute;z-index:3;display:inline-flex;align-items:center;justify-content:center;padding:0 8px;font-weight:800;letter-spacing:.08em;line-height:1;color:var(--fresh-ribbon-fg);background:var(--fresh-ribbon-bg);border:0;border-radius:0;box-shadow:0 2px 6px color-mix(in srgb,var(--fg) 14%,transparent);pointer-events:none;user-select:none}
      .freshness-ribbon[hidden]{display:none!important}
      .story-card>.freshness-ribbon{right:0;bottom:40px;width:122px;height:28px;font-size:10.5px;transform:none;transform-origin:center}
      .story-card>.freshness-ribbon::before{content:"";position:absolute;left:-10px;top:4px;width:12px;height:28px;background:var(--fresh-ribbon-fold);clip-path:polygon(100% 0,100% 100%,0 80%,45% 50%,0 20%)}
      .story-card>.freshness-ribbon::after{content:"";position:absolute;right:0;top:100%;width:0;height:0;border-top:6px solid var(--fresh-ribbon-fold);border-left:8px solid transparent}
      .profile-story-cover>.freshness-ribbon{left:-23px;top:13px;width:78px;height:19px;font-size:8.5px;transform:rotate(-45deg);transform-origin:center;box-shadow:0 1px 4px color-mix(in srgb,var(--fg) 12%,transparent)}
      .profile-story-cover>.freshness-ribbon::after{content:"";position:absolute;right:0;top:100%;width:0;height:0;border-top:4px solid var(--fresh-ribbon-fold);border-left:5px solid transparent}
      #introChapters button{display:flex;align-items:center;gap:10px}
      .chapter-freshness-title{min-width:0;flex:1 1 auto}
      .chapter-freshness-badge{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;padding:3px 7px;border:1px solid color-mix(in srgb,var(--fresh-ribbon-bg) 55%,var(--line));background:color-mix(in srgb,var(--fresh-ribbon-bg) 16%,var(--card));color:color-mix(in srgb,var(--fresh-ribbon-bg) 78%,var(--fg));font-size:9px;font-weight:800;letter-spacing:.08em;line-height:1;border-radius:999px}
      .notif-filters{display:flex!important;flex-wrap:nowrap!important;overflow:visible!important;gap:5px!important;width:100%;padding-bottom:2px!important}
      .notif-filters button{flex:1 1 0;min-width:0;min-height:36px!important;padding:6px 6px!important;font-size:12px!important;white-space:nowrap!important}
      @media(max-width:700px){
        .story-card>.freshness-ribbon{right:0;bottom:36px;width:112px;height:26px;font-size:10px}
        .story-card>.freshness-ribbon::before{left:-9px;top:4px;width:11px;height:26px}
        .profile-story-cover>.freshness-ribbon{left:-21px;top:12px;width:72px;height:18px;font-size:8px}
        .chapter-freshness-badge{padding:3px 6px;font-size:8.5px}
        header .notif-filters{display:flex!important;flex-wrap:nowrap!important;overflow:visible!important;gap:4px!important;width:100%}
        header .notif-filters button{flex:1 1 0;min-width:0;min-height:34px!important;padding:5px 4px!important;font-size:11px!important;white-space:nowrap!important}
      }
      @media(max-width:360px){header .notif-filters button{padding-inline:2px!important;font-size:10px!important}}
    `;
    document.head.appendChild(style);
  }

  function storyIdFromElement(el){
    const owner=el.closest('.profile-story-tile,.story-card')||el;
    const raw=owner.getAttribute('onclick')||'';
    const match=/\bopenStory\(\s*([0-9]+)/.exec(raw);
    return match?Number(match[1]):null;
  }

  function ensureRibbon(host,storyId){
    let ribbon=host.querySelector(':scope > .freshness-ribbon');
    if(!ribbon){
      ribbon=document.createElement('span');
      ribbon.className='freshness-ribbon';
      ribbon.textContent='MỚI';
      ribbon.hidden=true;
      ribbon.setAttribute('aria-label','Mới');
      host.appendChild(ribbon);
    }
    const marker=controller?.marker(storyId);
    ribbon.hidden=!marker?.isNew;
  }

  function refreshRibbons(){
    if(!controller)return;
    document.querySelectorAll('.story-card').forEach(card=>{
      const id=storyIdFromElement(card);if(id)ensureRibbon(card,id);
    });
    document.querySelectorAll('.profile-story-tile > .freshness-ribbon').forEach(ribbon=>ribbon.remove());
    document.querySelectorAll('.profile-story-tile .profile-story-cover').forEach(cover=>{
      const id=storyIdFromElement(cover);if(id)ensureRibbon(cover,id);
    });
  }

  function chapterDescriptor(button){
    const raw=button.getAttribute('onclick')||'';
    const match=/\bread\(\s*([0-9]+)\s*,\s*([0-9]+)/.exec(raw);
    if(!match||typeof stories==='undefined')return null;
    const storyId=Number(match[1]),index=Number(match[2]);
    const story=stories.find(s=>String(s.id)===String(storyId));
    const chapter=story?.chapters?.[index],chapterId=Number(chapter?.id);
    return story&&Number.isSafeInteger(chapterId)&&chapterId>0?{storyId,chapterId}:null;
  }

  function refreshChapterBadges(){
    if(!controller)return;
    document.querySelectorAll('#introChapters button').forEach(button=>{
      const descriptor=chapterDescriptor(button);
      let title=button.querySelector(':scope > .chapter-freshness-title');
      if(!title){
        const text=[...button.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').trim();
        if(text){
          [...button.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).forEach(node=>node.remove());
          title=document.createElement('span');title.className='chapter-freshness-title';title.textContent=text;button.prepend(title);
        }
      }
      let badge=button.querySelector(':scope > .chapter-freshness-badge');
      const visible=!!descriptor&&!!controller.chapterMarker(descriptor.storyId,descriptor.chapterId)?.isNew;
      if(visible&&!badge){
        badge=document.createElement('span');badge.className='chapter-freshness-badge';badge.textContent='MỚI';badge.setAttribute('aria-label','Chương mới');button.appendChild(badge);
      }else if(!visible&&badge){badge.remove();}
    });
  }

  function refreshFreshnessUI(){
    refreshQueued=false;
    refreshRibbons();
    refreshChapterBadges();
  }

  function queueFreshnessRefresh(){
    if(refreshQueued)return;
    refreshQueued=true;
    queueMicrotask(refreshFreshnessUI);
  }

  function effectiveStoryUpdateTime(story){
    const storyTime=Date.parse(story?.updatedAt||'');
    const chapterTime=latestChapterUpdatedByStory.get(String(story?.id))||0;
    return Math.max(Number.isFinite(storyTime)?storyTime:0,chapterTime);
  }

  function applyStoryUpdateOrder(){
    if(typeof stories==='undefined'||!Array.isArray(stories)||!latestChapterUpdatedByStory.size)return;
    stories.sort((a,b)=>effectiveStoryUpdateTime(b)-effectiveStoryUpdateTime(a)||Number(b?.id||0)-Number(a?.id||0));
  }

  function patchStoryRender(){
    if(typeof root.render!=='function'||root.render.__ncaFreshnessSortPatched)return;
    const original=root.render;
    const wrapped=function(){
      applyStoryUpdateOrder();
      return original.apply(this,arguments);
    };
    wrapped.__ncaFreshnessSortPatched=true;
    root.render=wrapped;
  }

  async function refreshChapterUpdateTimes(){
    if(chapterUpdateFlight)return chapterUpdateFlight;
    if(typeof root.fetchAllRows!=='function')return;
    chapterUpdateFlight=(async()=>{
      try{
        const rows=await root.fetchAllRows('chapters','id','story_id,published,created_at,updated_at');
        const next=new Map();
        for(const row of rows){
          if(row?.published===false)continue;
          const updated=Date.parse(row?.updated_at||'');
          const created=Date.parse(row?.created_at||'');
          const time=Math.max(Number.isFinite(updated)?updated:0,Number.isFinite(created)?created:0);
          const key=String(row?.story_id??'');
          if(key&&time>(next.get(key)||0))next.set(key,time);
        }
        latestChapterUpdatedByStory=next;
        applyStoryUpdateOrder();
        if(typeof root.render==='function')root.render();
      }catch(error){console.warn('story update sort',error);}
    })().finally(()=>{chapterUpdateFlight=null;});
    return chapterUpdateFlight;
  }

  function configureNotificationRoleTab(){
    const filters=document.querySelector('.notif-filters');
    if(!filters||typeof root.setNotifFilter!=='function')return;
    const buttons=[...filters.querySelectorAll('button')];
    const findFilterButton=key=>buttons.find(btn=>(btn.getAttribute('onclick')||'').includes(`setNotifFilter('${key}')`));
    const mentionButton=findFilterButton('mention');
    const likeButton=findFilterButton('like');
    if(mentionButton)mentionButton.textContent='Nhắc';
    if(likeButton)likeButton.textContent='Tim';
    let roleButton=filters.querySelector('[data-nca-role-notification-tab]');
    if(!roleButton){
      roleButton=findFilterButton('comment');
      if(!roleButton)return;
      roleButton.dataset.ncaRoleNotificationTab='1';
    }
    const admin=typeof root.isSiteAdmin==='function'&&root.isSiteAdmin();
    const next=admin?'comment':'update';
    roleButton.textContent=admin?'Bình luận':'Cập nhật';
    roleButton.setAttribute('onclick',`setNotifFilter('${next}')`);
    if(typeof notifFilter!=='undefined'&&((admin&&notifFilter==='update')||(!admin&&notifFilter==='comment'))){
      notifFilter='all';
    }
    document.querySelectorAll('.notif-filters button').forEach(btn=>{
      btn.classList.toggle('active',(btn.getAttribute('onclick')||'').includes(`'${typeof notifFilter==='undefined'?'all':notifFilter}'`));
    });
  }

  function patchNotificationCopy(){
    if(typeof root.notifText!=='function'||root.notifText.__ncaFreshnessPatched)return;
    const original=root.notifText;
    const wrapped=function(n){
      if(n?.type==='update'){
        const story=typeof stories!=='undefined'?stories.find(s=>String(s.id)===String(n.story_id)):null;
        if(n.chapter_id!=null){
          const chapter=story?.chapters?.find(ch=>String(ch.id)===String(n.chapter_id));
          if(chapter&&story)return `đã đăng ${chapter.title} của ${story.title}.`;
          if(story)return `đã đăng chương mới của ${story.title}.`;
          return 'đã đăng một chương mới.';
        }
        return story?`đã đăng truyện mới ${story.title}.`:'đã đăng một truyện mới.';
      }
      return original(n);
    };
    wrapped.__ncaFreshnessPatched=true;
    root.notifText=wrapped;
  }

  function patchNotificationNavigation(){
    if(typeof root.openNotification!=='function'||root.openNotification.__ncaFreshnessPatched)return;
    const original=root.openNotification;
    const wrapped=async function(id){
      let selected=null;
      try{selected=typeof notificationRows==='undefined'?null:notificationRows.get(String(id))||null;}catch{}
      const result=await original.apply(this,arguments);
      if(selected?.type==='update'&&selected.chapter_id!=null){
        try{
          const story=typeof stories==='undefined'?null:stories.find(s=>String(s.id)===String(selected.story_id));
          const chapterIndex=story?.chapters?.findIndex(ch=>String(ch.id)===String(selected.chapter_id))??-1;
          if(story&&chapterIndex>=0)await root.read(story.id,chapterIndex);
        }catch(error){console.warn('update notification navigation',error);}
      }
      return result;
    };
    wrapped.__ncaFreshnessPatched=true;
    root.openNotification=wrapped;
  }

  function patchAuthUI(){
    if(typeof root.updateAuthUI!=='function'||root.updateAuthUI.__ncaFreshnessPatched)return;
    const original=root.updateAuthUI;
    const wrapped=function(){
      const result=original.apply(this,arguments);
      queueMicrotask(configureNotificationRoleTab);
      return result;
    };
    wrapped.__ncaFreshnessPatched=true;
    root.updateAuthUI=wrapped;
  }

  function currentChapterDescriptor(){
    try{
      if(typeof currentStory==='undefined'||typeof currentChapter==='undefined'||!currentStory)return null;
      const storyId=Number(currentStory.id),chapter=currentStory.chapters?.[Number(currentChapter)],chapterId=Number(chapter?.id);
      return Number.isSafeInteger(storyId)&&storyId>0&&Number.isSafeInteger(chapterId)&&chapterId>0?{storyId,chapterId}:null;
    }catch{return null;}
  }

  function armChapterCompletion(storyId,chapterId){
    if(!controller?.authenticated||!controller.chapterMarker(storyId,chapterId)?.isNew){activeCompletion=null;return;}
    activeCompletion={storyId:Number(storyId),chapterId:Number(chapterId),gesture:false,pending:false};
  }

  function activeCompletionCurrent(){
    const current=currentChapterDescriptor();
    return !!activeCompletion&&!!current&&activeCompletion.storyId===current.storyId&&activeCompletion.chapterId===current.chapterId;
  }

  async function finishActiveChapter(){
    if(!activeCompletionCurrent()||activeCompletion.pending)return false;
    const job=activeCompletion;job.pending=true;
    try{
      const ok=await controller.markChapterRead(job.storyId,job.chapterId);
      if(activeCompletion===job){if(ok)activeCompletion=null;else job.pending=false;}
      return ok;
    }catch(error){
      if(activeCompletion===job)job.pending=false;
      console.warn('chapter freshness read',error);return false;
    }
  }

  function checkChapterCompletion(){
    if(!activeCompletionCurrent()||!activeCompletion.gesture||activeCompletion.pending)return;
    const chapter=document.getElementById('chapter');
    if(!chapter||document.getElementById('reader')?.classList.contains('hidden'))return;
    const rect=chapter.getBoundingClientRect(),viewport=window.innerHeight||document.documentElement.clientHeight||0;
    if(rect.height>0&&rect.bottom<=viewport+28&&rect.top<viewport*.75)void finishActiveChapter();
  }

  function noteReaderGesture(){if(activeCompletionCurrent())activeCompletion.gesture=true;}

  function patchOpenStory(){
    if(typeof root.openStory!=='function'||root.openStory.__ncaFreshnessPatched)return;
    const original=root.openStory;
    const wrapped=function(id,updateRoute=true){
      const result=original.apply(this,arguments);
      if(updateRoute!==false){
        Promise.resolve(result).then(()=>controller?.ackStoryOpen(Number(id))).catch(()=>{});
      }
      return result;
    };
    wrapped.__ncaFreshnessPatched=true;
    root.openStory=wrapped;
  }

  function patchReaderAction(name){
    const original=root[name];
    if(typeof original!=='function'||original.__ncaFreshnessPatched)return;
    const wrapped=function(){
      const args=arguments;
      if(name==='moveChapter'&&Number(args[0])>0&&activeCompletionCurrent())void finishActiveChapter();
      const result=original.apply(this,args);
      const routeFlag=name==='read'?args[2]:true;
      if(routeFlag!==false){
        Promise.resolve(result).then(()=>{
          const current=currentChapterDescriptor();
          if(!current)return;
          controller?.ackChapterOpen(current.storyId,current.chapterId).catch(()=>{});
          armChapterCompletion(current.storyId,current.chapterId);
        }).catch(()=>{});
      }
      return result;
    };
    wrapped.__ncaFreshnessPatched=true;
    root[name]=wrapped;
  }

  function installInteractionHooks(){
    patchOpenStory();
    patchReaderAction('read');
    patchReaderAction('moveChapter');
    patchReaderAction('goChapter');
    patchNotificationNavigation();
    window.addEventListener('touchstart',noteReaderGesture,{passive:true});
    window.addEventListener('pointerdown',noteReaderGesture,{passive:true});
    window.addEventListener('wheel',noteReaderGesture,{passive:true});
    window.addEventListener('keydown',event=>{if(['ArrowDown','PageDown',' ','End'].includes(event.key))noteReaderGesture();});
    window.addEventListener('scroll',()=>{if(activeCompletionCurrent()&&activeCompletion.gesture)requestAnimationFrame(checkChapterCompletion);},{passive:true});
  }

  function scheduleExpiryReload(){
    if(expiryTimer!==null){clearTimeout(expiryTimer);expiryTimer=null;}
    const delay=controller?.msUntilNextExpiry?.();
    if(Number.isFinite(delay)&&delay>=0){
      expiryTimer=setTimeout(()=>{expiryTimer=null;void reload();},Math.max(1000,delay+1000));
    }
  }

  async function reload(){
    if(!controller)return;
    controller.reset();
    activeCompletion=null;
    try{await controller.load();}catch(error){console.warn('freshness load',error);}
    configureNotificationRoleTab();
    queueFreshnessRefresh();
    scheduleExpiryReload();
  }

  function boot(){
    if(!root.NCAFreshness||typeof sb==='undefined')return;
    installStyles();
    controller=root.NCAFreshness.create({
      sb,
      getAccount:()=>typeof authUser==='undefined'||!authUser?null:authUser.id,
      onChange:queueFreshnessRefresh
    });
    root.ncaFreshness=controller;
    patchStoryRender();
    patchNotificationCopy();
    patchAuthUI();
    installInteractionHooks();
    configureNotificationRoleTab();

    const observer=new MutationObserver(queueFreshnessRefresh);
    observer.observe(document.body,{childList:true,subtree:true});

    if(sb?.auth?.onAuthStateChange){
      sb.auth.onAuthStateChange(()=>setTimeout(reload,0));
    }
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden)return;
      void reload();
      void refreshChapterUpdateTimes();
    });
    void refreshChapterUpdateTimes();
    void reload();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else queueMicrotask(boot);
})(typeof window==='object'?window:globalThis);
