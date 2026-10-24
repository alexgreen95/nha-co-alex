/* Compatibility bootstrap: keep Push core and freshness UI logically separate. */
(function(root){
  'use strict';
  if(typeof module==='object'&&module.exports){module.exports=require('./push-settings-core.js');return;}
  if(typeof document!=='object'||document.readyState!=='loading')throw Error('NCA_BOOTSTRAP_ORDER');
  document.write('<script src="/assets/push-settings-core.js"><\/script><script src="/assets/freshness.js"><\/script><script src="/assets/freshness-ui.js"><\/script>');
  document.addEventListener('DOMContentLoaded',()=>{
    if(document.getElementById('nca-freshness-ribbon-inset'))return;
    const style=document.createElement('style');
    style.id='nca-freshness-ribbon-inset';
    style.textContent=`
      .story-card>.freshness-corner-shell{right:-2px!important;bottom:-2px!important}
      @media(max-width:700px){.story-card>.freshness-corner-shell{right:-1px!important;bottom:-1px!important}}
    `;
    document.head.appendChild(style);
  },{once:true});
})(typeof window==='object'?window:globalThis);
