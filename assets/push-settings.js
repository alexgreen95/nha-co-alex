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
      link.href='https://fonts.googleapis.com/css2?family=Pacifico&family=Dancing+Script:wght@700&display=swap';
      document.head.appendChild(link);
    }

    if(document.getElementById('nca-neon-preview-match-v3'))return;
    const style=document.createElement('style');
    style.id='nca-neon-preview-match-v3';
    style.textContent=`
      /* Preview-match hero: original banner only, treated like wallpaper in a dark room. */
      body.purplenight .art-hero-image{
        display:block!important;
        background-image:url("/alex-banner.jpg")!important;
        background-size:cover!important;
        background-position:center 30%!important;
        background-repeat:no-repeat!important;
        opacity:1!important;
        filter:brightness(.34) saturate(.42) contrast(.92)!important;
      }
      body.purplenight .art-hero::after{
        content:""!important;
        position:absolute!important;
        inset:0!important;
        z-index:1!important;
        pointer-events:none!important;
        opacity:1!important;
        background:
          radial-gradient(ellipse 40% 34% at 50% 31%,rgba(255,61,205,.24) 0%,rgba(170,67,255,.12) 34%,rgba(77,249,255,.04) 52%,transparent 72%),
          radial-gradient(ellipse 24% 26% at 66% 30%,rgba(77,249,255,.08) 0%,transparent 72%),
          rgba(1,2,8,.54)!important;
      }
      body.purplenight .hero-fade-top,
      body.purplenight .hero-fade{display:none!important}

      /* Script neon sign like the approved preview: bright white core, pink tube glow, faint cyan spill. */
      body.purplenight .art-hero .hero-panel h1{
        font-family:'Pacifico','Dancing Script','Segoe Script','Brush Script MT',cursive!important;
        font-size:clamp(78px,8vw,112px)!important;
        font-weight:400!important;
        line-height:1!important;
        letter-spacing:.005em!important;
        color:#fff7ff!important;
        -webkit-text-fill-color:#fff7ff!important;
        -webkit-text-stroke:.55px rgba(255,255,255,.92)!important;
        text-shadow:
          0 0 2px #fff,
          0 0 5px #fff,
          0 0 10px rgba(255,93,218,.98),
          0 0 20px rgba(255,54,204,.90),
          0 0 34px rgba(208,65,255,.66),
          0 0 50px rgba(132,63,255,.42),
          0 0 64px rgba(77,249,255,.16)!important;
        filter:none!important;
        transform:none!important;
        white-space:nowrap!important;
      }
      body.purplenight .art-hero .hero-panel .muted{
        color:#d8d7e4!important;
        text-shadow:0 0 6px rgba(255,78,213,.24)!important;
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
          font-size:clamp(32px,10.2vw,47px)!important;
          letter-spacing:-.015em!important;
          -webkit-text-stroke:.4px rgba(255,255,255,.90)!important;
          white-space:nowrap!important;
        }
        body.purplenight .hero-panel{
          width:calc(100% - 14px)!important;
          padding-left:7px!important;
          padding-right:7px!important;
        }
      }
    `;
    document.head.appendChild(style);
  },{once:true});
})(typeof window==='object'?window:globalThis);
