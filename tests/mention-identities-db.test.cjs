const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
test('public bounded search supports slug accents; selected IDs distinguish colliding names; mention trigger and reply dedupe remain correct',async()=>{
 const db=new PGlite(),A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',C='00000000-0000-0000-0000-000000000003';
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'helpers/notifications-schema.sql'),'utf8'));
  await db.query('insert into auth.users(id) values($1),($2),($3)',[A,B,C]);await db.query("insert into profiles(id,display_name) values($1,'Alex'),($2,'Álex'),($3,'Bạn đọc')",[A,B,C]);await db.exec('insert into stories(id) values(1)');
  await db.exec(fs.readFileSync(path.join(__dirname,'../database/migrations/20261009_comment_notifications.sql'),'utf8'));
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=html.indexOf('function slugify('),context={};
  vm.runInNewContext(html.slice(start,html.indexOf('\n',start))+'\n'+html.slice(html.indexOf('const mentionSearchLetters='),html.indexOf('async function searchMentionProfiles'))+'\nglobalThis.pattern=mentionSearchPattern;',context);
  for(const role of ['anon','authenticated']){
   await db.exec('SET ROLE '+role);
   assert.equal((await db.query('select id,display_name,avatar_url from profiles where display_name ~* $1 order by display_name,id limit 8',[context.pattern('al')])).rows.length,2);
   assert.equal((await db.query('select id from profiles where display_name ~* $1 limit 8',[context.pattern('ban')])).rows[0].id,C);
  }
  const as=async id=>{await db.exec('SET ROLE authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])};
  const create=async(user,parent=null,target=null)=>{await as(user);return (await db.query("insert into comments(user_id,content,scope,story_id,parent_id,reply_to_user_id) values($1,'@alex @ban-doc','story',1,$2,$3) returning id",[user,parent,target])).rows[0].id};
  const root=await create(C);await db.query('insert into comment_mentions(comment_id,mentioned_user_id) values($1,$2),($1,$3)',[root,B,C]);
  await as(B);assert.equal((await db.query('select * from notifications where comment_id=$1',[root])).rows[0].type,'mention');
  await as(A);assert.equal((await db.query('select * from notifications where comment_id=$1',[root])).rows.length,0);
  await as(C);assert.equal((await db.query('select * from notifications where comment_id=$1',[root])).rows.length,0);
  assert.deepEqual((await db.query('select mentioned_user_id from comment_mentions where comment_id=$1 order by mentioned_user_id',[root])).rows.map(r=>r.mentioned_user_id),[B,C]);
  const reply=await create(A,root,C);await db.query('insert into comment_mentions(comment_id,mentioned_user_id) values($1,$2)',[reply,C]);
  await as(C);const ns=(await db.query('select * from notifications where comment_id=$1',[reply])).rows;assert.equal(ns.length,1);assert.equal(ns[0].type,'reply');assert.equal(ns[0].actor_id,A);
 }finally{await db.close();}
});
