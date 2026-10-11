const {feedPage}=require('./public-feed-browser.cjs');
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const pause=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
async function setup(){
 const db=new PGlite(),calls=[],holds=new Map(),fail=new Set();
 const root=path.join(__dirname,'../..');
 await db.exec(fs.readFileSync(path.join(__dirname,'notifications-schema.sql'),'utf8'));
 await db.exec("CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;");
 await db.query('INSERT INTO auth.users VALUES($1),($2)',[A,B]);await db.exec('INSERT INTO stories VALUES(1)');await db.query("INSERT INTO profiles(id,display_name,role) VALUES($1,'Alex','admin'),($2,'Reader','reader')",[A,B]);
 await db.exec(fs.readFileSync(root+'/database/migrations/20261011_comment_pages_step5cb1_draft.sql','utf8'));
 await db.exec(fs.readFileSync(root+'/database/migrations/20261011_comment_activity_step5cc_draft.sql','utf8'));
 const page=await feedPage(0);
 await page.evaluate(()=>{commentActivity.state.home.ready=false;commentActivity.state.home.ids=[];commentActivity.state.home.error=null;scopedComments.state.entities.clear();scopedComments.state.entityStamps.clear();});
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop(),method=req.method(),body=req.postDataJSON();
  if(method==='OPTIONS')return route.fulfill({status:200,headers,body:''});
  const call={name,method,body,url};calls.push(call);
  // Capture synthetic local source BEFORE a held response to model stale reads.
  try{
   const uid=await page.evaluate(()=>authUser?.id||'');
   await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[uid,JSON.stringify({})]);
   let data,raw;
   const signatures={nca_comment_activity_page:['p_user_id','p_cursor','p_limit'],nca_story_comment_root_page:['p_story_id','p_page_number','p_target_root_id'],nca_context_comment_root_page:['p_context','p_story_id','p_chapter_index','p_paragraph_index','p_loaded_paragraph_count','p_sort','p_cursor','p_limit','p_target_root_id'],nca_comment_thread_page:['p_root_id','p_cursor','p_limit','p_target_comment_id'],nca_comment_target_path:['p_comment_id','p_continuation']};
   if(signatures[name]){const args=signatures[name].map(k=>body[k]??null);data=(await db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r;}
   else if(name==='comment_mentions'&&method==='GET'){
    const ids=inValues(url,'comment_id'),offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||200);
    data=(await db.query('SELECT comment_id::text,mentioned_user_id FROM comment_mentions WHERE comment_id=ANY($1::bigint[]) ORDER BY id LIMIT $2 OFFSET $3',[ids,limit,offset])).rows;
   }else if(name==='comment_mentions'&&method==='POST'){await db.query('INSERT INTO comment_mentions(comment_id,mentioned_user_id) VALUES($1,$2)',[body.comment_id,body.mentioned_user_id]);data=[];
   }else if(name==='profiles'&&method==='GET'&&url.searchParams.has('id')){
    data=(await db.query('SELECT id,display_name,avatar_url,role FROM profiles WHERE id=ANY($1::uuid[])',[inValues(url,'id')])).rows;
   }else if(name==='comments'){
    if(method==='GET'&&url.searchParams.has('id'))data=(await db.query('SELECT id::text,parent_id::text,story_id::text,scope,chapter_index,paragraph_index FROM comments WHERE id=ANY($1::bigint[])',[inValues(url,'id')])).rows;
    else if(method==='POST')data=(await db.query('INSERT INTO comments(user_id,content,scope,story_id,chapter_index,paragraph_index,parent_id,reply_to_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text,paragraph_id::text,user_id,content,created_at::text,edited_at::text,scope,story_id::text,chapter_index,paragraph_index,parent_id::text,reply_to_user_id',[body.user_id,body.content,body.scope,body.story_id,body.chapter_index,body.paragraph_index,body.parent_id,body.reply_to_user_id])).rows[0];
    else if(method==='PATCH'){await db.query('UPDATE comments SET content=$1,edited_at=$2 WHERE id=$3',[body.content,body.edited_at,inValues(url,'id')[0]]);data=[];}
    else if(method==='DELETE')data=(await db.query('DELETE FROM comments WHERE id=$1 RETURNING id::text',[inValues(url,'id')[0]])).rows;
    else return route.fallback();
   }else if(name==='nca_comment_like_counts')raw=(await db.query("SELECT coalesce(jsonb_agg(jsonb_build_object('comment_id',q.id,'like_count',q.n)),'[]'::jsonb)::text r FROM (SELECT c.id,count(l.id) n FROM comments c LEFT JOIN comment_likes l ON l.comment_id=c.id WHERE c.id=ANY($1::bigint[]) GROUP BY c.id) q",[body.p_comment_ids])).rows[0].r;
   else if(name==='nca_story_comment_counts')data=(await db.query('SELECT s.id story_id,count(c.id)::integer comment_count FROM stories s LEFT JOIN comments c ON c.story_id=s.id WHERE s.id=ANY($1::bigint[]) GROUP BY s.id',[body.p_story_ids])).rows;
   else if(name==='nca_profile_comment_count')data=(await db.query('SELECT count(*)::integer n FROM comments WHERE user_id=$1',[body.p_user_id])).rows[0].n;
   else if(name==='nca_chapter_comment_counts'){const rows=(await db.query('SELECT scope,paragraph_index FROM comments WHERE story_id=$1 AND chapter_index=$2',[body.p_story_id,body.p_chapter_index])).rows;data={story_id:body.p_story_id,chapter_index:body.p_chapter_index,chapter_comment_count:rows.filter(r=>r.scope==='chapter').length,paragraph_counts:body.p_paragraph_indices.map(pi=>({paragraph_index:pi,comment_count:rows.filter(r=>(r.scope==='paragraph'||r.scope==null)&&r.paragraph_index===pi).length}))};}
   else if(name==='nca_my_comment_likes')raw=(await db.query("SELECT coalesce(jsonb_agg(comment_id),'[]'::jsonb)::text r FROM comment_likes WHERE user_id=$1 AND comment_id=ANY($2::bigint[])",[uid,body.p_comment_ids])).rows[0].r;
   else if(name==='comment_likes'){
    if(method==='POST')await db.query('INSERT INTO comment_likes(comment_id,user_id) VALUES($1,$2)',[body.comment_id,body.user_id]);
    if(method==='DELETE')await db.query('DELETE FROM comment_likes WHERE comment_id=$1 AND user_id=$2',[inValues(url,'comment_id')[0],inValues(url,'user_id')[0]]);data=[];
   }else if(name==='nca_comment_notifications_enabled')data=true;
   else return route.fallback();
   const hold=holds.get(name);if(hold){holds.delete(name);hold.started.resolve(call);await hold.release.promise;}
   if(fail.has(name))return route.fulfill({status:503,headers,contentType:'application/json',body:JSON.stringify({message:'Synthetic failure'})});
   return route.fulfill({status:200,headers,contentType:'application/json',body:raw??JSON.stringify(data)});
  }catch(e){return route.fulfill({status:400,headers,contentType:'application/json',body:JSON.stringify({message:e.message,code:e.code})});}
 });
 async function add(id,parent=null,scope='story',ci=null,pi=null,actor=B,time='2026-01-01'){await db.query('INSERT INTO comments(id,user_id,content,scope,story_id,chapter_index,paragraph_index,parent_id,created_at) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8)',[String(id),actor,'Synthetic '+id,scope,ci,pi,parent==null?null:String(parent),time]);await db.exec("SELECT setval(pg_get_serial_sequence('comments','id'),greatest(coalesce(max(id),1),1)) FROM comments");}
 async function account(uid){await page.evaluate(uid=>{authUser=uid?{id:uid,user_metadata:{full_name:'Reader'}}:null;resetAuthAccount(uid);authAccount.profileReady=true;memberProfile=uid?{id:uid,display_name:'Reader',role:uid.endsWith('1')?'admin':'reader'}:null;syncCommentHeartAccount();scopedComments.owner();},uid);}
 function hold(name){const h={started:pause(),release:pause()};holds.set(name,h);return h;}
 return {page,db,calls,fail,hold,add,account,close:async()=>{for(const h of holds.values())h.release.resolve();await page.close();await db.close();}};
}
function inValues(url,key){const value=url.searchParams.get(key)||'';return value.startsWith('in.(')?value.slice(4,-1).split(',').map(x=>x.replaceAll('"','')):value.startsWith('eq.')?[value.slice(3)]:[];}
module.exports={setup,A,B};
