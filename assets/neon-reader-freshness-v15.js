/* Neon-only tail overrides: reader title + text-only freshness markers. */
(function(){
  'use strict';
  if(typeof document!=='object')return;

  const STYLE_ID='nca-neon-reader-freshness-v15';
  let style=document.getElementById(STYLE_ID);
  if(!style){
    style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      /* Reader story title: pale inner tube with a tighter pink halo. */
      html body.purplenight #reader .reader-head #rtitle{
        color:#fff4fb!important;
        -webkit-text-fill-color:#fff4fb!important;
        text-shadow:
          0 0 1px rgba(255,255,255,.98),
          0 0 3px rgba(255,232,248,.94),
          0 0 7px rgba(255,123,218,.78),
          0 0 12px rgba(255,78,213,.46)!important;
      }

      /* Home freshness marker: text only, but keep the exact old ribbon geometry. */
      html body.purplenight .story-card>.freshness-corner-shell{
        overflow:hidden!important;
      }
      html body.purplenight .story-card>.freshness-corner-shell>.freshness-ribbon{
        right:-25px!important;
        bottom:16px!important;
        width:90px!important;
        height:19px!important;
        min-width:0!important;
        min-height:0!important;
        padding:0!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        color:#fff7ff!important;
        background:transparent!important;
        border:0!important;
        box-shadow:none!important;
        filter:none!important;
        transform:rotate(-45deg)!important;
        transform-origin:center!important;
        font-size:8.5px!important;
        font-weight:800!important;
        letter-spacing:.09em!important;
        line-height:1!important;
        text-shadow:
          0 0 2px rgba(255,255,255,.96),
          0 0 6px rgba(255,116,222,.92),
          0 0 11px rgba(255,78,213,.64),
          0 0 17px rgba(188,60,238,.34)!important;
      }
      html body.purplenight .story-card>.freshness-corner-shell>.freshness-ribbon::before,
      html body.purplenight .story-card>.freshness-corner-shell>.freshness-ribbon::after{
        content:none!important;
        display:none!important;
      }

      /* Profile / Saved / Reading covers: keep the old diagonal position, show text only. */
      html body.purplenight .profile-story-cover{
        overflow:visible!important;
      }
      html body.purplenight .profile-story-cover>.freshness-ribbon{
        left:-4px!important;
        top:-4px!important;
        right:auto!important;
        bottom:auto!important;
        width:72px!important;
        height:72px!important;
        min-width:0!important;
        min-height:0!important;
        padding:0!important;
        overflow:hidden!important;
        color:transparent!important;
        background:transparent!important;
        border:0!important;
        box-shadow:none!important;
        filter:none!important;
        transform:none!important;
        font-size:0!important;
        line-height:0!important;
        text-shadow:none!important;
      }
      html body.purplenight .profile-story-cover>.freshness-ribbon::before{
        content:"MỚI"!important;
        position:absolute!important;
        left:-25px!important;
        top:16px!important;
        width:90px!important;
        height:19px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        color:#fff7ff!important;
        background:transparent!important;
        border:0!important;
        box-shadow:none!important;
        transform:rotate(-45deg)!important;
        transform-origin:center!important;
        font-size:8.5px!important;
        font-weight:800!important;
        letter-spacing:.09em!important;
        line-height:1!important;
        text-shadow:
          0 0 2px rgba(255,255,255,.96),
          0 0 6px rgba(255,116,222,.92),
          0 0 11px rgba(255,78,213,.64),
          0 0 17px rgba(188,60,238,.34)!important;
      }
      html body.purplenight .profile-story-cover>.freshness-ribbon::after{
        content:none!important;
        display:none!important;
      }

      /* Neon theme picker is a plain panel: rows are transparent until hover. */
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
      html body.purplenight .theme-menu .theme-option,
      html body.purplenight .theme-menu .theme-option.active{
        position:relative!important;
        isolation:auto!important;
        overflow:hidden!important;
        background:transparent!important;
        color:#f1f1f1!important;
        border:0!important;
        outline:0!important;
        border-radius:7px!important;
        box-shadow:none!important;
        text-shadow:none!important;
        filter:none!important;
        transform:none!important;
      }
      html body.purplenight .theme-menu .theme-option::before,
      html body.purplenight .theme-menu .theme-option::after{
        content:none!important;
        display:none!important;
      }
      html body.purplenight .theme-menu .theme-option:hover{
        background:#303030!important;
        color:#f1f1f1!important;
        border:0!important;
        box-shadow:none!important;
        text-shadow:none!important;
        filter:none!important;
        transform:none!important;
      }
      html body.purplenight .theme-menu .theme-option .theme-swatch{
        box-shadow:none!important;
        filter:none!important;
      }
      html body.purplenight .theme-menu .sw-purplenight{
        box-shadow:none!important;
        border-color:rgba(255,255,255,.16)!important;
      }

      @media(max-width:700px){
        html body.purplenight .story-card>.freshness-corner-shell>.freshness-ribbon{
          right:-25px!important;
          bottom:16px!important;
          width:90px!important;
          height:19px!important;
          font-size:8.5px!important;
        }
        html body.purplenight .profile-story-cover>.freshness-ribbon::before{
          left:-25px!important;
          top:16px!important;
          width:90px!important;
          height:19px!important;
          font-size:8.5px!important;
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
