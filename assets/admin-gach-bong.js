/* Optional cosmetic experiment. Authority is the current account's profiles.role; no persisted trial preference. */
(function(root){
 'use strict';
 const TRIAL='gach-bong-admin',CSS='/assets/admin-gach-bong.css?v=20261105-3';
 let selected=null,baseTheme=null,denied=null,button=null,flight=null,cssFlight=null,timer=null,selection=0;
 const originalTheme=setTheme,originalUI=updateAuthUI,originalMenu=toggleThemeMenu;
 function account(){try{return authAccount?.owner&&authAccount.owner===authUser?.id?authAccount:null}catch{return null}}
 function eligible(state=account()){
  try{return !!state&&state===account()&&state.profileReady===true&&memberProfile?.id===state.owner&&String(memberProfile.role||'').toLowerCase()==='admin'}catch{return false}
 }
 function current(state){return state===account()&&eligible(state)&&denied!==state}
 function position(){
  const epoch=navigationEpoch,y=root.scrollY,x=root.scrollX;
  if(y<=0||!document.body.classList.contains('reading'))return {epoch,x,y};
  const edge=document.querySelector('body>header')?.getBoundingClientRect().bottom||0;
  const el=[...document.querySelectorAll('#chapter .para-wrap')].find(e=>e.getBoundingClientRect().bottom>edge);
  return {epoch,x,y,el,top:el?.getBoundingClientRect().top};
 }
 function preserve(fn){
  const p=position();fn();
  if(navigationEpoch!==p.epoch)return;
  const y=p.el?.isConnected?root.scrollY+(p.el.getBoundingClientRect().top-p.top):p.y;
  if(root.scrollY!==y||root.scrollX!==p.x)root.scrollTo({left:p.x,top:y,behavior:'instant'});
 }
 function mark(){
  if(selected)document.querySelectorAll('#themeMenu [data-theme]').forEach(e=>e.classList.toggle('active',e.dataset.theme===TRIAL));
  else if(button)button.classList.remove('active');
 }
 function stop(){
  ++selection;clearInterval(timer);timer=null;
  if(!selected&&!document.body.classList.contains(TRIAL))return;
  preserve(()=>{remove();document.body.classList.remove(TRIAL);document.body.classList.remove(...THEME_CLASSES);document.body.classList.add(baseTheme||'light');});
  selected=null;baseTheme=null;
  document.querySelectorAll('#themeMenu [data-theme]').forEach(e=>e.classList.toggle('active',document.body.classList.contains(e.dataset.theme)));
 }
 function sync(){
  const state=account();
  if(selected&&(!current(selected)||selected!==state))stop();
  const allowed=eligible(state)&&denied!==state;
  if(!allowed){button?.remove();button=null;return;}
  if(!button){
   button=document.createElement('button');button.type='button';button.className='theme-option';button.dataset.theme=TRIAL;
   const swatch=document.createElement('span');swatch.className='theme-swatch';swatch.style.background='conic-gradient(#993f2c,#d5a354,#fff6df,#993f2c)';
   button.append(swatch,document.createTextNode('Gạch bông cổ điển (Thử nghiệm)'));button.addEventListener('click',()=>{void choose()});
   document.getElementById('themeMenu').append(button);
  }
  mark();
 }
 async function verify(){
  const state=account();if(!eligible(state)){sync();return false;}
  if(flight?.state===state)return flight.promise;
  const entry={state};
  entry.promise=(async()=>{
   let ok=false;const abort=new AbortController(),deadline=setTimeout(()=>abort.abort(),8000);
   try{const {data,error}=await sb.from('profiles').select('id,role').eq('id',state.owner).abortSignal(abort.signal).maybeSingle();ok=!error&&data?.id===state.owner&&String(data.role||'').toLowerCase()==='admin';}catch{}finally{clearTimeout(deadline)}
   if(state!==account())return false;
   denied=ok?null:state;sync();return ok&&current(state);
  })().finally(()=>{if(flight===entry)flight=null});flight=entry;return entry.promise;
 }
 function stylesheet(){
  if(cssFlight)return cssFlight;
  cssFlight=new Promise((resolve,reject)=>{
   const link=document.createElement('link');link.rel='stylesheet';link.href=CSS;
   link.onload=()=>resolve();link.onerror=()=>{link.remove();cssFlight=null;reject(new Error('Không tải được theme thử nghiệm.'))};document.head.append(link);
  });return cssFlight;
 }
 async function choose(){
  const state=account(),request=++selection;if(!eligible(state))return false;
  if(!await verify()||request!==selection||!current(state))return false;
  try{await stylesheet()}catch{sync();return false;}
  if(request!==selection||!current(state))return false;
  if(!selected){
   baseTheme=THEME_CLASSES.find(t=>document.body.classList.contains(t))||'light';
   preserve(()=>{document.body.classList.remove(...THEME_CLASSES);document.body.classList.add('light',TRIAL);install();});
   selected=state;
   timer=setInterval(()=>{if(!document.hidden)void verify()},30000);
  }
  mark();originalMenu(false);return true;
 }
 setTheme=function(t){
  if(t===TRIAL)return choose();
  ++selection;
  if(selected)preserve(()=>{stop();originalTheme(t)});else originalTheme(t);
 };
 root.setTheme=setTheme;
 updateAuthUI=function(...args){try{return originalUI.apply(this,args)}finally{sync()}};
 toggleThemeMenu=function(...args){const result=originalMenu.apply(this,args);sync();if(document.getElementById('themeMenu').classList.contains('open')&&eligible())void verify();return result;};
 root.toggleThemeMenu=toggleThemeMenu;
 root.addEventListener('focus',()=>{if(eligible())void verify();else sync()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(eligible())void verify();else sync()}});
 let observer,head,reader,plate,panel,originalHeadNodes;
 const ns='http://www.w3.org/2000/svg';
 function outline(w,h,inset=0){
  const q=Math.max(37,Math.min(60,w*.115)), l=q+inset, r=w-q-inset,
        t=inset+3,b=h-inset-3,m=h/2, tip=inset+3;
  return [
   'M',l,t,'H',r,
   'C',r+17,t,r+25,t+7,r+26,t+17,
   'C',r+29,m-15,w-tip-13,m-6,w-tip,m,
   'C',w-tip-13,m+6,r+29,m+15,r+26,b-17,
   'C',r+25,b-7,r+17,b,r,b,
   'H',l,
   'C',l-17,b,l-25,b-7,l-26,b-17,
   'C',l-29,m+15,tip+13,m+6,tip,m,
   'C',tip+13,m-6,l-29,m-15,l-26,t+17,
   'C',l-25,t+7,l-17,t,l,t,'Z'
  ].join(' ');
 }
 function paint(){if(!plate)return;const w=plate.offsetWidth,h=plate.offsetHeight;if(!w||!h)return;const svg=plate.querySelector('svg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.querySelector('[data-outer]').setAttribute('d',outline(w,h));svg.querySelector('[data-inner]').setAttribute('d',outline(w,h,4));svg.querySelector('[data-np-left]')?.setAttribute('transform',`translate(${Math.min(37,w*.085)} ${h/2})`);svg.querySelector('[data-np-right]')?.setAttribute('transform',`translate(${w-Math.min(37,w*.085)} ${h/2}) scale(-1 1)`);}
 function remove(){observer?.disconnect();if(plate){plate.replaceWith(...originalHeadNodes);while(panel.firstChild)reader.insertBefore(panel.firstChild,panel);panel.remove();plate=null;panel=null;}}
 function install(){if(plate)return;reader=document.querySelector('#reader>.reader');head=reader.querySelector('.reader-head');originalHeadNodes=[...head.childNodes];plate=document.createElement('div');plate.className='admin-gach-nameplate';const svg=document.createElementNS(ns,'svg');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');for(const [attr,color,width,fill] of [['data-outer','#684128','1.35','#fff6df'],['data-inner','#bc904e','.85','none']]){const p=document.createElementNS(ns,'path');p.setAttribute(attr,'');p.setAttribute('fill',fill);p.setAttribute('stroke',color);p.setAttribute('stroke-width',width);p.setAttribute('stroke-linejoin','round');svg.append(p);}for(const side of ['left','right']){
    const g=document.createElementNS(ns,'g');g.setAttribute('data-np-'+side,'');g.setAttribute('fill','none');g.setAttribute('stroke-linecap','round');
    const petal=document.createElementNS(ns,'path');petal.setAttribute('d','M -11 -1 C -8 -14 4 -15 9 -5 C 1 0 -5 4 -11 -1 Z M -11 1 C -6 12 5 13 9 5 C 0 2 -4 -2 -11 1 Z');petal.setAttribute('fill','#4c9994');petal.setAttribute('fill-opacity','.23');petal.setAttribute('stroke','#41797c');petal.setAttribute('stroke-width','1.1');
    const curl=document.createElementNS(ns,'path');curl.setAttribute('d','M -12 -12 C 5 -23 16 -8 10 1 C 6 7 -2 7 -5 1 C -7 -4 -1 -8 2 -5 M -12 12 C 5 23 16 8 10 -1');curl.setAttribute('stroke','#b78b47');curl.setAttribute('stroke-width','1.45');
    const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx','2');dot.setAttribute('cy','0');dot.setAttribute('r','2.3');dot.setAttribute('fill','#ad5e43');
    g.append(petal,curl,dot);svg.append(g);
   }
   plate.append(svg,...originalHeadNodes);head.append(plate);panel=document.createElement('div');panel.className='admin-gach-chapter-panel';while(head.nextSibling)panel.append(head.nextSibling);reader.append(panel);observer=new ResizeObserver(paint);observer.observe(plate);paint();}
 sync();
})(window);
