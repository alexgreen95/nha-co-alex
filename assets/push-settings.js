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

  const applyWordmark=()=>{
    const title=document.querySelector('.art-hero .hero-panel h1');
    if(!title)return;
    title.setAttribute('aria-label','Nhà có Alex');
    title.textContent='Nhà có Alex';
    delete title.dataset.neonBalanced;
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyWordmark,{once:true});
  else applyWordmark();

  let style=document.getElementById('nca-neon-preview-match-v10');
  if(!style){
    style=document.createElement('style');
    style.id='nca-neon-preview-match-v10';
    style.textContent=`
      @font-face{
        font-family:'NCA Keystone';
        src:url('https://www.fontmirror.com/app_public/files/t/22/2024/10/KEYSTONE.OTF') format('opentype');
        font-weight:400;
        font-style:normal;
        font-display:swap;
      }

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

      /* Keystone trial wordmark: one continuous title, no split capitals. */
      html body.purplenight .art-hero .hero-panel h1{
        display:block!important;
        width:auto!important;
        height:auto!important;
        margin:0 auto 12px!important;
        padding:0!important;
        overflow:visible!important;
        font-family:'NCA Keystone','Keystone','Arial Rounded MT Bold',sans-serif!important;
        font-size:clamp(58px,5.6vw,82px)!important;
        font-weight:400!important;
        line-height:1!important;
        letter-spacing:.055em!important;
        color:#fff7ff!important;
        -webkit-text-fill-color:#fff7ff!important;
        -webkit-text-stroke:.9px rgba(255,249,255,.98)!important;
        background:none!important;
        text-shadow:
          0 0 1px #fff,
          0 0 3px rgba(255,255,255,.98),
          0 0 7px rgba(255,229,252,.98),
          0 0 12px rgba(255,157,234,.96),
          0 0 20px rgba(255,79,215,.92),
          0 0 32px rgba(244,54,218,.78),
          0 0 48px rgba(203,52,242,.58)!important;
        filter:drop-shadow(0 0 6px rgba(255,91,220,.62)) drop-shadow(0 0 18px rgba(182,58,249,.24))!important;
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
          font-size:clamp(29px,8.5vw,42px)!important;
          line-height:1!important;
          letter-spacing:.035em!important;
          -webkit-text-stroke:.6px rgba(255,249,255,.98)!important;
          white-space:nowrap!important;
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
    const current=document.getElementById('nca-neon-preview-match-v10');
    if(current&&document.head.lastElementChild!==current)document.head.appendChild(current);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',pinLast,{once:true});
  else pinLast();
})(typeof window==='object'?window:globalThis);
