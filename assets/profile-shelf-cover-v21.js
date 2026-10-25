/* Profile shelf cover geometry: unify Saved/Reading cover ratio without changing shelf content. */
(function(){
  'use strict';
  if(typeof document!=='object')return;

  const STYLE_ID='nca-profile-shelf-cover-v21';
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    /* Covers in every profile shelf use one geometry. Freshness stays an overlay only. */
    .profile-story-grid{
      align-items:start!important;
    }
    .profile-story-tile{
      min-width:0!important;
      align-self:start!important;
    }
    .profile-story-cover{
      position:relative!important;
      box-sizing:border-box!important;
      height:auto!important;
      min-height:0!important;
      aspect-ratio:2/3!important;
    }
    .profile-story-cover>.freshness-ribbon{
      position:absolute!important;
    }

    @media(min-width:721px){
      .profile-story-cover,
      .profile-story-cover.profile-resume-cover{
        width:100%!important;
        max-width:100%!important;
        aspect-ratio:2/3!important;
        height:auto!important;
        min-height:0!important;
        padding:0!important;
        margin:0!important;
      }
      .profile-story-cover>img{
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
      .profile-story-cover,
      .profile-story-cover.profile-resume-cover{
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
