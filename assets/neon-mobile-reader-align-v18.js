/* Neon mobile-only reader alignment hotfix. */
(function(){
  'use strict';
  if(typeof document!=='object')return;

  const STYLE_ID='nca-neon-mobile-reader-align-v18';
  let style=document.getElementById(STYLE_ID);
  if(!style){
    style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      @media(max-width:700px){
        /* Neon only: home + heart are two equal fixed boxes on mobile. */
        html body.purplenight .chapter-center-actions{
          display:grid!important;
          grid-template-columns:40px 40px!important;
          align-items:center!important;
          justify-content:center!important;
          gap:8px!important;
          width:88px!important;
          min-width:88px!important;
          height:40px!important;
          margin:0!important;
          padding:0!important;
        }
        html body.purplenight .chapter-center-actions .chapter-home-btn,
        html body.purplenight .chapter-center-actions #chapterHeartRow,
        html body.purplenight .chapter-center-actions #chapterHeartRow .chapter-heart-btn{
          box-sizing:border-box!important;
          width:40px!important;
          min-width:40px!important;
          max-width:40px!important;
          height:40px!important;
          min-height:40px!important;
          max-height:40px!important;
          margin:0!important;
          padding:0!important;
          align-self:center!important;
          justify-self:center!important;
        }
        html body.purplenight .chapter-center-actions #chapterHeartRow{
          display:grid!important;
          place-items:center!important;
          position:relative!important;
          flex:0 0 40px!important;
          line-height:0!important;
        }
        html body.purplenight .chapter-center-actions #chapterHeartRow .chapter-heart-btn{
          position:relative!important;
          display:grid!important;
          place-items:center!important;
          overflow:visible!important;
          transform:none!important;
          border-radius:14px!important;
          background:rgba(5,6,13,.10)!important;
        }
        /* Reassert the heart's own neon tube; the legacy hit-area pseudo used the same ::before. */
        html body.purplenight .chapter-center-actions #chapterHeartRow .chapter-heart-btn::before{
          content:""!important;
          position:absolute!important;
          inset:0!important;
          left:0!important;
          top:0!important;
          width:auto!important;
          height:auto!important;
          transform:none!important;
          z-index:0!important;
          pointer-events:none!important;
          border:2px solid color-mix(in srgb,#fff 24%,var(--neon-tone,var(--neon-cyan)) 76%)!important;
          border-radius:inherit!important;
          background:transparent!important;
          box-shadow:
            0 0 2px rgba(255,255,255,.62),
            0 0 5px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 92%,transparent),
            0 0 11px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 48%,transparent),
            0 0 22px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 20%,transparent),
            inset 0 0 4px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 92%,transparent),
            inset 0 0 11px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 46%,transparent),
            inset 0 0 19px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 22%,transparent)!important;
        }
        html body.purplenight .chapter-center-actions #chapterHeartRow .chapter-heart-btn .ico{
          position:relative!important;
          z-index:1!important;
          display:block!important;
          width:20px!important;
          height:20px!important;
          margin:0!important;
          padding:0!important;
          transform:none!important;
          transform-origin:center!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const pinLast=()=>{
    const current=document.getElementById(STYLE_ID);
    if(current&&document.head.lastElementChild!==current)document.head.appendChild(current);
  };
  pinLast();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',pinLast,{once:true});
  else requestAnimationFrame(pinLast);
  setTimeout(pinLast,0);
})();
