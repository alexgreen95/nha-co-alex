/* Neon-only tail overrides: checked switches, plain logout, profile freshness placement. */
(function(){
  'use strict';
  if(typeof document!=='object')return;

  const STYLE_ID='nca-neon-controls-profile-v16';
  let style=document.getElementById(STYLE_ID);
  if(!style){
    style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      /* Push category switch: when ON, show the knob clearly. OFF state is untouched. */
      html body.purplenight .push-category-toggle:checked::before{
        display:block!important;
        visibility:visible!important;
        opacity:1!important;
        left:21px!important;
        top:3px!important;
        width:16px!important;
        height:16px!important;
        border-radius:50%!important;
        background:#f4ffff!important;
        box-shadow:
          0 0 3px rgba(255,255,255,.98),
          0 0 7px rgba(77,249,255,.78)!important;
      }

      /* Account menu: keep Logout as a plain row, never a neon-framed button. */
      html body.purplenight #accountMenu .logout{
        background:transparent!important;
        border-left:0!important;
        border-right:0!important;
        border-bottom:0!important;
        border-top:1px solid var(--line)!important;
        border-radius:0!important;
        box-shadow:none!important;
        outline:0!important;
        filter:none!important;
        transform:none!important;
      }
      html body.purplenight #accountMenu .logout::before,
      html body.purplenight #accountMenu .logout::after{
        content:none!important;
        display:none!important;
      }
      html body.purplenight #accountMenu .logout:is(:hover,:active,:focus-visible){
        background:var(--soft)!important;
        box-shadow:none!important;
        outline:0!important;
        filter:none!important;
        transform:none!important;
      }

      /* Saved / Reading shelves: horizontal MỚI, just outside the cover at top-left. */
      html body.purplenight .profile-story-cover{
        overflow:visible!important;
      }
      html body.purplenight .profile-story-cover>.freshness-ribbon{
        position:absolute!important;
        left:-2px!important;
        top:-16px!important;
        right:auto!important;
        bottom:auto!important;
        width:38px!important;
        height:14px!important;
        min-width:0!important;
        min-height:0!important;
        padding:0!important;
        overflow:visible!important;
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
        left:0!important;
        top:0!important;
        width:auto!important;
        height:auto!important;
        display:block!important;
        color:#fff7ff!important;
        background:transparent!important;
        border:0!important;
        box-shadow:none!important;
        transform:none!important;
        transform-origin:center!important;
        font-size:8.5px!important;
        font-weight:800!important;
        letter-spacing:.09em!important;
        line-height:1!important;
        white-space:nowrap!important;
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
