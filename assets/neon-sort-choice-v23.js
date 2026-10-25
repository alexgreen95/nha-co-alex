/* Neon-only sort menu selection: default choices stay plain; only an explicitly chosen option glows. */
(function(){
  'use strict';
  if(typeof document!=='object')return;

  const STYLE_ID='nca-neon-sort-choice-v23';
  if(!document.getElementById(STYLE_ID)){
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      /* Undo the frozen base tube on .sort-choice while the menu is idle. */
      html body.purplenight #sortMenu .sort-choice{
        position:relative!important;
        isolation:auto!important;
        overflow:hidden!important;
        background:transparent!important;
        color:var(--fg)!important;
        border:0!important;
        outline:0!important;
        border-radius:8px!important;
        box-shadow:none!important;
        filter:none!important;
        transform:none!important;
        text-shadow:none!important;
      }
      html body.purplenight #sortMenu .sort-choice::before,
      html body.purplenight #sortMenu .sort-choice::after{
        content:none!important;
        display:none!important;
      }
      html body.purplenight #sortMenu .sort-choice:hover{
        background:var(--soft)!important;
        color:var(--fg)!important;
        box-shadow:none!important;
        text-shadow:none!important;
      }

      /* Any actual sort option gets the Neon tube only after the reader chooses it. */
      html body.purplenight #sortMenu button.nca-neon-sort-selected{
        position:relative!important;
        isolation:isolate!important;
        overflow:visible!important;
        background:rgba(5,6,13,.10)!important;
        color:#f8fdff!important;
        border:0!important;
        outline:0!important;
        border-radius:14px!important;
        box-shadow:none!important;
        filter:none!important;
        transform:none!important;
        text-shadow:
          0 0 2px rgba(255,255,255,.82),
          0 0 6px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 48%,transparent)!important;
      }
      html body.purplenight #sortMenu button.nca-neon-sort-selected::before{
        content:""!important;
        display:block!important;
        position:absolute!important;
        inset:0!important;
        z-index:-1!important;
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
      html body.purplenight #sortMenu button.nca-neon-sort-selected::after{
        content:none!important;
        display:none!important;
      }
      html body.purplenight #sortMenu button.nca-neon-sort-selected:hover{
        background:rgba(5,6,13,.14)!important;
        color:#f8fdff!important;
        text-shadow:
          0 0 2px rgba(255,255,255,.82),
          0 0 6px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 48%,transparent)!important;
      }
    `;
    document.head.appendChild(style);
  }

  /* chooseSort() stops bubbling, so capture the click before its inline handler runs. */
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#sortMenu button[onclick*="chooseSort"]');
    if(!button)return;
    const menu=button.closest('#sortMenu');
    menu?.querySelectorAll('.nca-neon-sort-selected').forEach(item=>item.classList.remove('nca-neon-sort-selected'));
    button.classList.add('nca-neon-sort-selected');
  },true);
})();
