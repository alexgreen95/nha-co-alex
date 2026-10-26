/* Neon-only notification filter state: make the selected tab unmistakable without changing layout. */
(function(){
  'use strict';
  if(typeof document!=='object')return;
  if(document.getElementById('nca-neon-notification-tab-v26'))return;
  const style=document.createElement('style');
  style.id='nca-neon-notification-tab-v26';
  style.textContent=`
    html body.purplenight .notif-filters button.active{
      --neon-tone:var(--neon-pink)!important;
      color:#fff7ff!important;
      background-image:linear-gradient(90deg,transparent 0%,var(--neon-pink) 18%,var(--neon-pink) 82%,transparent 100%)!important;
      background-repeat:no-repeat!important;
      background-position:center bottom!important;
      background-size:78% 2px!important;
      text-shadow:
        0 0 2px rgba(255,255,255,.98),
        0 0 6px rgba(255,78,213,.98),
        0 0 12px rgba(255,78,213,.82),
        0 0 21px rgba(154,115,255,.50)!important;
      filter:
        drop-shadow(0 0 3px rgba(255,78,213,.62))
        drop-shadow(0 0 8px rgba(255,78,213,.30))!important;
    }
  `;
  document.head.appendChild(style);
})();
