/* Neon-only search sizing: match the dimensions used by the other themes. */
(function(){
  'use strict';
  if(typeof document!=='object')return;

  const STYLE_ID='nca-neon-search-size-v19';
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    html body.purplenight .art-hero .hero-panel .search{
      width:min(520px,100%)!important;
      max-width:520px!important;
      margin:24px auto!important;
      padding:6px!important;
      min-height:0!important;
      height:auto!important;
      box-sizing:border-box!important;
    }
    html body.purplenight .art-hero .hero-panel .search input{
      padding:11px!important;
      min-height:0!important;
      height:auto!important;
      box-sizing:border-box!important;
    }
    @media(max-width:640px){
      html body.purplenight .art-hero .hero-panel .search{
        width:calc(100vw - 60px)!important;
        max-width:calc(100vw - 60px)!important;
      }
    }
  `;
  document.head.appendChild(style);
})();
