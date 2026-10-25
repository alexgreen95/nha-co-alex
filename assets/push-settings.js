/* Compatibility loader: preserve the frozen approved Neon implementation, then add scoped tail overrides. */
(function(root){
  'use strict';
  if(typeof module==='object'&&module.exports){module.exports=require('./push-settings-frozen-v14.js');return;}
  if(typeof document!=='object')return;

  const FROZEN='/assets/push-settings-frozen-v14.js?v=20261025-1';
  const TAIL='/assets/neon-reader-freshness-v15.js?v=20261025-3';
  const TAIL2='/assets/neon-controls-profile-v16.js?v=20261025-1';
  const TAIL3='/assets/neon-search-reader-home-v17.js?v=20261025-1';

  if(document.readyState==='loading'){
    document.write('<script src="'+FROZEN+'"><\/script><script src="'+TAIL+'"><\/script><script src="'+TAIL2+'"><\/script><script src="'+TAIL3+'"><\/script>');
    return;
  }

  const old=document.createElement('script');
  old.src=FROZEN;
  old.async=false;
  old.onload=()=>{
    const tail=document.createElement('script');
    tail.src=TAIL;
    tail.async=false;
    tail.onload=()=>{
      const tail2=document.createElement('script');
      tail2.src=TAIL2;
      tail2.async=false;
      tail2.onload=()=>{
        const tail3=document.createElement('script');
        tail3.src=TAIL3;
        tail3.async=false;
        document.head.appendChild(tail3);
      };
      document.head.appendChild(tail2);
    };
    document.head.appendChild(tail);
  };
  document.head.appendChild(old);
})(typeof window==='object'?window:globalThis);
