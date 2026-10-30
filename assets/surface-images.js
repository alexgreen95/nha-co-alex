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
