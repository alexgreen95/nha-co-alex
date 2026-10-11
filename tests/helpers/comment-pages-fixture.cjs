// Compatibility fixture adapter only. Behavioral B2 tests execute the frozen SQL in PGlite.
const valid=v=>typeof v==='string'?/^[1-9][0-9]*$/.test(v):Number.isSafeInteger(v)&&v>0;
const time=v=>v==='infinity'?Infinity:v==='-infinity'?-Infinity:Date.parse(v);
const idcmp=(a,b)=>String(a).length-String(b).length||(String(a)<String(b)?-1:String(a)>String(b)?1:0);
function commentPagesFixture(name,a,f,uid){
 const rows=(f.comments||[]).filter(c=>valid(c.id)&&valid(c.story_id)),entity=c=>({...c,id:String(c.id),story_id:String(c.story_id),parent_id:c.parent_id==null?null:String(c.parent_id),paragraph_id:c.paragraph_id==null?null:String(c.paragraph_id)});
 const descendants=root=>{const out=[],seen=new Set([String(root)]);let changed=true;while(changed){changed=false;for(const c of rows)if(c.parent_id!=null&&seen.has(String(c.parent_id))&&!seen.has(String(c.id))){seen.add(String(c.id));out.push(c);changed=true;}}return out;};
 if(name==='nca_story_comment_root_page'){
  const roots=rows.filter(c=>String(c.story_id)===String(a.p_story_id)&&c.parent_id==null).sort((x,y)=>time(y.created_at)-time(x.created_at)||idcmp(y.id,x.id)),pages=Math.max(1,Math.ceil(roots.length/20));
  let page=Math.min(pages,Math.max(1,Number(a.p_page_number))),pos=roots.findIndex(c=>String(c.id)===a.p_target_root_id);if(pos>=0)page=Math.floor(pos/20)+1;
  return {status:'ok',story_id:String(a.p_story_id),actual_page:String(page),page_count:String(pages),root_total:String(roots.length),rows:roots.slice((page-1)*20,page*20).map(c=>({comment:entity(c),descendant_total:String(descendants(c.id).length)})),has_more:page<pages,target_status:a.p_target_root_id?(pos<0?'not_found':'found'):'not_requested'};
 }
 if(name==='nca_context_comment_root_page'){
  let roots=rows.filter(c=>String(c.story_id)===String(a.p_story_id)&&c.chapter_index===a.p_chapter_index&&c.parent_id==null&&(a.p_context==='chapter'?(c.scope==='chapter'||((c.scope==='paragraph'||c.scope==null)&&c.paragraph_index>=0&&c.paragraph_index<a.p_loaded_paragraph_count)):((c.scope==='paragraph'||c.scope==null)&&c.paragraph_index===a.p_paragraph_index)));
  const likes=c=>(f.comment_likes||[]).filter(l=>String(l.comment_id)===String(c.id)).length,score=c=>likes(c)+descendants(c.id).length,bucket=c=>['alex','thao-tran'].includes((f.profiles||[]).find(p=>p.id===c.user_id)?.display_name?.toLowerCase())?1:0;
  roots.sort((x,y)=>a.p_sort==='all'?bucket(y)-bucket(x)||time(x.created_at)-time(y.created_at)||idcmp(x.id,y.id):a.p_sort==='interaction'?score(y)-score(x)||time(y.created_at)-time(x.created_at)||idcmp(y.id,x.id):time(y.created_at)-time(x.created_at)||idcmp(y.id,x.id));
  const cursor=a.p_cursor;let start=cursor?Math.max(0,roots.findIndex(c=>String(c.id)===cursor.id)+1):0,pos=roots.findIndex(c=>String(c.id)===a.p_target_root_id);if(a.p_target_root_id)start=Math.max(0,pos);
  const selected=roots.slice(start,start+a.p_limit),token=c=>c?{v:1,context:a.p_context,story_id:String(a.p_story_id),chapter_index:a.p_chapter_index,paragraph_index:a.p_paragraph_index,loaded_paragraph_count:a.p_loaded_paragraph_count,sort:a.p_sort,id:String(c.id),created_at:c.created_at}:null;
  return {status:'ok',root_total:String(roots.length),rows:selected.map(c=>({comment:entity(c),descendant_total:String(descendants(c.id).length),root_like_count:String(likes(c)),score:String(score(c)),admin_bucket:bucket(c)})),has_more:start+selected.length<roots.length,has_before:start>0,next_cursor:token(selected.at(-1)),before_cursor:token(selected[0]),target_status:a.p_target_root_id?(pos<0?'not_found':'found'):'not_requested'};
 }
 if(name==='nca_comment_thread_page'){
  const all=descendants(a.p_root_id).sort((x,y)=>time(x.created_at)-time(y.created_at)||idcmp(x.id,y.id)),pos=all.findIndex(c=>String(c.id)===a.p_target_comment_id);let start=a.p_cursor?Math.max(0,all.findIndex(c=>String(c.id)===a.p_cursor.id)+1):0;if(a.p_target_comment_id)start=Math.max(0,pos);
  const selected=all.slice(start,start+6),token=c=>c?{v:1,root_id:String(a.p_root_id),id:String(c.id),created_at:c.created_at}:null;return {status:a.p_target_comment_id&&pos<0?'target_not_found':'ok',rows:selected.map(entity),descendant_total:String(all.length),has_more:start+selected.length<all.length,has_before:start>0,next_cursor:token(selected.at(-1)),before_cursor:token(selected[0])};
 }
 if(name==='nca_comment_target_path'){
  const target=rows.find(c=>String(c.id)===String(a.p_comment_id)),out=[];if(!target)return {status:'not_found',rows:[]};let current=target;while(current){if(out.some(c=>String(c.id)===String(current.id)))return {status:'cycle',rows:out.map(entity)};out.push(current);if(current.parent_id==null)break;current=rows.find(c=>String(c.id)===String(current.parent_id));}
  if(!current)return {status:'ancestor_unavailable',rows:out.map(entity)};return {status:'resolved',target_id:String(target.id),rows:out.map(entity),root:{id:String(current.id)}};
 }
}
module.exports={commentPagesFixture};
