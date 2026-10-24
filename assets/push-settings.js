/* Thin compatibility wrapper: load the frozen Neon base, then force the final approved hero overrides. */
(function(root){
  'use strict';
  if(typeof module==='object'&&module.exports){module.exports=require('./push-settings-base.js');return;}
  if(typeof document!=='object')return;

  const BASE_SRC='/assets/push-settings-base.js?v=neon-final-20261024-2';
  if(document.readyState==='loading'){
    document.write('<script src="'+BASE_SRC+'"><\/script>');
  }else{
    const base=document.createElement('script');
    base.src=BASE_SRC;
    base.async=false;
    document.head.appendChild(base);
  }

  if(!document.getElementById('nca-neon-preview-font')){
    const link=document.createElement('link');
    link.id='nca-neon-preview-font';
    link.rel='stylesheet';
    link.href='https://fonts.googleapis.com/css2?family=Neonderthaw&display=swap';
    document.head.appendChild(link);
  }

  let style=document.getElementById('nca-neon-preview-match-v6');
  if(!style){
    style=document.createElement('style');
    style.id='nca-neon-preview-match-v6';
    style.textContent=`
      /* Final Neon hero. Extra html/body specificity intentionally beats the frozen base regardless of load order. */
      html body.purplenight .art-hero-image{
        display:block!important;
        background-image:url("/alex-banner.jpg")!important;
        background-size:cover!important;
        background-position:center 30%!important;
        background-repeat:no-repeat!important;
        opacity:1!important;
        filter:brightness(.42) saturate(.18) contrast(1.03)!important;
      }
      html body.purplenight .art-hero::after{
        content:""!important;
        position:absolute!important;
        inset:0!important;
        z-index:1!important;
        pointer-events:none!important;
        opacity:1!important;
        background:
          radial-gradient(ellipse 44% 34% at 50% 28%,rgba(255,77,220,.24) 0%,rgba(225,54,224,.17) 22%,rgba(150,55,255,.10) 42%,rgba(82,25,117,.035) 60%,transparent 74%),
          linear-gradient(180deg,rgba(2,1,8,.56),rgba(2,1,8,.62))!important;
      }
      html body.purplenight .hero-fade-top,
      html body.purplenight .hero-fade{display:none!important}

      /* True monoline neon wordmark: one consistent tube thickness, no calligraphic thick/thin strokes. */
      html body.purplenight .art-hero .hero-panel h1{
        font-family:'Neonderthaw','Segoe Script',cursive!important;
        font-size:clamp(88px,8.4vw,120px)!important;
        font-weight:400!important;
        line-height:.92!important;
        letter-spacing:.018em!important;
        color:#fff7ff!important;
        -webkit-text-fill-color:#fff7ff!important;
        -webkit-text-stroke:.55px rgba(255,249,255,.96)!important;
        text-shadow:
          0 0 1px rgba(255,255,255,1),
          0 0 3px rgba(255,255,255,.98),
          0 0 7px rgba(255,210,249,.96),
          0 0 12px rgba(255,121,227,.92),
          0 0 22px rgba(255,56,207,.86),
          0 0 36px rgba(230,48,226,.68),
          0 0 54px rgba(164,55,255,.48)!important;
        filter:drop-shadow(0 0 7px rgba(255,72,215,.66)) drop-shadow(0 0 20px rgba(165,52,255,.30))!important;
        transform:none!important;
        white-space:nowrap!important;
      }
      html body.purplenight .art-hero .hero-panel .muted{
        color:#d7d3df!important;
        text-shadow:0 0 7px rgba(255,73,214,.20),0 0 13px rgba(159,54,255,.12)!important;
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
          font-size:clamp(36px,10.4vw,49px)!important;
          line-height:.94!important;
          letter-spacing:.006em!important;
          -webkit-text-stroke:.42px rgba(255,249,255,.96)!important;
          white-space:nowrap!important;
        }
        html body.purplenight .hero-panel{
          width:calc(100% - 10px)!important;
          padding-left:5px!important;
          padding-right:5px!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const pinLast=()=>{
    const current=document.getElementById('nca-neon-preview-match-v6');
    if(current&&document.head.lastElementChild!==current)document.head.appendChild(current);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',pinLast,{once:true});
  else pinLast();
})(typeof window==='object'?window:globalThis);
