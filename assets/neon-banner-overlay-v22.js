/* Neon banner only: slightly lighten the dark overlay so the original banner reads a touch clearer. */
(function(){
  'use strict';
  if(typeof document!=='object')return;

  const STYLE_ID='nca-neon-banner-overlay-v22';
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    body.purplenight .art-hero::after{
      background:rgba(2,3,9,.66)!important;
    }
  `;
  document.head.appendChild(style);
})();
