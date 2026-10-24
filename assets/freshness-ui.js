/* UI adapter for publication freshness. Loaded separately from Push logic. */
(function(root){
  'use strict';

  const STYLE_ID='nca-freshness-style';
  let controller=null;
  let refreshQueued=false;
  let expiryTimer=null;

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      :root{--fresh-ribbon-bg:#d789a4;--fresh-ribbon-fold:#a95770;--fresh-ribbon-fg:#fffafd}
      body.light{--fresh-ribbon-bg:#d789a4;--fresh-ribbon-fold:#a95770;--fresh-ribbon-fg:#fffafd}
      body.smoky{--fresh-ribbon-bg:#ad8451;--fresh-ribbon-fold:#795a34;--fresh-ribbon-fg:#fffaf0}
      body.dustyrose{--fresh-ribbon-bg:#b86f84;--fresh-ribbon-fold:#844a5c;--fresh-ribbon-fg:#fff8fa}
      body.mistblue{--fresh-ribbon-bg:#668f9a;--fresh-ribbon-fold:#466a73;--fresh-ribbon-fg:#f7fcfd}
      body.pastel{--fresh-ribbon-bg:#a98bc6;--fresh-ribbon-fold:#795f96;--fresh-ribbon-fg:#fffaff}
      body.night{--fresh-ribbon-bg:#718aa3;--fresh-ribbon-fold:#4b6176;--fresh-ribbon-fg:#f7fbff}
      body.purplenight{--fresh-ribbon-bg:#9878b8;--fresh-ribbon-fold:#684d83;--fresh-ribbon-fg:#fffaff}
      .story-card,.profile-story-tile{position:relative}
      .freshness-ribbon{position:absolute;z-index:3;right:-22px;bottom:13px;width:92px;height:25px;padding:0 10px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;letter-spacing:.08em;line-height:1;color:var(--fresh-ribbon-fg);background:var(--fresh-ribbon-bg);border:0;border-radius:0;box-shadow:0 3px 8px color-mix(in srgb,var(--fg) 16%,transparent);transform:rotate(-45deg);transform-origin:center;pointer-events:none;user-select:none}
      .freshness-ribbon[hidden]{display:none!important}
      .freshness-ribbon::before,.freshness-ribbon::after{content:"";position:absolute;bottom:-6px;width:0;height:0;border-top:6px solid var(--fresh-ribbon-fold)}
      .freshness-ribbon::before{left:0;border-right:7px solid transparent}
      .freshness-ribbon::after{right:0;border-left:7px solid transparent}
      @media(max-width:700px){.freshness-ribbon{right:-23px;bottom:12px;width:90px;height:24px;font-size:10.5px}}
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
    refreshQueued=false;
    if(!controller)return;
    document.querySelectorAll('.story-card').forEach(card=>{
      const id=storyIdFromElement(card);if(id)ensureRibbon(card,id);
    });
    document.querySelectorAll('.profile-story-cover > .freshness-ribbon').forEach(ribbon=>ribbon.remove());
    document.querySelectorAll('.profile-story-tile').forEach(tile=>{
      const id=storyIdFromElement(tile);if(id)ensureRibbon(tile,id);
    });
  }

  function queueRibbonRefresh(){
    if(refreshQueued)return;
    refreshQueued=true;
    queueMicrotask(refreshRibbons);
  }

  function configureNotificationRoleTab(){
    const filters=document.querySelector('.notif-filters');
    if(!filters||typeof root.setNotifFilter!=='function')return;
    let roleButton=filters.querySelector('[data-nca-role-notification-tab]');
    if(!roleButton){
      roleButton=[...filters.querySelectorAll('button')].find(btn=>(btn.getAttribute('onclick')||'').includes("setNotifFilter('comment')"));
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

  function currentChapterId(){
    try{
      if(typeof currentStory==='undefined'||typeof currentChapter==='undefined'||!currentStory)return null;
      const chapter=currentStory.chapters?.[Number(currentChapter)];
      const id=Number(chapter?.id);
      return Number.isSafeInteger(id)&&id>0?id:null;
    }catch{return null;}
  }

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
      const result=original.apply(this,args);
      const routeFlag=name==='read'?args[2]:true;
      if(routeFlag!==false){
        Promise.resolve(result).then(()=>{
          const storyId=Number(typeof currentStory!=='undefined'?currentStory?.id:null);
          const chapterId=currentChapterId();
          if(Number.isSafeInteger(storyId)&&storyId>0&&chapterId)controller?.ackChapterOpen(storyId,chapterId).catch(()=>{});
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
    try{await controller.load();}catch(error){console.warn('freshness load',error);}
    configureNotificationRoleTab();
    queueRibbonRefresh();
    scheduleExpiryReload();
  }

  function boot(){
    if(!root.NCAFreshness||typeof sb==='undefined')return;
    installStyles();
    controller=root.NCAFreshness.create({
      sb,
      getAccount:()=>typeof authUser==='undefined'||!authUser?null:authUser.id,
      onChange:queueRibbonRefresh
    });
    root.ncaFreshness=controller;
    patchNotificationCopy();
    patchAuthUI();
    installInteractionHooks();
    configureNotificationRoleTab();

    const observer=new MutationObserver(queueRibbonRefresh);
    observer.observe(document.body,{childList:true,subtree:true});

    if(sb?.auth?.onAuthStateChange){
      sb.auth.onAuthStateChange(()=>setTimeout(reload,0));
    }
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void reload();});
    void reload();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else queueMicrotask(boot);
})(typeof window==='object'?window:globalThis);
