const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('notification audit: no chapter trigger; reply likes target reply author; read/unlike/re-like dedupe',async()=>{
 const db=new PGlite(),A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',C='00000000-0000-0000-0000-000000000003';
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'helpers/notifications-schema.sql'),'utf8'));
  await db.query('insert into auth.users values ($1),($2),($3)',[A,B,C]);
  await db.exec("insert into stories values (1);insert into chapters values (11,1,1,true);CREATE TABLE chapter_likes(chapter_id bigint REFERENCES chapters(id),user_id uuid REFERENCES auth.users(id),PRIMARY KEY(chapter_id,user_id));");
  await db.exec(fs.readFileSync(path.join(__dirname,'../database/migrations/20261009_comment_notifications.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../database/migrations/20261009_admin_comment_notifications.sql'),'utf8'));
  await db.query('insert into chapter_likes values (11,$1)',[B]);
  assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from pg_trigger where tgrelid='chapter_likes'::regclass and not tgisinternal")).rows[0].n,0);
  const as=async id=>{await db.exec('SET ROLE authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])};
  for(const scope of ['story','chapter','paragraph']){
   await as(A);const root=(await db.query('insert into comments(user_id,content,scope,story_id) values ($1,\'Root\',$2,1) returning id',[A,scope])).rows[0].id;
   await as(B);const reply=(await db.query('insert into comments(user_id,content,scope,story_id,parent_id,reply_to_user_id) values ($1,\'Reply\',$2,1,$3,$4) returning id',[B,scope,root,A])).rows[0].id;
   await as(C);await db.query('insert into comment_likes(comment_id,user_id) values ($1,$2)',[reply,C]);
   await as(B);let ns=(await db.query("select * from notifications where comment_id=$1 and type='comment_like'",[reply])).rows;assert.equal(ns.length,1);assert.equal(ns[0].user_id,B);assert.equal(ns[0].actor_id,C);
   await db.query('update notifications set is_read=true where id=$1',[ns[0].id]);
   await db.query('insert into comment_likes(comment_id,user_id) values ($1,$2)',[reply,B]);
   assert.equal((await db.query("select count(*)::int n from notifications where comment_id=$1 and type='comment_like'",[reply])).rows[0].n,1);
   await as(C);await db.query('delete from comment_likes where comment_id=$1 and user_id=$2',[reply,C]);await db.query('insert into comment_likes(comment_id,user_id) values ($1,$2)',[reply,C]);
   await as(B);ns=(await db.query("select * from notifications where comment_id=$1 and type='comment_like'",[reply])).rows;assert.equal(ns.length,1);assert.equal(ns[0].is_read,true);
   await as(A);assert.equal((await db.query("select * from notifications where comment_id=$1 and type='comment_like'",[reply])).rows.length,0);
   await as(B);await db.query('delete from notifications where id=$1',[ns[0].id]);
   await as(C);await db.query('delete from comment_likes where comment_id=$1 and user_id=$2',[reply,C]);await db.query('insert into comment_likes(comment_id,user_id) values ($1,$2)',[reply,C]);
   await as(B);ns=(await db.query("select * from notifications where comment_id=$1 and type='comment_like'",[reply])).rows;assert.equal(ns.length,1);assert.equal(ns[0].is_read,false);
  }
 }finally{await db.close()}
});
