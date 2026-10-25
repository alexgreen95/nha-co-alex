/* Profile shelf freshness: preserve the exact cover geometry; ribbon is overlay-only. */
(function(){
  'use strict';
  if(typeof document!=='object')return;

  const STYLE_ID='nca-profile-ribbon-align-v20';
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    /* Keep the approved ribbon protrusion. It must never participate in cover sizing. */
    html body:not(.purplenight) .profile-story-cover>.freshness-ribbon{
      top:-4px!important;
    }

    /* Desktop shelf: a cover with a freshness marker must be identical in size to its siblings. */
    @media(min-width:721px){
      html body:not(.purplenight) .profile-story-cover:has(> .freshness-ribbon){
        width:100%!important;
        height:auto!important;
        min-height:0!important;
        aspect-ratio:3/4!important;
        box-sizing:border-box!important;
      }
      html body:not(.purplenight) .profile-story-cover:has(> .freshness-ribbon)>img{
        width:100%!important;
        height:100%!important;
        min-width:100%!important;
        min-height:100%!important;
        object-fit:cover!important;
        display:block!important;
      }
    }
  `;
  document.head.appendChild(style);
})();
