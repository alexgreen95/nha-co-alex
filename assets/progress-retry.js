/* Bounded retry policy for account-owned progress writes. No network or storage. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.NcaProgressRetry=factory();
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const DELAYS=[3000,6000,12000,30000,60000],WINDOW=120000,COOLDOWN=60000;
  function fresh(){return {failures:0,startedAt:null,lastFailureAt:0,nextAt:0,blocked:false,terminal:false};}
  function reset(state){Object.assign(state,fresh());}
  function exhaust(state){state.blocked=true;state.nextAt=0;}
  function wait(state,now=Date.now()){
    if(state.startedAt!==null&&now-state.startedAt>=WINDOW)exhaust(state);
    return state.blocked?Infinity:Math.max(0,state.nextAt-now);
  }
  function fail(state,status,error,now=Date.now(),random=Math.random()){
    const code=String(error?.code||'');
    state.terminal=(status>=400&&status<500&&status!==408&&status!==429)||/^(42501|PGRST30[12]|(?:22|23)[0-9A-Z]{3})$/.test(code);
    if(state.startedAt===null)state.startedAt=now;
    state.lastFailureAt=now;state.failures++;
    if(state.terminal||state.failures>DELAYS.length||now-state.startedAt>=WINDOW){exhaust(state);return;}
    state.nextAt=now+Math.round(DELAYS[state.failures-1]*(1+Math.max(0,Math.min(1,random))*.1));
  }
  function wake(state,reason,now=Date.now()){
    const expired=state.startedAt!==null&&now-state.startedAt>=WINDOW;
    if(reason==='auth'&&(state.blocked||expired)){reset(state);return true;}
    if((state.blocked||expired)&&!state.terminal&&now-state.lastFailureAt>=COOLDOWN){reset(state);return true;}
    return false;
  }
  return Object.freeze({fresh,reset,wait,fail,wake});
});
