/* Preserve the reader's exact position across an in-place reload without changing normal chapter navigation. */
(function(root){
  'use strict';
  if(typeof root!=='object'||typeof document!=='object')return;

  const STORAGE_KEY='nca_reader_reload_position_v1';
  const MAX_AGE=6*60*60*1000;
  const readerPath=path=>/^\/truyen\/[^/]+\/chuong-\d+$/.test(String(path||'').replace(/\/$/,''));
  const cleanPath=path=>String(path||'').replace(/\/$/,'');
  const navEntry=typeof performance?.getEntriesByType==='function'?performance.getEntriesByType('navigation')[0]:null;
  const isReload=navEntry?.type==='reload'||performance?.navigation?.type===1;
  let reloadEntry=null;

  try{
    const parsed=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');
    if(isReload&&parsed&&cleanPath(parsed.path)===cleanPath(location.pathname)&&readerPath(parsed.path)&&Number.isFinite(Number(parsed.scroll))&&Number(parsed.scroll)>=0&&Date.now()-Number(parsed.at||0)<=MAX_AGE){
      reloadEntry={path:cleanPath(parsed.path),scroll:Math.max(0,Number(parsed.scroll)||0),at:Number(parsed.at)||0};
    }
  }catch(_){reloadEntry=null;}

  let frame=0;
  function snapshot(){
    frame=0;
    try{
      const path=cleanPath(location.pathname);
      if(!readerPath(path))return;
      sessionStorage.setItem(STORAGE_KEY,JSON.stringify({path,scroll:Math.max(0,Math.round(root.scrollY||0)),at:Date.now()}));
    }catch(_){/* sessionStorage can be unavailable in private/restricted contexts */}
  }
  function queueSnapshot(){
    if(frame)return;
    frame=root.requestAnimationFrame?root.requestAnimationFrame(snapshot):setTimeout(snapshot,0);
  }
  root.addEventListener('scroll',queueSnapshot,{passive:true});
  root.addEventListener('pagehide',snapshot);
  root.addEventListener('beforeunload',snapshot);

  let attempts=0;
  function install(){
    try{
      if(typeof read!=='function'||typeof progress!=='object'||progress===null)throw new Error('reader not ready');
      const baseRead=read;
      let reloadRouteConsumed=false;
      read=async function(id,chapterOverride=null,updateRoute=true){
        const isInitialReloadRoute=!reloadRouteConsumed&&!!reloadEntry&&chapterOverride!==null&&updateRoute===false&&cleanPath(location.pathname)===reloadEntry.path;
        if(isInitialReloadRoute){
          reloadRouteConsumed=true;
          const sid=Number(id),chapter=Math.max(0,Number(chapterOverride)||0);
          if(Number.isFinite(sid)){
            const previous=progress[sid]||{};
            progress[sid]={...previous,chapter,scroll:reloadEntry.scroll,updatedAt:previous.updatedAt||null};
            return baseRead(sid,null,false);
          }
        }
        return baseRead(id,chapterOverride,updateRoute);
      };
      root.read=read;
    }catch(_){
      if(++attempts<60)setTimeout(install,0);
    }
  }
  setTimeout(install,0);
})(typeof window==='object'?window:globalThis);
