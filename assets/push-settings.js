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

    if(!document.getElementById('nca-neon-font')){
      const neonFont=document.createElement('link');
      neonFont.id='nca-neon-font';
      neonFont.rel='stylesheet';
      neonFont.href='https://fonts.googleapis.com/css2?family=Comfortaa:wght@300;400&display=swap';
      document.head.appendChild(neonFont);
    }

    const neonTitle=document.querySelector('.art-hero .hero-panel h1');
    if(neonTitle&&!neonTitle.dataset.neonTubed){
      const label=neonTitle.textContent||'Nhà có Alex';
      neonTitle.dataset.neonTubed='1';
      neonTitle.setAttribute('aria-label',label);
      neonTitle.textContent='';
      let visible=0;
      for(const ch of Array.from(label)){
        if(ch===' '){neonTitle.appendChild(document.createTextNode(' '));continue;}
        const span=document.createElement('span');
        span.className='nca-neon-letter';
        span.textContent=ch;
        if([1,4,7,9].includes(visible))span.classList.add(visible%2?'tube-cut-bottom':'tube-cut-right');
        neonTitle.appendChild(span);
        visible++;
      }
    }

    if(document.getElementById('nca-freshness-ribbon-inset'))return;
    const style=document.createElement('style');
    style.id='nca-freshness-ribbon-inset';
    style.textContent=`
      /* Freshness ribbons: geometry intentionally frozen. */
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
      .profile-story-cover{overflow:visible!important}
      .profile-story-cover img{border-radius:inherit}
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

      /* Slightly larger action copy. */
      #stories .story-actions .btn{font-size:15px!important}
      .home-feed-list-more{font-size:14px!important}
      .home-review-more,#commentsPanel .activity-more,.story-comment-more{font-size:13px!important}

      /* Neon replaces Purple Night only; keep the old key for saved preferences. */
      .sw-purplenight{
        background:conic-gradient(from 40deg,#4df9ff,#ff4ed5,#a8ff5a,#ffd85a,#9a73ff,#4df9ff)!important;
        border-color:#4df9ff!important;
        box-shadow:0 0 5px rgba(77,249,255,.72),0 0 10px rgba(255,78,213,.48)!important;
      }
      body.purplenight{
        --bg:#05060d!important;
        --fg:#f5fbff!important;
        --muted:#a8b2c8!important;
        --line:#242a3b!important;
        --panel:#090c15!important;
        --card:#090c15!important;
        --soft:#0e1321!important;
        --accent:#4df9ff!important;
        --neon-cyan:#4df9ff;
        --neon-pink:#ff4ed5;
        --neon-lime:#a8ff5a;
        --neon-gold:#ffd85a;
        --neon-violet:#9a73ff;
      }
      body.purplenight header{
        background:rgba(5,6,13,.94)!important;
        border-bottom-color:rgba(77,249,255,.24)!important;
        box-shadow:0 5px 24px rgba(0,0,0,.30),0 1px 0 rgba(255,78,213,.12)!important;
      }

      /* Light ambient panel glow: visible, but never brighter than the controls. */
      body.purplenight :is(
        #stories .story-card,
        .story-intro-top,
        .intro-tabs,
        .intro-pane,
        .community-card,
        .profile-card,
        .profile-section,
        .chapter-comments,
        .intro-compose,
        .comment-bubble
      ){
        background:#090c15!important;
        border-color:#252d42!important;
        box-shadow:
          0 8px 24px rgba(0,0,0,.30),
          0 0 12px rgba(77,249,255,.055),
          0 0 20px rgba(255,78,213,.025)!important;
      }
      body.purplenight .theme-menu,
      body.purplenight .font-menu,
      body.purplenight .account-menu,
      body.purplenight .notif-panel,
      body.purplenight .paragraph-comment-panel,
      body.purplenight #emojiPopup{
        background:#080b14!important;
        border-color:rgba(77,249,255,.30)!important;
        box-shadow:0 16px 38px rgba(0,0,0,.44),0 0 20px rgba(77,249,255,.08)!important;
      }

      /* Neon hero: no sunset artwork. */
      body.purplenight .art-hero{
        background:
          radial-gradient(circle at 15% 25%,rgba(77,249,255,.16),transparent 28%),
          radial-gradient(circle at 84% 22%,rgba(255,78,213,.14),transparent 29%),
          radial-gradient(circle at 52% 92%,rgba(154,115,255,.11),transparent 36%),
          linear-gradient(180deg,#05060d 0%,#080a14 58%,#05060d 100%)!important;
        border-bottom:1px solid rgba(77,249,255,.11)!important;
      }
      body.purplenight .art-hero-image{display:none!important;background-image:none!important}
      body.purplenight .hero-fade-top,body.purplenight .hero-fade{display:none!important}
      body.purplenight .art-hero::after{
        content:""!important;
        position:absolute!important;
        inset:0!important;
        z-index:1!important;
        pointer-events:none!important;
        background:
          linear-gradient(rgba(77,249,255,.022) 1px,transparent 1px),
          linear-gradient(90deg,rgba(255,78,213,.018) 1px,transparent 1px)!important;
        background-size:46px 46px!important;
        opacity:.50!important;
      }
      body.purplenight .hero-panel{
        width:min(930px,calc(100% - 36px))!important;
        padding:30px 20px 24px!important;
        background:transparent!important;
        box-shadow:none!important;
        border:0!important;
      }

      /* Tubed wordmark: rounded outline, more breathing room, with occasional real-looking tube breaks. */
      body.purplenight .art-hero .hero-panel h1{
        margin:0 0 14px!important;
        font-family:'Comfortaa','Arial Rounded MT Bold','Trebuchet MS','Nunito',sans-serif!important;
        font-size:clamp(68px,8.1vw,112px)!important;
        font-weight:300!important;
        line-height:1.02!important;
        letter-spacing:.11em!important;
        color:transparent!important;
        -webkit-text-fill-color:transparent!important;
        -webkit-text-stroke:2px #eaffff!important;
        paint-order:stroke fill!important;
        text-shadow:none!important;
        filter:
          drop-shadow(0 0 1px #fff)
          drop-shadow(0 0 3px #fff)
          drop-shadow(0 0 7px var(--neon-cyan))
          drop-shadow(0 0 14px rgba(77,249,255,.86))
          drop-shadow(0 0 28px rgba(77,249,255,.44))!important;
        transform:none!important;
        white-space:nowrap!important;
      }
      body.purplenight .art-hero .hero-panel h1 .nca-neon-letter{
        position:relative;
        display:inline-block;
      }
      body.purplenight .art-hero .hero-panel h1 .nca-neon-letter.tube-cut-bottom::after{
        content:"";
        position:absolute;
        left:48%;
        bottom:1px;
        width:8px;
        height:4px;
        transform:translateX(-50%) rotate(-4deg);
        background:#070912;
        border-left:1.5px solid #eaffff;
        border-right:1.5px solid #eaffff;
        box-shadow:-2px 0 4px rgba(77,249,255,.88),2px 0 4px rgba(77,249,255,.88);
      }
      body.purplenight .art-hero .hero-panel h1 .nca-neon-letter.tube-cut-right::after{
        content:"";
        position:absolute;
        right:0;
        top:53%;
        width:4px;
        height:8px;
        transform:translateY(-50%) rotate(3deg);
        background:#070912;
        border-top:1.5px solid #eaffff;
        border-bottom:1.5px solid #eaffff;
        box-shadow:0 -2px 4px rgba(77,249,255,.88),0 2px 4px rgba(77,249,255,.88);
      }
      body.purplenight .art-hero .hero-panel .muted{
        color:#c8d4e7!important;
        text-shadow:0 0 7px rgba(77,249,255,.30)!important;
        letter-spacing:.055em!important;
      }
      body.purplenight .hero-panel .search{
        background:rgba(4,7,14,.90)!important;
        border:1.8px solid #bffcff!important;
        border-radius:18px!important;
        box-shadow:
          inset 0 0 10px rgba(77,249,255,.07),
          0 0 2px #fff,
          0 0 6px rgba(77,249,255,.92),
          0 0 14px rgba(77,249,255,.46),
          0 0 26px rgba(255,78,213,.13)!important;
      }
      body.purplenight .hero-panel .search input{
        background:transparent!important;
        color:#effcff!important;
        caret-color:var(--neon-cyan)!important;
      }
      body.purplenight .hero-panel .search input::placeholder{color:#8f9bb2!important}

      /* Color assignment across Neon controls. */
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
      body.purplenight :is(.comment-compose-row>button:not(.emoji-trigger),.intro-compose-actions>button){--neon-tone:var(--neon-cyan)}
      body.purplenight .story-comment-pagination button{--neon-tone:var(--neon-violet)}

      /* Physical tube frames: the visible line is a neon tube, not the button border itself. */
      body.purplenight :is(
        .nav button,
        .btn,
        .sort-main,
        .sort-choice,
        .float-tools button,
        .chapter-end-nav button,
        .comment-login-gate button,
        .home-feed-list-more,
        .profile-activity-list-more,
        .theme-option,
        .comment-panel-close,
        .emoji-trigger,
        .comment-compose-row>button:not(.emoji-trigger),
        .intro-compose-actions>button,
        .story-comment-pagination button
      ){
        position:relative!important;
        isolation:isolate!important;
        overflow:visible!important;
        background:rgba(6,9,17,.94)!important;
        color:#f7feff!important;
        border:0!important;
        outline:0!important;
        border-radius:13px!important;
        box-shadow:none!important;
        text-shadow:0 0 2px rgba(255,255,255,.94),0 0 6px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 68%,transparent)!important;
      }
      body.purplenight :is(
        .nav button,
        .btn,
        .sort-main,
        .sort-choice,
        .float-tools button,
        .chapter-end-nav button,
        .comment-login-gate button,
        .home-feed-list-more,
        .profile-activity-list-more,
        .theme-option,
        .comment-panel-close,
        .emoji-trigger,
        .comment-compose-row>button:not(.emoji-trigger),
        .intro-compose-actions>button,
        .story-comment-pagination button
      )::before{
        content:""!important;
        position:absolute!important;
        inset:1px!important;
        z-index:-1!important;
        pointer-events:none!important;
        border:2.2px solid color-mix(in srgb,#fff 56%,var(--neon-tone,var(--neon-cyan)) 44%)!important;
        border-radius:inherit!important;
        background:transparent!important;
        box-shadow:
          0 0 1px #fff,
          0 0 4px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 96%,transparent),
          0 0 9px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 62%,transparent),
          0 0 18px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 30%,transparent),
          inset 0 0 4px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 18%,transparent)!important;
        opacity:.96!important;
      }
      body.purplenight :is(
        .nav button,
        .btn,
        .sort-main,
        .sort-choice,
        .float-tools button,
        .chapter-end-nav button,
        .comment-login-gate button,
        .home-feed-list-more,
        .profile-activity-list-more,
        .theme-option,
        .comment-panel-close,
        .emoji-trigger,
        .comment-compose-row>button:not(.emoji-trigger),
        .intro-compose-actions>button,
        .story-comment-pagination button
      ):is(:hover,:focus-visible)::before{
        border-color:#fff!important;
        box-shadow:
          0 0 2px #fff,
          0 0 6px var(--neon-tone,var(--neon-cyan)),
          0 0 13px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 74%,transparent),
          0 0 25px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 38%,transparent),
          inset 0 0 6px color-mix(in srgb,var(--neon-tone,var(--neon-cyan)) 22%,transparent)!important;
      }
      body.purplenight :is(.story-actions .btn,.intro-actions .btn){border-radius:12px!important}

      /* Home tabs: white and quiet until selected. */
      body.purplenight .home-tab{
        --neon-tone:var(--neon-cyan);
        background:none!important;
        background-image:none!important;
        color:#f3f5f8!important;
        border:0!important;
        border-bottom:0!important;
        border-radius:0!important;
        box-shadow:none!important;
        outline:0!important;
        filter:none!important;
        text-shadow:none!important;
        padding-bottom:10px!important;
      }
      body.purplenight .home-tab::before,
      body.purplenight .home-tab::after{content:none!important;display:none!important}
      body.purplenight .home-tab.active{
        background-image:linear-gradient(90deg,transparent 0%,var(--neon-tone) 18%,var(--neon-tone) 82%,transparent 100%)!important;
        background-repeat:no-repeat!important;
        background-position:center bottom!important;
        background-size:76% 2px!important;
        color:#fff!important;
        filter:drop-shadow(0 3px 3px color-mix(in srgb,var(--neon-tone) 72%,transparent)) drop-shadow(0 6px 8px color-mix(in srgb,var(--neon-tone) 38%,transparent))!important;
        text-shadow:0 0 2px #fff,0 0 6px color-mix(in srgb,var(--neon-tone) 84%,transparent),0 0 14px color-mix(in srgb,var(--neon-tone) 42%,transparent)!important;
      }

      /* Story/profile/notification tabs: kill every legacy underline source with higher specificity. */
      body.purplenight #storyIntro .intro-tabs button,
      body.purplenight #storyIntro .intro-tabs button.active,
      body.purplenight .profile-tabs button,
      body.purplenight .notif-filters button{
        --neon-tone:var(--neon-cyan);
        position:relative!important;
        background:none!important;
        background-image:none!important;
        color:#f3f5f8!important;
        border:0!important;
        border-bottom:0!important;
        border-bottom-color:transparent!important;
        border-radius:0!important;
        box-shadow:none!important;
        outline:0!important;
        filter:none!important;
        text-shadow:none!important;
        padding-bottom:10px!important;
      }
      body.purplenight #storyIntro .intro-tabs button::before,
      body.purplenight #storyIntro .intro-tabs button::after,
      body.purplenight .profile-tabs button::before,
      body.purplenight .profile-tabs button::after,
      body.purplenight .notif-filters button::before,
      body.purplenight .notif-filters button::after{
        content:none!important;
        display:none!important;
      }
      body.purplenight #storyIntro .intro-tabs button.active,
      body.purplenight .profile-tabs button.active,
      body.purplenight .notif-filters button.active{
        background-image:linear-gradient(90deg,transparent 0%,var(--neon-tone) 18%,var(--neon-tone) 82%,transparent 100%)!important;
        background-repeat:no-repeat!important;
        background-position:center bottom!important;
        background-size:76% 2px!important;
        color:#fff!important;
        border:0!important;
        border-bottom:0!important;
        box-shadow:none!important;
        filter:drop-shadow(0 3px 3px color-mix(in srgb,var(--neon-tone) 72%,transparent)) drop-shadow(0 6px 8px color-mix(in srgb,var(--neon-tone) 38%,transparent))!important;
        text-shadow:0 0 2px #fff,0 0 6px color-mix(in srgb,var(--neon-tone) 84%,transparent),0 0 14px color-mix(in srgb,var(--neon-tone) 42%,transparent)!important;
      }
      body.purplenight #storyIntro .intro-tabs{border-bottom:1px solid rgba(255,255,255,.10)!important}

      /* Comment surfaces: one consistent ambient glow and one consistent input treatment. */
      body.purplenight :is(.intro-compose,.comment-compose,.comment-bubble,#storyCommentComposer,.chapter-comments){
        --neon-tone:var(--neon-cyan);
      }
      body.purplenight :is(.intro-compose textarea,.comment-compose-row input,.review-editor){
        background:#070a13!important;
        color:#f4fbff!important;
        border:1px solid rgba(77,249,255,.36)!important;
        border-radius:11px!important;
        box-shadow:inset 0 0 9px rgba(77,249,255,.045),0 0 7px rgba(77,249,255,.075)!important;
        outline:0!important;
      }
      body.purplenight :is(.intro-compose textarea,.comment-compose-row input,.review-editor):focus{
        border-color:rgba(77,249,255,.72)!important;
        box-shadow:inset 0 0 10px rgba(77,249,255,.07),0 0 4px rgba(77,249,255,.46),0 0 11px rgba(77,249,255,.18)!important;
      }
      body.purplenight .comment-bubble{
        background:#080c16!important;
        border-color:rgba(77,249,255,.19)!important;
        box-shadow:0 0 10px rgba(77,249,255,.035),0 0 16px rgba(255,78,213,.018)!important;
      }
      body.purplenight #introComments .intro-community-toolbar>strong{
        color:#f7feff!important;
        background:#080b14!important;
        border:1px solid rgba(77,249,255,.42)!important;
        box-shadow:0 0 5px rgba(77,249,255,.18)!important;
      }

      body.purplenight .status-done{color:#baffd9!important}
      body.purplenight .status-ongoing{color:#ffe0a0!important}
      body.purplenight input,
      body.purplenight textarea,
      body.purplenight select{
        background:#080b14!important;
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
        .profile-story-cover>.freshness-ribbon::after{left:13px;top:7px}
        #stories .story-actions .btn{font-size:14px!important}
        body.purplenight .art-hero .hero-panel h1{
          font-size:clamp(50px,14vw,74px)!important;
          -webkit-text-stroke:1.6px #eaffff!important;
          letter-spacing:.07em!important;
        }
        body.purplenight .hero-panel{padding:24px 14px 20px!important}
      }
    `;
    document.head.appendChild(style);
  },{once:true});
})(typeof window==='object'?window:globalThis);
