const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('admin top-level notification, role-based deletion, cascade, role protection and existing triggers',async()=>{
 const db=new PGlite();const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',C='00000000-0000-0000-0000-000000000003';
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'helpers/notifications-schema.sql'),'utf8'));
  await db.query('insert into auth.users(id) values ($1),($2),($3)',[A,B,C]);
  await db.query("insert into profiles(id,role) values ($1,'admin'),($2,'reader'),($3,'reader')",[A,B,C]);
  await db.exec('insert into stories(id) values(1); insert into chapters(id,story_id,chapter_number,published) values(111,1,1,true)');
  await db.exec(fs.readFileSync(path.join(__dirname,'../database/migrations/20261009_comment_notifications.sql'),'utf8'));
  const sql=fs.readFileSync(path.join(__dirname,'../database/migrations/20261009_admin_comment_notifications.sql'),'utf8');await db.exec(sql);await db.exec(sql);
  const as=async id=>{await db.exec('SET ROLE authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
  const add=async(user,scope,parent=null,target=null)=>{await as(user);return (await db.query('insert into comments(user_id,content,scope,story_id,chapter_index,paragraph_index,parent_id,reply_to_user_id) values($1,$2,$3,1,0,52,$4,$5) returning id',[user,'Text',scope,parent,target])).rows[0].id;};
  for(const scope of ['story','chapter','paragraph']){
   const root=await add(B,scope);await as(A);
   const ns=(await db.query('select * from notifications where comment_id=$1',[root])).rows;assert.equal(ns.length,1);assert.equal(ns[0].type,'comment');assert.equal(ns[0].actor_id,B);assert.equal(ns[0].chapter_id,scope==='story'?null:111);
   await as(B);await db.query('insert into comment_mentions(comment_id,mentioned_user_id) values($1,$2)',[root,A]);
   await as(A);assert.equal((await db.query('select * from notifications where comment_id=$1',[root])).rows.length,1);
   const adminRoot=await add(A,scope);assert.equal((await db.query('select * from notifications where comment_id=$1',[adminRoot])).rows.length,0);
   const reply=await add(C,scope,root,B);
   await as(B);assert.equal((await db.query("select * from notifications where comment_id=$1 and type='reply'",[reply])).rows.length,1);
   await db.query('insert into comment_likes(comment_id,user_id) values($1,$2)',[reply,B]);
   await as(C);assert.equal((await db.query("select * from notifications where comment_id=$1 and type='comment_like'",[reply])).rows.length,1);
   assert.equal((await db.query('delete from comments where id=$1 returning id',[root])).rows.length,0);
   await as(A);await db.query('delete from comments where id=$1',[reply]);assert.equal((await db.query('select * from comments where id=$1',[root])).rows.length,1);assert.equal((await db.query('select * from comment_likes where comment_id=$1',[reply])).rows.length,0);
   const cascade=await add(C,scope,root,B);await as(A);await db.query('delete from comments where id=$1',[root]);assert.equal((await db.query('select * from comments where id in ($1,$2)',[root,cascade])).rows.length,0);
   assert.equal((await db.query('select * from notifications where comment_id in ($1,$2,$3)',[root,cascade,reply])).rows.length,0);
  }
  await as(B);await assert.rejects(db.query("update profiles set role='admin' where id=$1",[B]));
  await db.query("update profiles set display_name='Tên mới' where id=$1",[B]);
  await db.exec('RESET ROLE');await db.query('delete from profiles where id=$1',[C]);await as(C);await assert.rejects(db.query("insert into profiles(id,role) values($1,'admin')",[C]));
  await db.query("insert into profiles(id,role) values($1,'reader')",[C]);
  const own=await add(B,'story');await as(B);assert.equal((await db.query('delete from comments where id=$1 returning id',[own])).rows.length,1);
 }finally{await db.close();}
});
