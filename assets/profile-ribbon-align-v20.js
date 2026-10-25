/* Profile shelf ribbon alignment: preserve cover/card geometry; ribbon must not raise the item. */
(function(){
  'use strict';
  if(typeof document!=='object')return;

  const STYLE_ID='nca-profile-ribbon-align-v20';
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    /* Non-Neon themes keep the existing ribbon design, but anchor it to the cover top edge. */
    html body:not(.purplenight) .profile-story-cover>.freshness-ribbon{
      top:0!important;
    }
  `;
  document.head.appendChild(style);
})();
