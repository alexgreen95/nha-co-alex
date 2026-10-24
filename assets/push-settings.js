/* Compatibility bootstrap: keep Push core and freshness UI logically separate. */
(function(root){
  'use strict';
  if(typeof module==='object'&&module.exports){module.exports=require('./push-settings-core.js');return;}
  if(typeof document!=='object'||document.readyState!=='loading')throw Error('NCA_BOOTSTRAP_ORDER');
  document.write('<script src="/assets/push-settings-core.js"><\/script><script src="/assets/freshness.js"><\/script><script src="/assets/freshness-ui.js"><\/script>');
  document.addEventListener('DOMContentLoaded',()=>{
    const neonOption=document.querySelector('.theme-option[data-theme="purplenight"]');
    if(neonOption){
      const textNodes=[...neonOption.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE);
      if(textNodes.length)textNodes[textNodes.length-1].nodeValue='Neon';
      else neonOption.append('Neon');
      neonOption.setAttribute('aria-label','Neon');
    }

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

      /* Neon replaces Purple Night only. Keep the internal key for saved preferences. */
      .sw-purplenight{
        background:conic-gradient(from 40deg,#4df9ff,#ff4ed5,#a8ff5a,#ffd85a,#8d6bff,#4df9ff)!important;
        border-color:#4df9ff!important;
        box-shadow:0 0 5px rgba(77,249,255,.7),0 0 9px rgba(255,78,213,.45)!important;
      }
      body.purplenight{
        --bg:#060710!important;
        --fg:#f5fbff!important;
        --muted:#a8b2c8!important;
        --line:#252b3e!important;
        --panel:#0b0e18!important;
        --card:#0a0d17!important;
        --soft:#101526!important;
        --accent:#4df9ff!important;
        --neon-cyan:#4df9ff;
        --neon-pink:#ff4ed5;
        --neon-lime:#a8ff5a;
        --neon-gold:#ffd85a;
        --neon-violet:#9a73ff;
      }
      body.purplenight header{
        background:rgba(6,7,16,.92)!important;
        border-bottom-color:rgba(77,249,255,.24)!important;
        box-shadow:0 5px 24px rgba(0,0,0,.28),0 1px 0 rgba(255,78,213,.12)!important;
      }
      body.purplenight .card,
      body.purplenight .story-card,
      body.purplenight .community-card,
      body.purplenight .story-intro-top,
      body.purplenight .intro-tabs,
      body.purplenight .intro-pane,
      body.purplenight .profile-card,
      body.purplenight .profile-section{
        background:#0a0d17!important;
        border-color:#242b3e!important;
        box-shadow:0 8px 24px rgba(0,0,0,.24)!important;
      }
      body.purplenight .theme-menu,
      body.purplenight .font-menu,
      body.purplenight .account-menu,
      body.purplenight .notif-panel,
      body.purplenight .paragraph-comment-panel,
      body.purplenight #emojiPopup{
        background:#090c16!important;
        border-color:rgba(77,249,255,.28)!important;
        box-shadow:0 16px 38px rgba(0,0,0,.42),0 0 18px rgba(77,249,255,.07)!important;
      }

      /* Neon hero: no sunset artwork, only dark ambience + glowing sign. */
      body.purplenight .art-hero{
        background:
          radial-gradient(circle at 16% 24%,rgba(77,249,255,.16),transparent 26%),
          radial-gradient(circle at 84% 22%,rgba(255,78,213,.15),transparent 28%),
          radial-gradient(circle at 50% 92%,rgba(154,115,255,.12),transparent 34%),
          linear-gradient(180deg,#060710 0%,#080a14 58%,#060710 100%)!important;
        border-bottom:1px solid rgba(77,249,255,.12)!important;
      }
      body.purplenight .art-hero-image{
        display:none!important;
        background-image:none!important;
      }
      body.purplenight .hero-fade-top,
      body.purplenight .hero-fade{
        display:none!important;
      }
      body.purplenight .art-hero::after{
        content:""!important;
        position:absolute!important;
        inset:0!important;
        z-index:1!important;
        pointer-events:none!important;
        background:
          linear-gradient(rgba(77,249,255,.025) 1px,transparent 1px),
          linear-gradient(90deg,rgba(255,78,213,.02) 1px,transparent 1px)!important;
        background-size:44px 44px!important;
        opacity:.55!important;
      }
      body.purplenight .hero-panel{
        width:min(860px,calc(100% - 36px))!important;
        padding:30px 20px 24px!important;
        background:transparent!important;
        box-shadow:none!important;
        border:0!important;
      }
      body.purplenight .art-hero .hero-panel h1{
        margin:0 0 8px!important;
        font-family:'Brush Script MT','Segoe Script','Lucida Handwriting',cursive!important;
        font-size:clamp(62px,8.2vw,96px)!important;
        font-weight:700!important;
        line-height:1!important;
        letter-spacing:.01em!important;
        color:#f8ffff!important;
        -webkit-text-stroke:.35px rgba(255,255,255,.78)!important;
        text-shadow:
          0 0 2px #fff,
          0 0 7px var(--neon-cyan),
          0 0 15px rgba(77,249,255,.88),
          0 0 25px rgba(255,78,213,.64),
          0 0 46px rgba(154,115,255,.34)!important;
        transform:rotate(-1deg)!important;
      }
      body.purplenight .art-hero .hero-panel .muted{
        color:#c2cce0!important;
        text-shadow:0 0 7px rgba(77,249,255,.32)!important;
        letter-spacing:.055em!important;
      }
      body.purplenight .hero-panel .search{
        background:rgba(5,8,16,.88)!important;
        border:1px solid rgba(77,249,255,.66)!important;
        box-shadow:
          inset 0 0 10px rgba(77,249,255,.05),
          0 0 8px rgba(77,249,255,.26),
          0 0 18px rgba(255,78,213,.10)!important;
      }
      body.purplenight .hero-panel .search input{
        background:transparent!important;
        color:#effcff!important;
        caret-color:var(--neon-cyan)!important;
      }
      body.purplenight .hero-panel .search input::placeholder{
        color:#8f9bb2!important;
      }
      body.purplenight .hero-panel .search button{
        background:rgba(9,14,25,.92)!important;
        border-color:rgba(255,78,213,.5)!important;
        color:#ffd8f5!important;
      }

      /* Shared neon-sign treatment for controls. */
      body.purplenight :is(
        .nav button,
        .btn,
        .home-tab,
        .sort-main,
        .sort-choice,
        .float-tools button,
        .profile-tabs button,
        .notif-filters button,
        .chapter-end-nav button,
        .comment-login-gate button,
        .home-feed-list-more,
        .profile-activity-list-more,
        .theme-option,
        .comment-panel-close,
        .emoji-trigger
      ){
        --neon-tone:var(--neon-cyan);
        background:rgba(8,11,20,.88)!important;
        color:#f6fdff!important;
        border-color:color-mix(in srgb,var(--neon-tone) 68%,#263044)!important;
        box-shadow:
          inset 0 0 8px color-mix(in srgb,var(--neon-tone) 7%,transparent),
          0 0 5px color-mix(in srgb,var(--neon-tone) 32%,transparent),
          0 0 12px color-mix(in srgb,var(--neon-tone) 12%,transparent)!important;
        text-shadow:0 0 6px color-mix(in srgb,var(--neon-tone) 46%,transparent)!important;
      }
      body.purplenight :is(
        .nav button,
        .btn,
        .home-tab,
        .sort-main,
        .sort-choice,
        .float-tools button,
        .profile-tabs button,
        .notif-filters button,
        .chapter-end-nav button,
        .comment-login-gate button,
        .home-feed-list-more,
        .profile-activity-list-more,
        .theme-option,
        .comment-panel-close,
        .emoji-trigger
      ):is(:hover,:focus-visible){
        border-color:var(--neon-tone)!important;
        box-shadow:
          inset 0 0 10px color-mix(in srgb,var(--neon-tone) 10%,transparent),
          0 0 7px color-mix(in srgb,var(--neon-tone) 52%,transparent),
          0 0 18px color-mix(in srgb,var(--neon-tone) 22%,transparent)!important;
      }

      body.purplenight .story-actions .btn:first-child,
      body.purplenight .intro-actions .btn:first-child,
      body.purplenight .home-tab:nth-child(1),
      body.purplenight .profile-tabs button:nth-child(1),
      body.purplenight .notif-filters button:nth-child(1),
      body.purplenight .float-tools button:nth-child(1){--neon-tone:var(--neon-cyan)}
      body.purplenight .story-actions .btn:nth-child(2),
      body.purplenight .intro-actions .btn:nth-child(2),
      body.purplenight .home-tab:nth-child(2),
      body.purplenight .profile-tabs button:nth-child(2),
      body.purplenight .notif-filters button:nth-child(2),
      body.purplenight .float-tools button:nth-child(2){--neon-tone:var(--neon-pink)}
      body.purplenight .home-tab:nth-child(3),
      body.purplenight .profile-tabs button:nth-child(3),
      body.purplenight .notif-filters button:nth-child(3),
      body.purplenight .float-tools button:nth-child(3){--neon-tone:var(--neon-lime)}
      body.purplenight .profile-tabs button:nth-child(4),
      body.purplenight .notif-filters button:nth-child(4),
      body.purplenight .float-tools button:nth-child(4){--neon-tone:var(--neon-gold)}
      body.purplenight .notif-filters button:nth-child(5),
      body.purplenight .float-tools button:nth-child(5){--neon-tone:var(--neon-violet)}
      body.purplenight .float-tools button:nth-child(6){--neon-tone:var(--neon-pink)}
      body.purplenight .float-tools button:nth-child(7){--neon-tone:var(--neon-cyan)}
      body.purplenight .theme-option:nth-of-type(1){--neon-tone:var(--neon-cyan)}
      body.purplenight .theme-option:nth-of-type(2){--neon-tone:var(--neon-violet)}
      body.purplenight .theme-option:nth-of-type(3){--neon-tone:var(--neon-pink)}
      body.purplenight .theme-option:nth-of-type(4){--neon-tone:var(--neon-cyan)}
      body.purplenight .theme-option:nth-of-type(5){--neon-tone:var(--neon-lime)}
      body.purplenight .theme-option:nth-of-type(6){--neon-tone:var(--neon-gold)}
      body.purplenight .theme-option:nth-of-type(7){--neon-tone:var(--neon-pink)}
      body.purplenight .home-feed-list-more{--neon-tone:var(--neon-gold)}
      body.purplenight .sort-main{--neon-tone:var(--neon-violet)}
      body.purplenight .chapter-end-nav>button:first-child{--neon-tone:var(--neon-cyan)}
      body.purplenight .chapter-end-nav>button:last-child{--neon-tone:var(--neon-pink)}

      body.purplenight .home-tab.active,
      body.purplenight .profile-tabs button.active,
      body.purplenight .notif-filters button.active{
        color:#fff!important;
        border-color:var(--neon-tone)!important;
        box-shadow:
          inset 0 0 12px color-mix(in srgb,var(--neon-tone) 10%,transparent),
          0 0 8px color-mix(in srgb,var(--neon-tone) 58%,transparent),
          0 0 20px color-mix(in srgb,var(--neon-tone) 26%,transparent)!important;
      }
      body.purplenight .intro-tabs button.active{
        color:var(--neon-cyan)!important;
        border-bottom-color:var(--neon-cyan)!important;
        text-shadow:0 0 7px rgba(77,249,255,.54)!important;
      }
      body.purplenight .status-done{color:#baffd9!important}
      body.purplenight .status-ongoing{color:#ffe0a0!important}
      body.purplenight input,
      body.purplenight textarea,
      body.purplenight select{
        background:#080b14!important;
        border-color:#283148!important;
        color:#f2f8ff!important;
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
        body.purplenight .art-hero .hero-panel h1{
          font-size:clamp(52px,16vw,72px)!important;
        }
        body.purplenight .hero-panel{
          padding:24px 14px 20px!important;
        }
      }
    `;
    document.head.appendChild(style);
  },{once:true});
})(typeof window==='object'?window:globalThis);
