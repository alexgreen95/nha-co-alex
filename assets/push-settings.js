/* Compatibility loader: preserve the frozen approved Neon implementation, then add scoped tail overrides. */
(function(root){
  'use strict';
  if(typeof module==='object'&&module.exports){module.exports=require('./push-settings-frozen-v14.js');return;}
  if(typeof document!=='object')return;

  /* Vercel Web Analytics for this vanilla HTML/JS site. */
  root.va=root.va||function(){(root.vaq=root.vaq||[]).push(arguments);};
  const ensureVercelAnalytics=()=>{
    if(document.querySelector('script[data-nca-vercel-analytics]'))return;
    const analytics=document.createElement('script');
    analytics.defer=true;
    analytics.src='/_vercel/insights/script.js';
    analytics.dataset.ncaVercelAnalytics='true';
    document.head.appendChild(analytics);
  };
  ensureVercelAnalytics();

  const FROZEN='/assets/push-settings-frozen-v14.js?v=20261025-1';
  const TAIL='/assets/neon-reader-freshness-v15.js?v=20261025-3';
  const TAIL2='/assets/neon-controls-profile-v16.js?v=20261025-1';
  const TAIL3='/assets/neon-search-reader-home-v17.js?v=20261025-1';
  const TAIL4='/assets/neon-mobile-reader-align-v18.js?v=20261025-1';
  const TAIL5='/assets/neon-search-size-v19.js?v=20261025-2';
  const TAIL6='/assets/profile-ribbon-align-v20.js?v=20261025-3';
  const TAIL7='/assets/profile-shelf-cover-v21.js?v=20261025-3';
  const TAIL8='/assets/neon-banner-overlay-v22.js?v=20261025-1';
  const TAIL9='/assets/neon-sort-choice-v23.js?v=20261025-1';
  const TAIL10='/assets/neon-notification-tab-v28.js?v=20261026-1';
  const PUSH_NAV='/assets/push-deeplink-v25.js?v=20261026-2';

  if(document.readyState==='loading'){
    /* Push receiver is first and independent: a theme-tail failure cannot suppress navigation handoff. */
    document.write('<script src="'+PUSH_NAV+'"><\/script><script src="'+FROZEN+'"><\/script><script src="'+TAIL+'"><\/script><script src="'+TAIL2+'"><\/script><script src="'+TAIL3+'"><\/script><script src="'+TAIL4+'"><\/script><script src="'+TAIL5+'"><\/script><script src="'+TAIL6+'"><\/script><script src="'+TAIL7+'"><\/script><script src="'+TAIL8+'"><\/script><script src="'+TAIL9+'"><\/script><script src="'+TAIL10+'"><\/script>');
    return;
  }

  /* Dynamic path: start push navigation independently before the frozen/theme chain. */
  const pushNav=document.createElement('script');
  pushNav.src=PUSH_NAV;
  pushNav.async=false;
  document.head.appendChild(pushNav);

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
        tail3.onload=()=>{
          const tail4=document.createElement('script');
          tail4.src=TAIL4;
          tail4.async=false;
          tail4.onload=()=>{
            const tail5=document.createElement('script');
            tail5.src=TAIL5;
            tail5.async=false;
            tail5.onload=()=>{
              const tail6=document.createElement('script');
              tail6.src=TAIL6;
              tail6.async=false;
              tail6.onload=()=>{
                const tail7=document.createElement('script');
                tail7.src=TAIL7;
                tail7.async=false;
                tail7.onload=()=>{
                  const tail8=document.createElement('script');
                  tail8.src=TAIL8;
                  tail8.async=false;
                  tail8.onload=()=>{
                    const tail9=document.createElement('script');
                    tail9.src=TAIL9;
                    tail9.async=false;
                    tail9.onload=()=>{
                      const tail10=document.createElement('script');
                      tail10.src=TAIL10;
                      tail10.async=false;
                      document.head.appendChild(tail10);
                    };
                    document.head.appendChild(tail9);
                  };
                  document.head.appendChild(tail8);
                };
                document.head.appendChild(tail7);
              };
              document.head.appendChild(tail6);
            };
            document.head.appendChild(tail5);
          };
          document.head.appendChild(tail4);
        };
        document.head.appendChild(tail3);
      };
      document.head.appendChild(tail2);
    };
    document.head.appendChild(tail);
  };
  document.head.appendChild(old);
})(typeof window==='object'?window:globalThis);
