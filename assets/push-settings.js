/* Compatibility loader: preserve the frozen approved Neon implementation, then add scoped tail overrides. */
(function(root){
  'use strict';
  if(typeof module==='object'&&module.exports){module.exports=require('./push-settings-frozen-v14.js');return;}
  if(typeof document!=='object')return;

  const FROZEN='/assets/push-settings-frozen-v14.js?v=20261025-1';
  const TAIL='/assets/neon-reader-freshness-v15.js?v=20261025-2';

  if(document.readyState==='loading'){
    document.write('<script src="'+FROZEN+'"><\/script><script src="'+TAIL+'"><\/script>');
    return;
  }

  const old=document.createElement('script');
  old.src=FROZEN;
  old.async=false;
  old.onload=()=>{
    const tail=document.createElement('script');
    tail.src=TAIL;
    tail.async=false;
    document.head.appendChild(tail);
  };
  document.head.appendChild(old);
})(typeof window==='object'?window:globalThis);
