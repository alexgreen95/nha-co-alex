const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {PGlite}=require('@electric-sql/pglite');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',Z='00000000-0000-0000-0000-000000000099';
const draft=fs.readFileSync(path.join(__dirname,'../database/migrations/20261010_comment_counts_step5b_draft.sql'),'utf8');
async function setup(){
 const db=new PGlite();await db.exec(fs.readFileSync(path.join(__dirname,'helpers/notifications-schema.sql'),'utf8'));
 await db.exec('ALTER TABLE stories ENABLE ROW LEVEL SECURITY; CREATE POLICY stories_public_select ON stories FOR SELECT USING (true)');
 await db.query('INSERT INTO auth.users VALUES($1),($2)',[A,B]);await db.exec('INSERT INTO stories VALUES(1),(2),(3)');
 await db.query("INSERT INTO profiles(id,display_name) VALUES($1,'A'),($2,'B')",[A,B]);
 await db.query(`INSERT INTO comments(id,user_id,content,scope,story_id,chapter_index,paragraph_index,parent_id) VALUES
 (1,$1,'root','story',1,NULL,NULL,NULL),(2,$2,'reply','story',1,NULL,NULL,1),
 (3,$1,'deep','story',1,NULL,NULL,2),(4,$1,'chapter','chapter',1,0,NULL,NULL),
 (5,$2,'chapter reply','chapter',1,0,NULL,4),(6,$1,'para','paragraph',1,0,0,NULL),
 (7,$2,'para reply','paragraph',1,0,0,6),(8,$2,'other chapter','paragraph',1,1,0,NULL),
 (9,$2,'other story','story',2,NULL,NULL,NULL),(10,$1,'legacy NULL scope',NULL,1,0,2,NULL)`,[A,B]);
 await db.query('INSERT INTO comment_likes(comment_id,user_id) VALUES(1,$1),(1,$2),(6,$2)',[A,B]);
 await db.query('INSERT INTO comment_mentions(comment_id,mentioned_user_id) VALUES(6,$1)',[B]);
 // Install existing notification/RLS migrations to verify coexistence, not replace them.
 for(const file of ['20261009_comment_notifications.sql','20261009_admin_comment_notifications.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../database/migrations',file),'utf8'));
 return db;
}
async function rpc(db,name,args=[]){return (await db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS value`,args)).rows[0].value}
async function as(db,id){await db.exec('SET ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id||''])}
const story=db=>rpc(db,'nca_story_comment_counts',[[1,1,2,3,999]]);
const chapter=db=>rpc(db,'nca_chapter_comment_counts',[1,0,[0,0,1,2]]);
async function snapshot(db){return (await db.query(`SELECT jsonb_build_object(
 'comments',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM comments c),
 'likes',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM comment_likes c),
 'mentions',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM comment_mentions c),
 'notifications',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM notifications c),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p),
 'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY oid) FROM pg_trigger WHERE NOT tgisinternal)
 ) AS value`)).rows[0].value}

test('additive draft preserves rows/policies/triggers; scalar security/grants and transaction',async()=>{
 const db=await setup();try{
 const before=await snapshot(db);await db.exec(draft);assert.deepEqual(await snapshot(db),before);
 const defs=(await db.query(`SELECT p.proname,p.prosecdef,p.provolatile,p.proconfig,p.prorettype::regtype::text AS result,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS member
 FROM pg_proc p WHERE p.proname IN ('nca_story_comment_counts','nca_chapter_comment_counts','nca_profile_comment_count','nca_comment_like_counts','nca_my_comment_likes')`)).rows;
 assert.equal(defs.length,5);for(const d of defs){assert.equal(d.prosecdef,false);assert.equal(d.provolatile,'s');assert.deepEqual(d.proconfig,['search_path=""']);assert.equal(d.member,true);assert.equal(d.anon,d.proname!=='nca_my_comment_likes');assert.equal(d.result,d.proname==='nca_profile_comment_count'?'bigint':'jsonb')}
 assert.equal((await db.query("SELECT count(*)::integer AS n FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.proname IN ('nca_story_comment_counts','nca_chapter_comment_counts','nca_profile_comment_count','nca_comment_like_counts','nca_my_comment_likes') AND a.grantee=0 AND a.privilege_type='EXECUTE'")).rows[0].n,0);
 assert.match(draft,/BEGIN;/);assert.match(draft,/COMMIT;/);assert.doesNotMatch(draft,/CREATE\s+(?:UNIQUE\s+)?INDEX|ALTER\s+TABLE|CREATE\s+TRIGGER|CREATE\s+POLICY|INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM/i);
 }finally{await db.close()}
});
test('counts include all scopes/root/deep replies; zero/unknown/dedup and nullable legacy context',async()=>{
 const db=await setup();try{await db.exec(draft);await db.exec('SET ROLE anon');
 assert.deepEqual(await story(db),[{story_id:1,comment_count:9},{story_id:2,comment_count:1},{story_id:3,comment_count:0}]);
 assert.deepEqual(await chapter(db),{story_id:1,chapter_index:0,chapter_comment_count:2,paragraph_counts:[{paragraph_index:0,comment_count:2},{paragraph_index:1,comment_count:0},{paragraph_index:2,comment_count:1}]});
 assert.equal(await rpc(db,'nca_chapter_comment_counts',[999,0,[]]),null);
 assert.deepEqual((await rpc(db,'nca_chapter_comment_counts',[1,0,[]])).paragraph_counts,[]);
 assert.equal(Number(await rpc(db,'nca_profile_comment_count',[A])),5);assert.equal(Number(await rpc(db,'nca_profile_comment_count',[Z])),0);
 assert.deepEqual(await rpc(db,'nca_comment_like_counts',[[1,1,4,6,999]]),[{comment_id:1,like_count:2},{comment_id:4,like_count:0},{comment_id:6,like_count:1}]);
 }finally{await db.close()}
});
test('empty arrays, NULL/NULL elements/dimensions/oversize reject explicitly before dedup',async()=>{
 const db=await setup();try{await db.exec(draft);await as(db,A);
 for(const [name,limit]of [['nca_story_comment_counts',100],['nca_comment_like_counts',1000],['nca_my_comment_likes',1000]]){
 assert.deepEqual(await rpc(db,name,[[]]),[]);
 for(const arg of [null,[null],[1,null],Array(limit+1).fill(1)])await assert.rejects(rpc(db,name,[arg]),e=>e.code==='22023');
 await assert.rejects(db.query(`SELECT ${name}(ARRAY[[1,2],[3,4]]::bigint[])`),e=>e.code==='22023');
 }
 for(const args of [[null,0,[]],[1,null,[]],[1,-1,[]],[1,0,null],[1,0,[null]],[1,0,[-1]],[1,0,Array(1001).fill(0)]])await assert.rejects(rpc(db,'nca_chapter_comment_counts',args),e=>e.code==='22023');
 await assert.rejects(rpc(db,'nca_profile_comment_count',[null]),e=>e.code==='22023');
 }finally{await db.close()}
});
test('membership only auth.uid, A/B/logout and anonymous privileges; no arbitrary UUID argument',async()=>{
 const db=await setup();try{await db.exec(draft);await db.exec('SET ROLE anon');await assert.rejects(rpc(db,'nca_my_comment_likes',[[1]]),/permission denied/);
 await as(db,A);assert.deepEqual(await rpc(db,'nca_my_comment_likes',[[1,1,6,999]]),[1]);
 await as(db,B);assert.deepEqual(await rpc(db,'nca_my_comment_likes',[[1,6,999]]),[1,6]);
 await as(db,A);assert.deepEqual(await rpc(db,'nca_my_comment_likes',[[1,6]]),[1]);
 await as(db,null);assert.deepEqual(await rpc(db,'nca_my_comment_likes',[[1,6]]),[]);
 await assert.rejects(db.query('SELECT nca_my_comment_likes($1::bigint[],$2::uuid)',[[1],B]),/does not exist/);
 }finally{await db.close()}
});
test('SECURITY INVOKER respects restrictive SELECT policies on comments/stories/likes',async()=>{
 const db=await setup();try{await db.exec(draft);await db.exec(`CREATE POLICY test_comments ON comments AS RESTRICTIVE FOR SELECT USING(story_id=2);
 CREATE POLICY test_stories ON stories AS RESTRICTIVE FOR SELECT USING(id<>3);SET ROLE anon`);
 assert.deepEqual(await story(db),[{story_id:1,comment_count:0},{story_id:2,comment_count:1}]);assert.equal(Number(await rpc(db,'nca_profile_comment_count',[A])),0);
 assert.deepEqual(await rpc(db,'nca_comment_like_counts',[[1,9]]),[{comment_id:9,like_count:0}]);
 await db.exec('RESET ROLE;DROP POLICY test_comments ON comments;CREATE POLICY test_likes ON comment_likes AS RESTRICTIVE FOR SELECT USING(false)');await as(db,A);
 assert.deepEqual(await rpc(db,'nca_comment_like_counts',[[1]]),[{comment_id:1,like_count:0}]);assert.deepEqual(await rpc(db,'nca_my_comment_likes',[[1]]),[]);
 }finally{await db.close()}
});
test('large real history returns bounded scalar, maximum batches remain complete',async()=>{
 const db=await setup();try{await db.exec(`INSERT INTO auth.users(id) SELECT ('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,2500) i;
 INSERT INTO comment_likes(comment_id,user_id) SELECT 4,id FROM auth.users WHERE id::text LIKE '10000000%';
 INSERT INTO comments(id,user_id,content,scope,story_id) SELECT 100+i,'${A}','extra','story',2 FROM generate_series(1,1001) i`);
 await db.exec(draft);await db.exec('SET ROLE anon');assert.deepEqual(await rpc(db,'nca_comment_like_counts',[[4]]),[{comment_id:4,like_count:2500}]);
 assert.equal((await rpc(db,'nca_comment_like_counts',[Array.from({length:1000},(_,i)=>101+i)])).length,1000);
 assert.equal((await rpc(db,'nca_chapter_comment_counts',[1,0,Array.from({length:1000},(_,i)=>i)])).paragraph_counts.length,1000);
 }finally{await db.close()}
});
test('read counts follow real like/unlike/delete cascade without changing existing notifications',async()=>{
 const db=await setup();try{await db.exec(draft);await as(db,A);
 await db.query('INSERT INTO comment_likes(comment_id,user_id) VALUES(6,$1)',[A]);assert.equal((await rpc(db,'nca_comment_like_counts',[[6]]))[0].like_count,2);
 await db.query('DELETE FROM comment_likes WHERE comment_id=6 AND user_id=$1',[A]);assert.equal((await rpc(db,'nca_comment_like_counts',[[6]]))[0].like_count,1);
 await db.exec('DELETE FROM comments WHERE id=1');assert.equal((await rpc(db,'nca_story_comment_counts',[[1]]))[0].comment_count,6);
 assert.deepEqual(await rpc(db,'nca_comment_like_counts',[[1,2,3]]),[]);
 }finally{await db.close()}
});
