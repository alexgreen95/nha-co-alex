/* Account menu/admin-library gate: rely on the authoritative profile role, never display-name matching. */
(function(root){
  'use strict';
  if(typeof root!=='object'||typeof document!=='object')return;

  function authoritativeSiteAdmin(){
    try{
      return !!authUser && !!memberProfile &&
        String(memberProfile.id||'')===String(authUser.id||'') &&
        String(memberProfile.role||'').toLowerCase()==='admin';
    }catch(_){return false;}
  }

  let attempts=0;
  function install(){
    try{
      if(typeof isSiteAdmin!=='function')throw new Error('admin gate not ready');
      isSiteAdmin=authoritativeSiteAdmin;
      root.isSiteAdmin=authoritativeSiteAdmin;
      const btn=document.getElementById('adminLibraryMenuBtn');
      if(btn)btn.style.display=authoritativeSiteAdmin()?'block':'none';
      return;
    }catch(_){
      if(++attempts<24)setTimeout(install,0);
    }
  }

  setTimeout(install,0);
})(typeof window==='object'?window:globalThis);
