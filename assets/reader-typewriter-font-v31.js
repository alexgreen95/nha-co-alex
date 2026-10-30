/* Scoped reader font option: system monospace/typewriter stack, no external font request. */
(function(root){
  'use strict';
  if(typeof document!=='object')return;

  const FONT_NAME='Typewriter';
  const FONT_LABEL='Typewriter';
  const FONT_STACK='ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  function markActive(){
    document.querySelectorAll('#fontMenu [data-font]').forEach((button)=>{
      button.classList.toggle('active',button.dataset.font===FONT_NAME);
    });
  }

  function applyTypewriter(closeMenu){
    document.documentElement.style.setProperty('--reading-font',FONT_STACK);
    try{localStorage.setItem('reader_font_family',FONT_NAME);}catch(_error){}
    markActive();
    if(closeMenu!==false&&typeof root.toggleFontMenu==='function')root.toggleFontMenu(false);
  }

  function install(){
    const menu=document.getElementById('fontMenu');
    if(menu&&!menu.querySelector('[data-font="'+FONT_NAME+'"]')){
      const button=document.createElement('button');
      button.type='button';
      button.dataset.font=FONT_NAME;
      button.textContent=FONT_LABEL;
      button.title='Font Typewriter';
      button.style.fontFamily=FONT_STACK;
      button.addEventListener('click',()=>root.setReadingFont(FONT_NAME));
      menu.appendChild(button);
    }

    const original=root.setReadingFont;
    if(typeof original==='function'&&!original.__ncaTypewriterWrapped){
      const wrapped=function(name){
        if(name===FONT_NAME){
          applyTypewriter(true);
          return;
        }
        return original.apply(this,arguments);
      };
      wrapped.__ncaTypewriterWrapped=true;
      root.setReadingFont=wrapped;
    }

    let saved='';
    try{saved=localStorage.getItem('reader_font_family')||'';}catch(_error){}
    if(saved===FONT_NAME)applyTypewriter(false);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})(typeof window==='object'?window:globalThis);
