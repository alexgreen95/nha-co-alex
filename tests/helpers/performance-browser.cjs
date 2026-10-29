'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const {commentPagesFixture}=require('./comment-pages-fixture.cjs');
const root=path.resolve(__dirname,'../..'),base='http://127.0.0.1:43129';
let browser,sdk;
async function start(){
  sdk=execFileSync('curl',['--fail','--silent','--show-error','--max-time','25','https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2']);
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
}
async function stop(){await browser?.close();}
async function fixture({signed=false,gate=true,account='reader',storageState}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',storageState}),page=await context.newPage();
  const errors=[],requests=[],state={viewGate:null,countGate:null,viewFailure:false,metadataGate:null,progressGate:null,memberGate:null,progressFailure:false};
  const fixtures={stories:[{id:1,title:'Audit Story',author:'Alex',published:true,status:'ongoing'}],chapters:[1,2].map(id=>({id,story_id:1,chapter_number:id,title:'Chapter '+id,published:true})),comments:[],profiles:[{id:'reader',display_name:'Reader',role:'member',bio:'Profile fixture'}]};
  page.on('pageerror',e=>errors.push(e.message));
  fixtures.reading_progress=signed?[{user_id:account,story_id:1,chapter_id:1,scroll_position:600,updated_at:'2026-10-29T00:00:00Z'}]:[];
  await context.addInitScript(({signed,account})=>{
    window.perfTrace={pages:[],homePaints:0,readerPaints:0};
    const sample=()=>{const trace=window.perfTrace;const home=document.getElementById('home'),reader=document.getElementById('reader');
      if(!document.body?.classList.contains('gate-locked')){
        if(home&&!home.classList.contains('hidden')&&getComputedStyle(home).visibility==='visible')trace.homePaints++;
        if(reader&&!reader.classList.contains('hidden')&&document.querySelector('#chapter .para'))trace.readerPaints++;
        const id=['home','storyIntro','reader','profilePage'].find(id=>{const e=document.getElementById(id);return e&&!e.classList.contains('hidden')&&getComputedStyle(e).visibility==='visible'});
        if(id&&trace.pages.at(-1)!==id)trace.pages.push(id);
      }requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
    if(signed){let sdk;Object.defineProperty(window,'supabase',{configurable:true,get:()=>sdk,set:v=>{sdk=v;const create=v.createClient;v.createClient=(...args)=>{const c=create(...args),session={user:{id:account,user_metadata:{full_name:'Reader'}}};c.auth.getSession=async()=>({data:{session}});c.auth.onAuthStateChange=cb=>{queueMicrotask(()=>cb('INITIAL_SESSION',session));return {data:{subscription:{unsubscribe(){}}}}};return c}}});}
  },{signed,account});
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'application/javascript',body:sdk});
    if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
    if(url.origin===base){
      if(url.pathname==='/api/gate-check')return route.fulfill({status:gate?200:401,contentType:'application/json',body:JSON.stringify({ok:gate})});
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,body:'{}'});
      if(url.pathname.startsWith('/_vercel/'))return route.fulfill({contentType:'application/javascript',body:''});
      const file=path.resolve(root,'.'+(path.extname(url.pathname)?url.pathname:'/index.html'));
      if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
      return route.fulfill({status:404,body:''});
    }
    if(!url.hostname.endsWith('.supabase.co'))throw Error('Unexpected external request '+url.hostname);
    const table=url.pathname.split('/').pop(),body=req.postData()?req.postDataJSON():{};
    requests.push({table,method:req.method(),body,query:url.search});
    if(table==='reading_progress'&&req.method()==='GET'&&url.searchParams.has('story_id')&&state.progressGate)await state.progressGate;
    if((table==='saved_stories'||table==='reading_progress'&&!url.searchParams.has('story_id'))&&req.method()==='GET'&&state.memberGate)await state.memberGate;
    if((table==='stories'||table==='chapters')&&state.metadataGate)await state.metadataGate;
    if(table==='story_views'&&state.viewGate)await state.viewGate;
    if(table==='nca_story_view_counts'&&state.countGate)await state.countGate;
    if(table==='nca_context_comment_root_page')await new Promise(r=>setTimeout(r,50));
    let data=fixtures[table]||[];
    if(table==='paragraphs')data=Array.from({length:80},(_,i)=>({id:i+1,paragraph_number:i+1,content:'Paragraph '+i+' '+('Nội dung thử nghiệm. '.repeat(10))}));
    if(table==='profiles'&&url.searchParams.get('id')?.startsWith('eq.'))data=fixtures.profiles[0];
    if(table==='saved_stories')data=signed?[{story_id:1}]:[];
    if(table==='reading_progress')data=fixtures.reading_progress.filter(row=>['user_id','story_id'].every(key=>!url.searchParams.has(key)||String(row[key])===url.searchParams.get(key).replace(/^eq\./,'')));
    if(table==='nca_get_freshness_catalog')data={server_now:new Date().toISOString(),stories:[],recent_chapters:[]};
    if(table==='nca_get_freshness_state')data={baseline_cutoff_at:'2026-10-01T00:00:00Z',acks:[],read_chapter_ids:[]};
    if(table==='nca_story_view_counts')data=[{story_id:1,view_count:1}];
    if(table==='nca_chapter_like_counts')data=(body.p_chapter_ids||[]).map(chapter_id=>({chapter_id,like_count:0}));
    if(table==='nca_story_comment_counts')data=[{story_id:1,comment_count:0}];
    if(table==='nca_profile_comment_count')data=0;
    if(table==='nca_comment_like_counts')data=(body.p_comment_ids||[]).map(comment_id=>({comment_id,like_count:0}));
    if(table==='nca_comment_activity_page')data={status:'ok',rows:[],has_more:false,next_cursor:null,page_size:body.p_limit||6};
    if(['nca_story_comment_root_page','nca_context_comment_root_page','nca_comment_thread_page','nca_comment_target_path'].includes(table))data=commentPagesFixture(table,body,fixtures,signed?'reader':null);
    if(table==='nca_chapter_comment_counts')data={story_id:1,chapter_index:body.p_chapter_index,chapter_comment_count:0,paragraph_counts:(body.p_paragraph_indices||[]).map(paragraph_index=>({paragraph_index,comment_count:0}))};
    const failed=table==='story_views'&&state.viewFailure||table==='reading_progress'&&state.progressFailure;
    return route.fulfill({status:failed?503:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','content-range':'0-0/0'},body:req.method()==='HEAD'?'':JSON.stringify(failed?{message:'fixture failure'}:data)});
  });
  return {page,context,errors,requests,state,fixtures,base,async close(){state.viewGate=null;state.countGate=null;await context.close();}};
}
module.exports={start,stop,fixture};
