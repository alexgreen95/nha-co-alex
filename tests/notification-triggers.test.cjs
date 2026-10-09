// npm install --prefix /tmp/nha-db-tests --cache /tmp/nha-npm-cache @electric-sql/pglite
// NODE_PATH=/tmp/nha-db-tests/node_modules node --test tests/notification-triggers.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('database triggers: recipients, self actions, unlike/re-like, nested replies, mention dedupe and RLS',async()=>{
 const db=new PGlite();
 const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',C='00000000-0000-0000-0000-000000000003';
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'helpers/notifications-schema.sql'),'utf8'));
  await db.query('insert into auth.users(id) values ($1),($2),($3)',[A,B,C]);await db.exec('insert into stories(id) values (1)');
  const migration=fs.readFileSync(path.join(__dirname,'../database/migrations/20261009_comment_notifications.sql'),'utf8');
  await db.exec(migration);await db.exec(migration);
  const as=async id=>{await db.exec('SET ROLE authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
  const comment=async(user,scope,parent=null,target=null)=>{await as(user);return (await db.query('insert into comments(user_id,content,scope,story_id,chapter_index,paragraph_index,parent_id,reply_to_user_id) values ($1,$2,$3,1,0,0,$4,$5) returning id',[user,'Comment',scope,parent,target])).rows[0].id;};
  const notifications=async(user)=>{await as(user);return (await db.query('select * from notifications order by id')).rows;};
  for(const scope of ['story','chapter','paragraph']){
   const root=await comment(A,scope);
   await as(B);await db.query('insert into comment_likes(comment_id,user_id) values ($1,$2)',[root,B]);
   let ns=await notifications(A);assert.equal(ns.filter(n=>n.comment_id===root&&n.type==='comment_like').length,1);
   await as(B);await assert.rejects(db.query('insert into comment_likes(comment_id,user_id) values ($1,$2)',[root,B]));
   await db.query('delete from comment_likes where comment_id=$1 and user_id=$2',[root,B]);
   assert.equal((await db.query('select * from comment_likes where comment_id=$1',[root])).rows.length,0);
   await db.query('insert into comment_likes(comment_id,user_id) values ($1,$2)',[root,B]);
   ns=await notifications(A);assert.equal(ns.filter(n=>n.comment_id===root&&n.type==='comment_like').length,1);
   await as(A);await db.query('insert into comment_likes(comment_id,user_id) values ($1,$2)',[root,A]);
   const self=await comment(A,scope,root,A);
   assert.equal((await notifications(A)).filter(n=>n.comment_id===self).length,0);
   const reply=await comment(B,scope,root,A);
   await as(B);await db.query('insert into comment_mentions(comment_id,mentioned_user_id) values ($1,$2)',[reply,A]);
   ns=await notifications(A);assert.equal(ns.filter(n=>n.comment_id===reply).length,1);assert.equal(ns.find(n=>n.comment_id===reply).type,'reply');
   await as(B);await assert.rejects(db.query('insert into comment_mentions(comment_id,mentioned_user_id) values ($1,$2)',[reply,A]));
   const nested=await comment(C,scope,root,B);
   assert.equal((await notifications(B)).filter(n=>n.comment_id===nested&&n.type==='reply').length,1);
   assert.equal((await notifications(A)).filter(n=>n.comment_id===nested).length,0);
   await as(C);await db.query('insert into comment_mentions(comment_id,mentioned_user_id) values ($1,$2)',[nested,A]);
   assert.equal((await notifications(A)).filter(n=>n.comment_id===nested&&n.type==='mention').length,1);
   await as(C);await assert.rejects(db.query('insert into comment_mentions(comment_id,mentioned_user_id) values ($1,$2)',[root,C]));
   await as(B);await assert.rejects(db.query("insert into notifications(user_id,actor_id,type,comment_id) values ($1,$2,'comment_like',$3)",[A,B,root]));
   await assert.rejects(db.query("select nca_create_comment_notification($1,$2,'comment_like',1,$3)",[A,B,root]));
  }
  // Current frontend flattens all reply levels onto the root.
  const flatRoot=await comment(A,'story');
  const flatB=await comment(B,'story',flatRoot,A);
  const flatC=await comment(C,'story',flatRoot,B);
  const flatDeep=await comment(B,'story',flatRoot,C);
  assert.equal((await notifications(C)).filter(n=>n.comment_id===flatDeep&&n.type==='reply').length,1);
  assert.equal((await notifications(A)).filter(n=>n.comment_id===flatDeep).length,0);
  // Existing deep parent chains: recipient may be an ancestor or sibling author.
  const chainRoot=await comment(A,'chapter');
  const chainB=await comment(B,'chapter',chainRoot,A);
  const chainC=await comment(C,'chapter',chainB,B);
  const chainDeep=await comment(B,'chapter',chainC,A);
  assert.equal((await notifications(A)).filter(n=>n.comment_id===chainDeep&&n.type==='reply').length,1);
  assert.equal((await notifications(C)).filter(n=>n.comment_id===chainDeep).length,0);
  const chainSibling=await comment(A,'chapter',chainB,C);
  assert.equal((await notifications(C)).filter(n=>n.comment_id===chainSibling&&n.type==='reply').length,1);
  const invalidRoot=await comment(A,'paragraph');
  const invalid=await comment(B,'paragraph',invalidRoot,C);
  assert.equal((await notifications(A)).filter(n=>n.comment_id===invalid&&n.type==='reply').length,1);
  assert.equal((await notifications(C)).filter(n=>n.comment_id===invalid).length,0);
  const mine=await notifications(A);assert(mine.every(n=>n.user_id===A&&n.actor_id!==A));
  await db.query('update notifications set is_read=true where id=$1',[mine[0].id]);assert((await notifications(A)).find(n=>n.id===mine[0].id).is_read);
  await as(B);assert.equal((await db.query('select * from notifications where user_id=$1',[A])).rows.length,0);
  assert.equal((await db.query('update notifications set is_read=false where user_id=$1 returning id',[A])).rows.length,0);
  await db.exec('SET ROLE anon');assert.equal((await db.query('select * from notifications')).rows.length,0);
  await db.exec('RESET ROLE');const oldRows=(await db.query('select * from notifications order by id')).rows;
  await db.exec(migration);assert.deepEqual((await db.query('select * from notifications order by id')).rows,oldRows);
 }finally{await db.close();}
});
