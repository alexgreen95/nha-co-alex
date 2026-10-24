/* Thin compatibility wrapper: load the frozen Neon base, then apply the final preview-match overrides. */
(function(root){
  'use strict';
  if(typeof module==='object'&&module.exports){module.exports=require('./push-settings-base.js');return;}
  if(typeof document!=='object'||document.readyState!=='loading')throw Error('NCA_BOOTSTRAP_ORDER');
  document.write('<script src="/assets/push-settings-base.js"><\/script>');

  document.addEventListener('DOMContentLoaded',()=>{
    if(!document.getElementById('nca-neon-preview-font')){
      const link=document.createElement('link');
      link.id='nca-neon-preview-font';
      link.rel='stylesheet';
      link.href='https://fonts.googleapis.com/css2?family=Alex+Brush&family=Great+Vibes&family=Dancing+Script:wght@700&display=swap';
      document.head.appendChild(link);
    }

    if(document.getElementById('nca-neon-preview-match-v4'))return;
    const style=document.createElement('style');
    style.id='nca-neon-preview-match-v4';
    style.textContent=`
      /* Match the approved preview: original banner as very dark, nearly desaturated wallpaper. */
      body.purplenight .art-hero-image{
        display:block!important;
        background-image:url("/alex-banner.jpg")!important;
        background-size:cover!important;
        background-position:center 30%!important;
        background-repeat:no-repeat!important;
        opacity:1!important;
        filter:brightness(.17) saturate(.10) contrast(1.08)!important;
      }
      body.purplenight .art-hero::after{
        content:""!important;
        position:absolute!important;
        inset:0!important;
        z-index:1!important;
        pointer-events:none!important;
        opacity:1!important;
        background:
          radial-gradient(ellipse 42% 36% at 50% 30%,rgba(255,52,205,.24) 0%,rgba(204,45,231,.18) 20%,rgba(143,48,255,.12) 40%,rgba(72,18,105,.04) 58%,transparent 72%),
          linear-gradient(180deg,rgba(1,0,7,.74),rgba(1,0,7,.79))!important;
      }
      body.purplenight .hero-fade-top,
      body.purplenight .hero-fade{display:none!important}

      /* Approved-preview wordmark: flowing neon tubing with a bright white core and pink-purple halo. */
      body.purplenight .art-hero .hero-panel h1{
        font-family:'Alex Brush','Great Vibes','Dancing Script','Segoe Script','Brush Script MT',cursive!important;
        font-size:clamp(92px,8.7vw,126px)!important;
        font-weight:400!important;
        line-height:.90!important;
        letter-spacing:.008em!important;
        color:#fff7ff!important;
        -webkit-text-fill-color:#fff7ff!important;
        -webkit-text-stroke:1.05px rgba(255,247,255,.98)!important;
        text-shadow:
          0 0 1px #fff,
          0 0 3px #fff,
          0 0 6px rgba(255,213,250,.98),
          0 0 10px rgba(255,126,225,.98),
          0 0 18px rgba(255,52,204,.96),
          0 0 30px rgba(236,46,225,.82),
          0 0 46px rgba(185,55,255,.68),
          0 0 68px rgba(133,42,236,.46)!important;
        filter:
          drop-shadow(0 0 5px rgba(255,80,211,.80))
          drop-shadow(0 0 18px rgba(191,52,255,.44))!important;
        transform:none!important;
        white-space:nowrap!important;
      }
      body.purplenight .art-hero .hero-panel .muted{
        color:#d7d3df!important;
        text-shadow:0 0 6px rgba(255,67,210,.24),0 0 11px rgba(173,51,255,.14)!important;
      }

      /* Theme picker stays plain, exactly like a normal Night-theme menu. */
      body.purplenight .theme-menu{
        background:#202020!important;
        color:#f1f1f1!important;
        border:1px solid #444!important;
        box-shadow:0 12px 32px rgba(0,0,0,.28)!important;
      }
      body.purplenight .theme-menu .font-label{
        color:#b9b9b9!important;
        text-shadow:none!important;
      }
      body.purplenight .theme-menu .theme-option{
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
      body.purplenight .theme-menu .theme-option::before,
      body.purplenight .theme-menu .theme-option::after{
        content:none!important;
        display:none!important;
      }
      body.purplenight .theme-menu .theme-option:hover,
      body.purplenight .theme-menu .theme-option.active{
        background:#303030!important;
        color:#f1f1f1!important;
        box-shadow:none!important;
        text-shadow:none!important;
      }
      body.purplenight .theme-menu .theme-option .theme-swatch{box-shadow:none!important}
      body.purplenight .theme-menu .sw-purplenight{
        box-shadow:none!important;
        border-color:rgba(255,255,255,.16)!important;
      }

      @media(max-width:700px){
        body.purplenight .art-hero .hero-panel h1{
          font-size:clamp(39px,12vw,55px)!important;
          line-height:.92!important;
          letter-spacing:-.012em!important;
          -webkit-text-stroke:.72px rgba(255,247,255,.98)!important;
          white-space:nowrap!important;
        }
        body.purplenight .hero-panel{
          width:calc(100% - 10px)!important;
          padding-left:5px!important;
          padding-right:5px!important;
        }
      }
    `;
    document.head.appendChild(style);
  },{once:true});
})(typeof window==='object'?window:globalThis);
