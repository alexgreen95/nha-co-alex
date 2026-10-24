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

      /* Home freshness marker: text only, no ribbon body/fold. */
      html body.purplenight .story-card>.freshness-corner-shell{
        overflow:visible!important;
      }
      html body.purplenight .story-card>.freshness-corner-shell>.freshness-ribbon{
        right:4px!important;
        bottom:7px!important;
        width:auto!important;
        height:auto!important;
        min-width:0!important;
        min-height:0!important;
        padding:0!important;
        color:#fff7ff!important;
        background:transparent!important;
        border:0!important;
        box-shadow:none!important;
        filter:none!important;
        transform:rotate(-45deg)!important;
        transform-origin:center!important;
        font-size:9px!important;
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

      /* Profile / Saved / Reading covers: text-only MỚI at the top-left. */
      html body.purplenight .profile-story-cover{
        overflow:visible!important;
      }
      html body.purplenight .profile-story-cover>.freshness-ribbon{
        left:8px!important;
        top:8px!important;
        right:auto!important;
        bottom:auto!important;
        width:auto!important;
        height:auto!important;
        min-width:0!important;
        min-height:0!important;
        padding:0!important;
        overflow:visible!important;
        color:#fff7ff!important;
        background:transparent!important;
        border:0!important;
        box-shadow:none!important;
        filter:none!important;
        transform:none!important;
        font-size:9px!important;
        font-weight:800!important;
        letter-spacing:.09em!important;
        line-height:1!important;
        text-shadow:
          0 0 2px rgba(255,255,255,.96),
          0 0 6px rgba(255,116,222,.92),
          0 0 11px rgba(255,78,213,.64),
          0 0 17px rgba(188,60,238,.34)!important;
      }
      html body.purplenight .profile-story-cover>.freshness-ribbon::before,
      html body.purplenight .profile-story-cover>.freshness-ribbon::after{
        content:none!important;
        display:none!important;
      }

      @media(max-width:700px){
        html body.purplenight .story-card>.freshness-corner-shell>.freshness-ribbon{
          right:3px!important;
          bottom:6px!important;
          font-size:8.5px!important;
        }
        html body.purplenight .profile-story-cover>.freshness-ribbon{
          left:7px!important;
          top:7px!important;
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
