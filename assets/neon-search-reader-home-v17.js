/* Narrow tail overrides: Neon search inner glow + reader heart alignment; rounded home icon for all themes. */
(function(){
  'use strict';
  if(typeof document!=='object')return;

  const STYLE_ID='nca-neon-search-reader-home-v17';
  let style=document.getElementById(STYLE_ID);
  if(!style){
    style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      /* Neon only: make the search tube cast the same soft light inward as the other neon controls. */
      html body.purplenight .art-hero .hero-panel .search{
        box-shadow:
          inset 0 0 3px rgba(255,245,253,.40),
          inset 0 0 6px rgba(255,78,213,.82),
          inset 0 0 13px rgba(255,78,213,.42),
          inset 0 0 21px rgba(194,58,238,.20),
          0 0 6px rgba(255,78,213,.76),
          0 0 14px rgba(255,78,213,.44),
          0 0 26px rgba(194,58,238,.24)!important;
      }
      html body.purplenight .art-hero .hero-panel .search:focus-within{
        box-shadow:
          inset 0 0 3px rgba(255,248,254,.48),
          inset 0 0 7px rgba(255,92,218,.88),
          inset 0 0 15px rgba(255,78,213,.48),
          inset 0 0 24px rgba(194,58,238,.24),
          0 0 7px rgba(255,92,218,.84),
          0 0 17px rgba(255,78,213,.52),
          0 0 30px rgba(194,58,238,.28)!important;
      }

      /* Neon only: remove the legacy row margin that offsets the heart from its own tube frame. */
      html body.purplenight .chapter-center-actions #chapterHeartRow{
        margin:0!important;
        padding:0!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        align-self:center!important;
      }
      html body.purplenight .chapter-center-actions #chapterHeartRow .chapter-heart-btn{
        margin:0!important;
        align-self:center!important;
      }
    `;
    document.head.appendChild(style);
  }

  /* All themes: keep the same home action, but use a softer rounded house outline. */
  const roundHomeIcon=()=>{
    const path=document.querySelector('.chapter-home-btn svg path');
    if(!path)return;
    path.setAttribute('d','M4.1 10.7 10.9 4.9a1.7 1.7 0 0 1 2.2 0l6.8 5.8a1.8 1.8 0 0 1 .6 1.35v6.8A2.15 2.15 0 0 1 18.35 21H5.65a2.15 2.15 0 0 1-2.15-2.15v-6.8a1.8 1.8 0 0 1 .6-1.35Z M9.7 21v-5.6h4.6V21');
    path.setAttribute('fill','none');
    path.setAttribute('stroke','currentColor');
    path.setAttribute('stroke-width','1.9');
    path.setAttribute('stroke-linecap','round');
    path.setAttribute('stroke-linejoin','round');
  };

  const pinLast=()=>{
    const current=document.getElementById(STYLE_ID);
    if(current&&document.head.lastElementChild!==current)document.head.appendChild(current);
    roundHomeIcon();
  };
  pinLast();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',pinLast,{once:true});
  else requestAnimationFrame(pinLast);
  setTimeout(pinLast,0);
})();
