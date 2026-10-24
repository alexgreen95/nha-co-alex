/* Thin compatibility wrapper: load the frozen Neon base, then force the final approved hero overrides. */
(function(root){
  'use strict';
  if(typeof module==='object'&&module.exports){module.exports=require('./push-settings-base.js');return;}
  if(typeof document!=='object')return;

  const BASE_SRC='/assets/push-settings-base.js?v=neon-final-20261024-6';
  if(document.readyState==='loading'){
    document.write('<script src="'+BASE_SRC+'"><\/script>');
  }else{
    const base=document.createElement('script');
    base.src=BASE_SRC;
    base.async=false;
    document.head.appendChild(base);
  }

  let style=document.getElementById('nca-neon-preview-match-v12');
  if(!style){
    style=document.createElement('style');
    style.id='nca-neon-preview-match-v12';
    style.textContent=`
      /* Banner is intentionally frozen at the approved state. */
      html body.purplenight .art-hero{
        background:#05060d!important;
        overflow:hidden!important;
      }
      html body.purplenight .art-hero-image{
        display:block!important;
        background-image:url("/alex-banner.jpg")!important;
        background-size:cover!important;
        background-position:center 30%!important;
        background-repeat:no-repeat!important;
        opacity:1!important;
        filter:brightness(.34) saturate(.34) contrast(1.06)!important;
      }
      html body.purplenight .art-hero::after{
        content:""!important;
        position:absolute!important;
        inset:0!important;
        z-index:1!important;
        pointer-events:none!important;
        opacity:1!important;
        background:
          radial-gradient(ellipse 46% 36% at 50% 28%,rgba(255,158,236,.26) 0%,rgba(255,74,211,.24) 17%,rgba(211,55,230,.20) 31%,rgba(145,49,226,.14) 47%,rgba(90,30,145,.07) 62%,transparent 76%),
          linear-gradient(120deg,rgba(102,12,108,.08) 0%,rgba(171,17,139,.055) 42%,rgba(103,24,146,.08) 100%),
          linear-gradient(180deg,rgba(2,1,8,.54),rgba(2,1,8,.60))!important;
      }
      html body.purplenight .hero-fade-top{
        display:block!important;
        height:54px!important;
        z-index:2!important;
        background:linear-gradient(to bottom,#05060d 0%,rgba(5,6,13,.84) 18%,rgba(5,6,13,.58) 38%,rgba(5,6,13,.30) 60%,rgba(5,6,13,.10) 80%,rgba(5,6,13,0) 100%)!important;
      }
      html body.purplenight .hero-fade{
        display:block!important;
        height:118px!important;
        z-index:2!important;
        background:linear-gradient(to bottom,rgba(5,6,13,0) 0%,rgba(5,6,13,.10) 20%,rgba(5,6,13,.30) 44%,rgba(5,6,13,.58) 66%,rgba(5,6,13,.84) 84%,#05060d 100%)!important;
      }
      html body.purplenight .hero-panel{z-index:3!important}

      /* iCiel Smoothy Cursive converted to path-only SVG: no runtime font dependency. */
      html body.purplenight .art-hero .hero-panel h1{
        display:block!important;
        width:min(660px,78vw)!important;
        aspect-ratio:1652.8617/300!important;
        height:auto!important;
        margin:0 auto 10px!important;
        padding:0!important;
        overflow:visible!important;
        font-size:0!important;
        line-height:0!important;
        color:transparent!important;
        -webkit-text-fill-color:transparent!important;
        -webkit-text-stroke:0!important;
        text-shadow:none!important;
        background-image:url('/assets/neon-title-signature.svg?v=20261025-2')!important;
        background-size:contain!important;
        background-position:center!important;
        background-repeat:no-repeat!important;
        filter:
          drop-shadow(0 0 3px rgba(255,210,244,.92))
          drop-shadow(0 0 8px rgba(255,123,223,.88))
          drop-shadow(0 0 16px rgba(255,70,211,.72))
          drop-shadow(0 0 28px rgba(209,54,239,.48))
          drop-shadow(0 0 44px rgba(142,54,243,.28))!important;
        transform:none!important;
        white-space:nowrap!important;
      }

      html body.purplenight .art-hero .hero-panel .muted{
        color:#f0e8f3!important;
        text-shadow:
          0 0 3px rgba(255,238,252,.42),
          0 0 8px rgba(255,83,214,.30),
          0 0 14px rgba(168,59,242,.18)!important;
      }

      /* Search is one pink neon tube only: explicitly cancel the base cyan/white tube. */
      html body.purplenight .art-hero .hero-panel .search{
        background:rgba(4,7,14,.90)!important;
        border:1.8px solid #ff78dc!important;
        border-radius:18px!important;
        outline:0!important;
        box-shadow:
          inset 0 0 9px rgba(255,78,213,.06),
          0 0 6px rgba(255,78,213,.76),
          0 0 14px rgba(255,78,213,.44),
          0 0 26px rgba(194,58,238,.24)!important;
      }
      html body.purplenight .art-hero .hero-panel .search:focus-within{
        border-color:#ff8fe2!important;
        box-shadow:
          inset 0 0 10px rgba(255,78,213,.08),
          0 0 7px rgba(255,92,218,.84),
          0 0 17px rgba(255,78,213,.52),
          0 0 30px rgba(194,58,238,.28)!important;
      }
      html body.purplenight .art-hero .hero-panel .search input{
        background:transparent!important;
        color:#f8effb!important;
        caret-color:#ff78dc!important;
        border:0!important;
        outline:0!important;
        box-shadow:none!important;
        filter:none!important;
      }
      html body.purplenight .art-hero .hero-panel .search input:focus{
        border:0!important;
        outline:0!important;
        box-shadow:none!important;
        filter:none!important;
      }
      html body.purplenight .art-hero .hero-panel .search input::placeholder{color:#bca9c7!important}
      html body.purplenight .art-hero .hero-panel .search button{
        border:0!important;
        outline:0!important;
        box-shadow:none!important;
        filter:none!important;
        color:#fff6ff!important;
      }

      /* Keep the theme picker plain like Night. */
      html body.purplenight .theme-menu{
        background:#202020!important;
        color:#f1f1f1!important;
        border:1px solid #444!important;
        box-shadow:0 12px 32px rgba(0,0,0,.28)!important;
      }
      html body.purplenight .theme-menu .font-label{
        color:#b9b9b9!important;
        text-shadow:none!important;
      }
      html body.purplenight .theme-menu .theme-option{
        position:relative!important;
        isolation:auto!important;
        overflow:hidden!important;
        background:transparent!important;
        color:#f1f1f1!important;
        border:0!important;
        outline:0!important;
        border-radius:9px!important;
        box-shadow:none!important;
        text-shadow:none!important;
        filter:none!important;
      }
      html body.purplenight .theme-menu .theme-option::before,
      html body.purplenight .theme-menu .theme-option::after{
        content:none!important;
        display:none!important;
      }
      html body.purplenight .theme-menu .theme-option:hover,
      html body.purplenight .theme-menu .theme-option.active{
        background:#303030!important;
        color:#f1f1f1!important;
        box-shadow:none!important;
        text-shadow:none!important;
      }
      html body.purplenight .theme-menu .theme-option .theme-swatch{box-shadow:none!important}
      html body.purplenight .theme-menu .sw-purplenight{
        box-shadow:none!important;
        border-color:rgba(255,255,255,.16)!important;
      }

      @media(max-width:700px){
        html body.purplenight .art-hero .hero-panel h1{
          width:min(94vw,560px)!important;
          margin-bottom:6px!important;
        }
        html body.purplenight .hero-panel{
          width:calc(100% - 10px)!important;
          padding-left:5px!important;
          padding-right:5px!important;
        }
        html body.purplenight .hero-fade-top{height:46px!important}
        html body.purplenight .hero-fade{height:96px!important}
      }
    `;
    document.head.appendChild(style);
  }

  const pinLast=()=>{
    const current=document.getElementById('nca-neon-preview-match-v12');
    if(current&&document.head.lastElementChild!==current)document.head.appendChild(current);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',pinLast,{once:true});
  else pinLast();
})(typeof window==='object'?window:globalThis);
