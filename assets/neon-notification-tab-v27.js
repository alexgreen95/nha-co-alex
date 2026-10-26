/* Neon-only notification filter state: selected tab gets an unmistakable pink neon capsule. */
(function(){
  'use strict';
  if(typeof document!=='object')return;
  if(document.getElementById('nca-neon-notification-tab-v27'))return;
  const style=document.createElement('style');
  style.id='nca-neon-notification-tab-v27';
  style.textContent=`
    html body.purplenight .notif-panel .notif-filters button.active{
      --neon-tone:var(--neon-pink)!important;
      color:#fff8ff!important;
      background:rgba(255,78,213,.12)!important;
      background-image:none!important;
      border-color:rgba(255,137,226,.92)!important;
      outline:1px solid rgba(255,121,220,.88)!important;
      outline-offset:-1px!important;
      box-shadow:
        0 0 3px rgba(255,255,255,.46),
        0 0 7px rgba(255,78,213,.92),
        0 0 15px rgba(255,78,213,.60),
        0 0 26px rgba(154,115,255,.34),
        inset 0 0 8px rgba(255,78,213,.24)!important;
      text-shadow:
        0 0 2px rgba(255,255,255,1),
        0 0 7px rgba(255,78,213,1),
        0 0 14px rgba(255,78,213,.88)!important;
      filter:none!important;
    }
  `;
  document.head.appendChild(style);
})();
