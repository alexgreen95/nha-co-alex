/* Neon-only notification filter state: selected tab glows like the Home tab label, with no capsule or underline. */
(function(){
  'use strict';
  if(typeof document!=='object')return;
  if(document.getElementById('nca-neon-notification-tab-v28'))return;
  const style=document.createElement('style');
  style.id='nca-neon-notification-tab-v28';
  style.textContent=`
    html body.purplenight .notif-panel .notif-filters button.active{
      --neon-tone:var(--neon-pink)!important;
      color:#fff8ff!important;
      background:transparent!important;
      background-image:none!important;
      border-color:transparent!important;
      outline:0!important;
      box-shadow:none!important;
      filter:none!important;
      font-weight:800!important;
      text-shadow:
        0 0 2px rgba(255,255,255,1),
        0 0 6px rgba(255,78,213,1),
        0 0 12px rgba(255,78,213,.94),
        0 0 20px rgba(255,78,213,.62),
        0 0 30px rgba(154,115,255,.34)!important;
    }
  `;
  document.head.appendChild(style);
})();
