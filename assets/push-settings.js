/* Compatibility bootstrap: keep Push core and freshness UI logically separate. */
(function(root){
  'use strict';
  if(typeof module==='object'&&module.exports){module.exports=require('./push-settings-core.js');return;}
  if(typeof document!=='object'||document.readyState!=='loading')throw Error('NCA_BOOTSTRAP_ORDER');
  document.write('<script src="/assets/push-settings-core.js"><\/script><script src="/assets/freshness.js"><\/script><script src="/assets/freshness-ui.js"><\/script>');
  document.addEventListener('DOMContentLoaded',()=>{
    if(document.getElementById('nca-freshness-ribbon-inset'))return;
    const style=document.createElement('style');
    style.id='nca-freshness-ribbon-inset';
    style.textContent=`
      .story-card>.freshness-corner-shell{
        right:-4px!important;
        bottom:-4px!important;
        width:72px!important;
        height:72px!important;
      }
      .story-card>.freshness-corner-shell>.freshness-ribbon{
        right:-25px!important;
        bottom:16px!important;
        width:90px!important;
      }
      .profile-story-cover{
        overflow:visible!important;
      }
      .profile-story-cover img{
        border-radius:inherit;
      }
      .profile-story-cover>.freshness-ribbon{
        left:-7px!important;
        top:21px!important;
      }
      @media(max-width:700px){
        .story-card>.freshness-corner-shell{
          right:-3px!important;
          bottom:-3px!important;
          width:66px!important;
          height:66px!important;
        }
        .story-card>.freshness-corner-shell>.freshness-ribbon{
          right:-23px!important;
          bottom:14px!important;
          width:84px!important;
        }
        .profile-story-cover>.freshness-ribbon{
          left:-6px!important;
          top:19px!important;
        }
      }
    `;
    document.head.appendChild(style);
  },{once:true});
})(typeof window==='object'?window:globalThis);
