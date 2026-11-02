/* Assign remote image URLs only after their surface is visible. */
(function(root){
  'use strict';
  let frame=0;
  function hydrate(){
    frame=0;
    if(document.documentElement.classList.contains('initial-route-pending')||document.body.classList.contains('gate-locked'))return;
    for(const img of document.querySelectorAll('img[data-surface-src]')){
      if(!img.getClientRects().length||getComputedStyle(img).visibility==='hidden')continue;
      img.src=img.getAttribute('data-surface-src');
      img.removeAttribute('data-surface-src');
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(hydrate);}
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','data-surface-src']});
  root.addEventListener('resize',schedule);
  schedule();
})(window);

/* Reader paragraph selection: keep theme-colored highlight without shifting text. */
(function(){
  const style=document.createElement('style');
  style.id='reader-paragraph-highlight-no-shift';
  style.textContent=`
#reader .para-wrap.comment-active .para{
  background:color-mix(in srgb,var(--accent) 12%,transparent)!important;
  box-shadow:none!important;
  border-left:0!important;
  border-radius:7px!important;
  padding-left:0!important;
  margin-left:0!important;
  transition:background .16s ease!important;
}`;
  document.head.appendChild(style);
})();
