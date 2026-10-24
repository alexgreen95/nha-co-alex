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
        filter:drop-shadow(0 1px 2px color-mix(in srgb,var(--fg) 16%,transparent));
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
        left:-4px!important;
        top:-4px!important;
        width:72px!important;
        height:72px!important;
        padding:0!important;
        font-size:0!important;
        color:transparent!important;
        background:transparent!important;
        box-shadow:none!important;
        transform:none!important;
        overflow:hidden!important;
        filter:drop-shadow(0 1px 2px color-mix(in srgb,var(--fg) 16%,transparent));
      }
      .profile-story-cover>.freshness-ribbon::before{
        content:"MỚI";
        position:absolute;
        left:-25px;
        top:16px;
        width:90px;
        height:19px;
        display:flex;
        align-items:center;
        justify-content:center;
        color:var(--fresh-ribbon-fg);
        background:var(--fresh-ribbon-bg);
        font-size:8.5px;
        font-weight:800;
        letter-spacing:.08em;
        line-height:1;
        transform:rotate(-45deg);
        transform-origin:center;
        box-shadow:0 1px 4px color-mix(in srgb,var(--fg) 12%,transparent);
      }
      .profile-story-cover>.freshness-ribbon::after{
        content:"";
        position:absolute;
        left:14px;
        top:8px;
        width:0;
        height:0;
        border-bottom:4px solid var(--fresh-ribbon-fold);
        border-right:5px solid transparent;
      }

      #stories .story-actions .btn{
        font-size:15px!important;
      }
      .home-feed-list-more{
        font-size:14px!important;
      }
      .home-review-more,
      #commentsPanel .activity-more,
      .story-comment-more{
        font-size:13px!important;
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
          left:-3px!important;
          top:-3px!important;
          width:66px!important;
          height:66px!important;
        }
        .profile-story-cover>.freshness-ribbon::before{
          left:-23px;
          top:14px;
          width:84px;
          height:18px;
          font-size:8px;
        }
        .profile-story-cover>.freshness-ribbon::after{
          left:13px;
          top:7px;
        }
        #stories .story-actions .btn{
          font-size:14px!important;
        }
      }
    `;
    document.head.appendChild(style);
  },{once:true});
})(typeof window==='object'?window:globalThis);
