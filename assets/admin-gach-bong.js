/* Optional cosmetic experiment. Authority is the current account's profiles.role; no persisted trial preference. */
(function(root){
 'use strict';
 const TRIAL='gach-bong-admin',CSS='/assets/admin-gach-bong.css?v=20261110-1';
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
 function paint(){if(!plate)return;const w=plate.offsetWidth,h=plate.offsetHeight;if(!w||!h)return;const svg=plate.querySelector('svg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.querySelectorAll('[data-plate-inset]').forEach(p=>p.setAttribute('d',outline(w,h,Number(p.getAttribute('data-plate-inset'))||0)));svg.querySelector('[data-np-left]')?.setAttribute('transform',`translate(${Math.min(37,w*.085)} ${h/2})`);svg.querySelector('[data-np-right]')?.setAttribute('transform',`translate(${w-Math.min(37,w*.085)} ${h/2}) scale(-1 1)`);}
 function remove(){observer?.disconnect();if(plate){plate.replaceWith(...originalHeadNodes);while(panel.firstChild)reader.insertBefore(panel.firstChild,panel);panel.remove();plate=null;panel=null;}}
 function install(){if(plate)return;reader=document.querySelector('#reader>.reader');head=reader.querySelector('.reader-head');originalHeadNodes=[...head.childNodes];plate=document.createElement('div');plate.className='admin-gach-nameplate';const svg=document.createElementNS(ns,'svg');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');for(const [inset,color,width,fill] of [
  [0,'#5a321d','9','none'],
  [0,'#c99542','6','#fff6df'],
  [0,'#764a28','1.4','none'],
  [7,'#deb05c','2.3','none'],
  [9,'#fff2c4','1.4','none']
 ]){
   const p=document.createElementNS(ns,'path');
   p.setAttribute('data-plate-inset',String(inset));
   p.setAttribute('fill',fill);
   p.setAttribute('stroke',color);
   p.setAttribute('stroke-width',width);
   p.setAttribute('stroke-linejoin','round');
   svg.append(p);
 }
 for(const side of ['left','right']){
   const g=document.createElementNS(ns,'g');
   g.setAttribute('data-np-'+side,'');
   g.setAttribute('stroke','#ac7531');
   g.setAttribute('stroke-width','.8');
   g.setAttribute('stroke-linecap','round');
   for(const d of [
    'M -8 -1 C -1 -3 0 -13 13 -17 C 18 -7 12 -1 -3 1 Z',
    'M -8 1 C -1 3 0 13 13 17 C 18 7 12 1 -3 -1 Z',
    'M -10 0 C -2 -7 7 -7 17 0 C 7 7 -2 7 -10 0 Z'
   ]){
     const p=document.createElementNS(ns,'path');
     p.setAttribute('d',d);
     p.setAttribute('fill','#bc852e');
     g.append(p);
   }
   const stem=document.createElementNS(ns,'path');
   stem.setAttribute('d','M -18 0 H -5');
   stem.setAttribute('fill','none');
   stem.setAttribute('stroke','#a76f2c');
   stem.setAttribute('stroke-width','1.4');
   g.append(stem);svg.append(g);
 }
 plate.append(svg,...originalHeadNodes);head.append(plate);panel=document.createElement('div');panel.className='admin-gach-chapter-panel';while(head.nextSibling)panel.append(head.nextSibling);reader.append(panel);observer=new ResizeObserver(paint);observer.observe(plate);paint();}
 sync();
})(window);
