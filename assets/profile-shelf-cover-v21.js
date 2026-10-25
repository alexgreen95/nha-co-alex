/* Profile shelf cover geometry: match non-Neon covers to the approved Neon proportions. */
(function(){
  'use strict';
  if(typeof document!=='object')return;

  const STYLE_ID='nca-profile-shelf-cover-v21';
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    /* Neon is intentionally untouched. Other themes use the same tall 2:3 cover geometry. */
    html body:not(.purplenight) .profile-story-grid{
      align-items:start!important;
    }
    html body:not(.purplenight) .profile-story-tile{
      min-width:0!important;
      align-self:start!important;
    }
    html body:not(.purplenight) .profile-story-cover{
      position:relative!important;
      box-sizing:border-box!important;
      height:auto!important;
      min-height:0!important;
      aspect-ratio:2/3!important;
    }
    html body:not(.purplenight) .profile-story-cover>.freshness-ribbon{
      position:absolute!important;
      top:-4px!important;
    }

    @media(min-width:721px){
      html body:not(.purplenight) .profile-story-cover,
      html body:not(.purplenight) .profile-story-cover.profile-resume-cover{
        width:100%!important;
        max-width:100%!important;
        aspect-ratio:2/3!important;
        height:auto!important;
        min-height:0!important;
        padding:0!important;
        margin:0!important;
      }
      html body:not(.purplenight) .profile-story-cover>img{
        position:absolute!important;
        inset:0!important;
        width:100%!important;
        height:100%!important;
        max-width:none!important;
        max-height:none!important;
        margin:0!important;
        object-fit:cover!important;
      }
    }

    @media(max-width:720px){
      html body:not(.purplenight) .profile-story-cover,
      html body:not(.purplenight) .profile-story-cover.profile-resume-cover{
        width:min(124px,calc(100% - 12px))!important;
        max-width:100%!important;
        aspect-ratio:2/3!important;
        height:auto!important;
        min-height:0!important;
        padding:0!important;
        margin-inline:auto!important;
      }
    }
  `;
  document.head.appendChild(style);
})();
