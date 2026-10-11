const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {PGlite}=require('@electric-sql/pglite');
const migrationPath=path.join(__dirname,'../database/migrations/20261011_comment_pages_step5cb1_draft.sql');
const sql=fs.readFileSync(migrationPath,'utf8');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const story='nca_story_comment_root_page',context='nca_context_comment_root_page',thread='nca_comment_thread_page',target='nca_comment_target_path';
async function rpc(db,name,args){return(await db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args)).rows[0].result;}
const ids=r=>r.rows.map(x=>x.comment?.id||x.id);
async function viewer(db,id=null,claims={}){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id||'',JSON.stringify(claims)]);await db.exec(id?'SET ROLE authenticated':'SET ROLE anon');}
async function reset(db){await db.exec('RESET ROLE;TRUNCATE comments CASCADE');await db.query("UPDATE profiles SET display_name=CASE WHEN id=$1 THEN 'Reader' ELSE 'Other' END,role='reader'",[A]);await viewer(db);}
async function add(db,id,parent=null,scope='story',st=1,ci=null,pi=null,time='2026-01-01T00:00:00Z',user=A){await db.exec('RESET ROLE');await db.query('INSERT INTO comments(id,user_id,content,scope,story_id,chapter_index,paragraph_index,parent_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[String(id),user,'local synthetic',scope,st,ci,pi,parent===null?null:String(parent),time]);}
async function chain(db,edges,scope='story',ci=null){await db.exec('RESET ROLE');await db.query(`INSERT INTO comments(id,user_id,content,scope,story_id,chapter_index,parent_id,created_at) SELECT i,$1,'local chain',$2,1,$3,CASE WHEN i=1 THEN NULL ELSE i-1 END,'2026-01-01'::timestamptz+i*interval '1 second' FROM generate_series(1,$4::integer) i`,[A,scope,ci,edges+1]);}
async function snapshot(db){return(await db.query(`SELECT jsonb_build_object('rows',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM comments c),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p),'indexes',(SELECT jsonb_agg(indexdef ORDER BY indexname) FROM pg_indexes WHERE schemaname='public'),'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY oid) FROM pg_trigger WHERE NOT tgisinternal)) AS value`)).rows[0].value;}
test('Step 5C-B1 real local PostgreSQL contract',async t=>{
 const db=new PGlite();
 try{
 await db.exec(fs.readFileSync(path.join(__dirname,'helpers/notifications-schema.sql'),'utf8'));
 await db.exec("CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;");
 await db.query('INSERT INTO auth.users VALUES($1),($2)',[A,B]);await db.exec('INSERT INTO stories VALUES(1),(2)');await db.query("INSERT INTO profiles(id,display_name) VALUES($1,'Reader'),($2,'Other')",[A,B]);
 for(const file of ['20261009_comment_notifications.sql','20261009_admin_comment_notifications.sql','20261010_comment_counts_step5b_draft.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../database/migrations',file),'utf8'));
 const before=await snapshot(db);await db.exec(sql);
 await t.test('additive migration leaves rows/RLS/indexes/triggers unchanged',async()=>assert.deepEqual(await snapshot(db),before));
 await t.test('exactly four signatures, STABLE/invoker/empty path, anon/auth grants, no PUBLIC',async()=>{
 const rows=(await db.query(`SELECT proname,prosecdef,provolatile,proconfig,prorettype::regtype::text result,has_function_privilege('anon',oid,'EXECUTE') a,has_function_privilege('authenticated',oid,'EXECUTE') b,pg_get_function_identity_arguments(oid) args FROM pg_proc WHERE proname IN ($1,$2,$3,$4)`,[story,context,thread,target])).rows;
 assert.equal(rows.length,4);for(const r of rows){assert.equal(r.prosecdef,false);assert.equal(r.provolatile,'s');assert.deepEqual(r.proconfig,['search_path=""']);assert.equal(r.result,'jsonb');assert.equal(r.a,true);assert.equal(r.b,true);assert.doesNotMatch(r.args,/viewer_admin|viewer_id/);}
 assert.equal((await db.query(`SELECT count(*)::int n FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.proname IN ($1,$2,$3,$4) AND a.grantee=0`,[story,context,thread,target])).rows[0].n,0);
 assert.doesNotMatch(sql,/CREATE\s+(?:UNIQUE\s+)?INDEX|ALTER\s+TABLE|CREATE\s+(?:TRIGGER|POLICY)|SECURITY\s+DEFINER|auth\.users|INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|p_viewer_admin/i);
 assert.equal((sql.match(/CREATE FUNCTION/g)||[]).length,4);assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);
 });
 await t.test('empty/missing data have zero exact totals, no guessed root',async()=>{await reset(db);let r=await rpc(db,story,[1]);assert.equal(r.root_total,'0');assert.equal(r.page_count,'1');assert.deepEqual(r.rows,[]);assert.equal((await rpc(db,thread,[99])).status,'not_found');assert.equal((await rpc(db,target,[99])).status,'not_found');});
 await t.test('story all scopes/roots only; timestamp ID tie descending',async()=>{await reset(db);await add(db,1);await add(db,2,1);await add(db,3,null,'chapter',1,0);await add(db,4,null,'paragraph',1,0,0);await add(db,5,null,null,1,0,1);await viewer(db);let r=await rpc(db,story,[1]);assert.deepEqual(ids(r),['5','4','3','1']);assert.equal(r.root_total,'4');assert.equal(r.rows.at(-1).descendant_total,'1');});
 await t.test('>1000 one-story roots: page1/arbitrary page/exact boundary/clamp/locator',async()=>{await reset(db);await db.exec('RESET ROLE');await db.query("INSERT INTO comments(id,user_id,content,scope,story_id,created_at) SELECT i,$1,'local','story',1,'2026-01-01' FROM generate_series(1,1021) i",[A]);await viewer(db);let r=await rpc(db,story,[1]);assert.equal(r.root_total,'1021');assert.equal(r.page_count,'52');assert.equal(r.rows.length,20);assert.equal(ids(r)[0],'1021');r=await rpc(db,story,[1,40]);assert.equal(r.actual_page,'40');assert.equal(ids(r)[0],'241');r=await rpc(db,story,[1,'9223372036854775807']);assert.equal(r.actual_page,'52');assert.deepEqual(ids(r),['1']);r=await rpc(db,story,[1,1,1]);assert.equal(r.actual_page,'52');assert.equal(r.target_status,'found');assert.equal((await rpc(db,story,[1,1,99999])).target_status,'not_found');});
 await t.test('numbered membership moves on insert/delete, no snapshot promise',async()=>{await reset(db);await db.exec('RESET ROLE');await db.query("INSERT INTO comments(id,user_id,content,scope,story_id,created_at) SELECT i,$1,'local','story',1,'2026-01-01' FROM generate_series(1,40) i",[A]);await viewer(db);assert.equal((await rpc(db,story,[1])).page_count,'2');await add(db,41);await viewer(db);let r=await rpc(db,story,[1,2]);assert.equal(ids(r)[0],'21');assert.equal(r.page_count,'3');await db.exec('RESET ROLE;DELETE FROM comments WHERE id=41');await viewer(db);r=await rpc(db,story,[1,2]);assert.equal(ids(r)[0],'20');assert.equal(r.page_count,'2');});
 await t.test('chapter loaded paragraph boundary and NULL scope, unrelated scopes excluded',async()=>{await reset(db);await add(db,1,null,'chapter',1,0);await add(db,2,null,'paragraph',1,0,0);await add(db,3,null,null,1,0,1);await add(db,4,null,'paragraph',1,0,2);await add(db,5,null,'story',1);await add(db,6,null,'chapter',1,1);await viewer(db);assert.deepEqual(ids(await rpc(db,context,['chapter',1,0,null,2])),['3','2','1']);assert.deepEqual(ids(await rpc(db,context,['chapter',1,0,null,0])),['1']);assert.deepEqual(ids(await rpc(db,context,['paragraph',1,0,1])),['3']);});
 await t.test('newest typed cursor page and context binding',async()=>{await reset(db);for(let i=1;i<=4;i++)await add(db,i,null,'chapter',1,0);await viewer(db);let r=await rpc(db,context,['chapter',1,0,null,0,'newest',null,2]);assert.deepEqual(ids(r),['4','3']);r=await rpc(db,context,['chapter',1,0,null,0,'newest',r.next_cursor,2]);assert.deepEqual(ids(r),['2','1']);assert.equal(r.has_more,false);await assert.rejects(rpc(db,context,['chapter',1,1,null,0,'newest',r.next_cursor,2]),e=>e.code==='22023');});
 await t.test('invalid inputs/NULL/limits/targets/cursors reject 22023',async()=>{
 for(const args of [[null],[1,0],[1,null],[1,1,-1]])await assert.rejects(rpc(db,story,args),e=>e.code==='22023');
 for(const args of [['bad',1,0],['chapter',1,0],['chapter',1,-1,null,0],['paragraph',1,0,-1],['paragraph',1,0,0,null,'all'],['chapter',1,0,null,0,'newest',null,21],['chapter',1,0,null,0,'newest',{}],['chapter',1,0,null,0,'interaction',{v:1}]])await assert.rejects(rpc(db,context,args),e=>e.code==='22023');
 for(const args of [[null],[1,null,7],[1,{}],[1,null,0],[1,null,6,-1]])await assert.rejects(rpc(db,thread,args),e=>e.code==='22023');await assert.rejects(rpc(db,target,[1,{}]),e=>e.code==='22023');
 });
 async function classification(name,claims,role='reader',expected=false){await reset(db);await add(db,1,null,'chapter',1,0);await db.exec('RESET ROLE');await db.query('UPDATE profiles SET display_name=$1,role=$2 WHERE id=$3',[name,role,A]);await viewer(db,A,claims);let r=await rpc(db,context,['chapter',1,0,null,0,'all']);assert.equal(r.viewer_classification.own_admin,expected);assert.equal(r.rows[0].admin_bucket,expected?1:0);return r;}
 await t.test('reserved current profile canonical independent of role',async()=>classification('Alex',{},'reader',true));
 await t.test('metadata reserved still applies with nonreserved profile',async()=>classification('Reader',{user_metadata:{full_name:'Thảo Trần'}},'reader',true));
 await t.test('truthy nonreserved full_name overrides reserved metadata name',async()=>classification('Reader',{user_metadata:{full_name:'Reader',name:'Alex'}},'reader',false));
 await t.test('empty profile/metadata falls back to email local part',async()=>classification('',{email:'alex@example.invalid'},'reader',true));
 await t.test('role admin alone is NOT reserved presentation',async()=>classification('Reader',{},'admin',false));
 await t.test('whitespace profile is truthy, does not fall back to email',async()=>classification(' ',{email:'alex@example.invalid'},'reader',false));
 await t.test('missing profile uses metadata fallback',async()=>{await reset(db);await add(db,1,null,'chapter',1,0);await db.exec('RESET ROLE');await db.query('DELETE FROM profiles WHERE id=$1',[A]);await viewer(db,A,{user_metadata:{name:'Alex'}});assert.equal((await rpc(db,context,['chapter',1,0,null,0,'all'])).viewer_classification.own_admin,true);await db.exec('RESET ROLE');await db.query("INSERT INTO profiles(id,display_name) VALUES($1,'Reader')",[A]);});
 await t.test('anonymous own branch false, reserved author still classified',async()=>{await reset(db);await add(db,1,null,'chapter',1,0);await db.exec('RESET ROLE');await db.query("UPDATE profiles SET display_name='Thảo Trần' WHERE id=$1",[A]);await viewer(db);let r=await rpc(db,context,['chapter',1,0,null,0,'all']);assert.equal(r.viewer_classification.own_admin,false);assert.equal(r.rows[0].admin_bucket,1);});
 await t.test('NFC/NFD/verified Unicode slug parity plus reserved author ordering',async()=>{const fixtures=['Alex','Álex','A\u0301lex','Thảo Trần','Tha\u0309o Tra\u0302\u0300n','thao-tran','A.lex','Ａlex','\u212Alex','\u0300Alex','Alex\u1ab0x',' Reader ',''];const slug=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');for(const name of fixtures)await classification(name,{},'reader',['alex','thao-tran'].includes(slug(name)));});
 await t.test('malformed presentation metadata rejects instead of guessing',async()=>{await reset(db);await add(db,1,null,'chapter',1,0);for(const claims of [{user_metadata:{full_name:1}},{user_metadata:[]},{email:123}]){await viewer(db,A,claims);await assert.rejects(rpc(db,context,['chapter',1,0,null,0,'all']),e=>e.code==='22023');}});
 await t.test('all ascending tie order, fingerprint change invalidates cursor; A/B epochs input owner isolated',async()=>{await reset(db);for(let i=1;i<=3;i++)await add(db,i,null,'chapter',1,0);await viewer(db,A,{});let r=await rpc(db,context,['chapter',1,0,null,0,'all',null,1]);assert.deepEqual(ids(r),['1']);let cursor=r.next_cursor;await viewer(db,B,{});assert.equal((await rpc(db,context,['chapter',1,0,null,0,'all',cursor,1])).status,'stale_cursor');await viewer(db,A,{user_metadata:{name:'Alex'}});assert.equal((await rpc(db,context,['chapter',1,0,null,0,'all',cursor,1])).status,'stale_cursor');});
 await t.test('one forest interaction: root likes+deep descendants, reply likes excluded',async()=>{await reset(db);await add(db,1,null,'chapter',1,0);await add(db,2,null,'chapter',1,0);await add(db,3,1,'chapter',1,0);await add(db,4,3,'chapter',1,0);await db.exec('RESET ROLE');await db.query('INSERT INTO comment_likes(comment_id,user_id) VALUES(2,$1),(3,$1),(3,$2)',[A,B]);await viewer(db);let r=await rpc(db,context,['chapter',1,0,null,0,'interaction']);assert.deepEqual(ids(r),['1','2']);assert.equal(r.rows[0].score,'2');assert.equal(r.rows[1].score,'1');assert.equal(r.rows[0].root_like_count,'0');assert.match(sql,/forest\(root_id,id,path,depth,root_context,context_ok,is_cycle\)/);assert.doesNotMatch(sql,/baseline/);});
 await t.test('interaction deterministic ties and live movement/target locator',async()=>{await reset(db);await add(db,1,null,'chapter',1,0);await add(db,2,null,'chapter',1,0);await viewer(db);let r=await rpc(db,context,['chapter',1,0,null,0,'interaction',null,1]);assert.deepEqual(ids(r),['2']);await add(db,3,1,'chapter',1,0);await viewer(db);assert.deepEqual(ids(await rpc(db,context,['chapter',1,0,null,0,'interaction',null,1])),['1']);r=await rpc(db,context,['chapter',1,0,null,0,'interaction',null,1,2]);assert.deepEqual(ids(r),['2']);assert.equal(r.has_before,true);});
 await t.test('malformed eligible context fails entire ranking, no partial totals',async()=>{await reset(db);await add(db,1,null,'chapter',1,0);await add(db,2,1,'chapter',1,1);await add(db,3,null,'chapter',1,0);await viewer(db);let r=await rpc(db,context,['chapter',1,0,null,0,'interaction']);assert.equal(r.status,'malformed_thread');assert.deepEqual(r.rows,[]);assert.equal(r.root_total,null);assert.equal(r.next_cursor,null);});
 await t.test('thread no replies, nonroot invalid, nested flattened ascending tie IDs',async()=>{await reset(db);await add(db,1);await viewer(db);let r=await rpc(db,thread,[1]);assert.equal(r.descendant_total,'0');for(let i=2;i<=9;i++)await add(db,i,i===2?1:i-1);await viewer(db);r=await rpc(db,thread,[1]);assert.equal(r.descendant_total,'8');assert.deepEqual(ids(r),['2','3','4','5','6','7']);assert.equal((await rpc(db,thread,[2])).status,'invalid_root');r=await rpc(db,thread,[1,r.next_cursor]);assert.deepEqual(ids(r),['8','9']);assert.equal(r.has_more,false);});
 await t.test('thread target outside first page ascending window and has_before',async()=>{await viewer(db);let r=await rpc(db,thread,[1,null,6,8]);assert.deepEqual(ids(r),['8','9']);assert.equal(r.has_before,true);assert.equal((await rpc(db,thread,[1,null,6,999])).status,'target_not_found');});
 await t.test('exact depth1024 complete leaf, edge1025 incomplete no partial totals',async()=>{await reset(db);await chain(db,1024);await viewer(db);let r=await rpc(db,thread,[1]);assert.equal(r.status,'ok');assert.equal(r.descendant_total,'1024');await add(db,1026,1025);await viewer(db);r=await rpc(db,thread,[1]);assert.equal(r.status,'incomplete');assert.equal(r.reason,'resource_budget');assert.equal(r.descendant_total,null);assert.deepEqual(r.rows,[]);assert.equal(r.next_cursor,null);});
 await t.test('incomplete forest fails whole interaction ranking',async()=>{await reset(db);await chain(db,1025,'chapter',0);await viewer(db);let r=await rpc(db,context,['chapter',1,0,null,0,'interaction']);assert.equal(r.status,'incomplete');assert.equal(r.root_total,null);assert.deepEqual(r.rows,[]);});
 await t.test('thread context mismatch fails; RLS invisible root indistinguishable from missing',async()=>{await reset(db);await add(db,1);await add(db,2,1,'chapter',1,0);await viewer(db);assert.equal((await rpc(db,thread,[1])).status,'malformed_thread');await db.exec('RESET ROLE;CREATE POLICY local_hide ON comments AS RESTRICTIVE FOR SELECT USING (id<>1)');await viewer(db);assert.equal((await rpc(db,thread,[1])).status,'not_found');assert.equal((await rpc(db,target,[2])).status,'ancestor_unavailable');await db.exec('RESET ROLE;DROP POLICY local_hide ON comments');});
 await t.test('target root and child resolve without guessed ancestry',async()=>{await reset(db);await add(db,1);await add(db,2,1);await viewer(db);let r=await rpc(db,target,[1]);assert.equal(r.status,'resolved');assert.deepEqual(ids(r),['1']);r=await rpc(db,target,[2]);assert.equal(r.root.id,'1');assert.deepEqual(ids(r),['2','1']);});
 await t.test('>64 target ancestors: bounded chunk continuation and exact parent edges',async()=>{await reset(db);await chain(db,130);await viewer(db);let r=await rpc(db,target,[131]);assert.equal(r.status,'more');assert.equal(r.rows.length,65);assert.equal(r.continuation.last_id,'67');let all=r.rows;let s=await rpc(db,target,[131,r.continuation]);assert.equal(s.status,'more');assert.equal(s.rows.length,64);all=all.concat(s.rows);s=await rpc(db,target,[131,s.continuation]);assert.equal(s.status,'resolved');all=all.concat(s.rows);assert.equal(s.root.id,'1');assert.equal(all.length,131);assert.equal(new Set(ids({rows:all})).size,131);for(let i=0;i<all.length-1;i++)assert.equal(all[i].parent_id,all[i+1].id);});
 await t.test('continuation binding/types/version and reparented boundary fail',async()=>{await viewer(db);let r=await rpc(db,target,[131]);for(const bad of [{...r.continuation,v:2},{...r.continuation,target_id:'130'},{...r.continuation,next_id:66}])await assert.rejects(rpc(db,target,[131,bad]),e=>e.code==='22023');await db.exec('RESET ROLE;UPDATE comments SET parent_id=1 WHERE id=67');await viewer(db);assert.equal((await rpc(db,target,[131,r.continuation])).status,'stale_path');});
 await t.test('earlier reparent requires final bounded client edge revalidation, token alone not proof',async()=>{await reset(db);await chain(db,130);await viewer(db);let r=await rpc(db,target,[131]);await db.exec('RESET ROLE;UPDATE comments SET parent_id=1 WHERE id=120');await viewer(db);let s=await rpc(db,target,[131,r.continuation]);assert.notEqual(s.status,'stale_path');let actual=(await db.query('SELECT id::text,parent_id::text FROM comments WHERE id=ANY($1::bigint[])',[r.rows.map(x=>x.id)])).rows;assert.ok(actual.some(x=>r.rows.find(old=>old.id===x.id).parent_id!==x.parent_id));});
 await t.test('target content edit remains valid; deleted target not_found',async()=>{await reset(db);await chain(db,70);await viewer(db);let r=await rpc(db,target,[71]);await db.exec("RESET ROLE;UPDATE comments SET content='edited' WHERE id=71");await viewer(db);assert.equal((await rpc(db,target,[71,r.continuation])).status,'resolved');await db.exec('RESET ROLE;DELETE FROM comments WHERE id=71');await viewer(db);assert.equal((await rpc(db,target,[71,r.continuation])).status,'not_found');});
 await t.test('path cycle deterministic, no exact resolved root',async()=>{await reset(db);await add(db,1);await add(db,2,1);await db.exec('RESET ROLE;UPDATE comments SET parent_id=2 WHERE id=1');await viewer(db);let r=await rpc(db,target,[2]);assert.equal(r.status,'cycle');assert.equal(r.root,null);});
 await t.test('path context mismatch fails closed',async()=>{await reset(db);await add(db,1);await add(db,2,1,'chapter',1,0);await viewer(db);assert.equal((await rpc(db,target,[2])).status,'context_mismatch');});
 await t.test('bigint IDs/story/page/cursor >2^53 remain decimal strings',async()=>{await reset(db);await db.exec('RESET ROLE;INSERT INTO stories VALUES(9007199254740993) ON CONFLICT DO NOTHING');await add(db,'9007199254740993',null,'chapter','9007199254740993',0);await add(db,'9007199254740994','9007199254740993','chapter','9007199254740993',0);await viewer(db);let r=await rpc(db,story,['9007199254740993','9007199254740993']);assert.equal(r.requested_page,'9007199254740993');assert.equal(r.story_id,'9007199254740993');assert.equal(r.rows[0].comment.id,'9007199254740993');assert.equal(r.rows[0].descendant_total,'1');r=await rpc(db,context,['chapter','9007199254740993',0,null,0]);assert.equal(r.next_cursor.id,'9007199254740993');assert.equal(typeof r.rows[0].score,'string');r=await rpc(db,target,['9007199254740994']);assert.equal(r.rows[0].parent_id,'9007199254740993');assert.equal(r.root.id,'9007199254740993');});
 await t.test('invoker RLS likes/author/profile and comment visibility respected',async()=>{await reset(db);await add(db,1,null,'chapter',1,0);await add(db,2,null,'chapter',1,0);await db.exec('RESET ROLE');await db.query('INSERT INTO comment_likes(comment_id,user_id) VALUES(1,$1)',[A]);await db.exec('CREATE POLICY local_hide_likes ON comment_likes AS RESTRICTIVE FOR SELECT USING(false)');await viewer(db);let r=await rpc(db,context,['chapter',1,0,null,0,'interaction']);assert.equal(r.rows.find(x=>x.comment.id==='1').root_like_count,'0');await db.exec('RESET ROLE;DROP POLICY local_hide_likes ON comment_likes;CREATE POLICY local_hide_comments ON comments AS RESTRICTIVE FOR SELECT USING(id=2)');await viewer(db);assert.deepEqual(ids(await rpc(db,story,[1])),['2']);await db.exec('RESET ROLE;DROP POLICY local_hide_comments ON comments');});
 await t.test('read RPCs create zero data writes, failure retries remain usable',async()=>{await db.exec('RESET ROLE');const before=await snapshot(db);await viewer(db);await rpc(db,story,[1]);await rpc(db,context,['chapter',1,0,null,0]);await rpc(db,thread,[2]);await rpc(db,target,[2]);await assert.rejects(rpc(db,context,['chapter',1,0,null,0,'newest',{}]));assert.equal((await rpc(db,context,['chapter',1,0,null,0])).status,'ok');await db.exec('RESET ROLE');assert.deepEqual(await snapshot(db),before);});

 await t.test('exact20 root boundary and current-response page clamp after deletion',async()=>{await reset(db);await db.exec('RESET ROLE');await db.query("INSERT INTO comments(id,user_id,content,scope,story_id,created_at) SELECT i,$1,'local','story',1,'2026-01-01' FROM generate_series(1,20) i",[A]);await viewer(db);let r=await rpc(db,story,[1,2]);assert.equal(r.page_count,'1');assert.equal(r.actual_page,'1');assert.equal(r.rows.length,20);assert.equal(r.has_more,false);});
 await t.test('all admin bucket then ascending time/id; valid all cursor continues',async()=>{await reset(db);await add(db,1,null,'chapter',1,0,null,'2026-01-01',A);await add(db,2,null,'chapter',1,0,null,'2026-01-01',B);await add(db,3,null,'chapter',1,0,null,'2026-01-01',B);await db.exec('RESET ROLE');await db.query("UPDATE profiles SET display_name='Alex' WHERE id=$1",[B]);await viewer(db);let r=await rpc(db,context,['chapter',1,0,null,0,'all',null,1]);assert.deepEqual(ids(r),['2']);r=await rpc(db,context,['chapter',1,0,null,0,'all',r.next_cursor,1]);assert.deepEqual(ids(r),['3']);r=await rpc(db,context,['chapter',1,0,null,0,'all',r.next_cursor,1]);assert.deepEqual(ids(r),['1']);});
 await t.test('interaction cursor descending score/time/id and typed field rejection',async()=>{await reset(db);for(let i=1;i<=3;i++)await add(db,i,null,'chapter',1,0);await viewer(db);let r=await rpc(db,context,['chapter',1,0,null,0,'interaction',null,1]);assert.deepEqual(ids(r),['3']);const cursor=r.next_cursor;assert.deepEqual(ids(await rpc(db,context,['chapter',1,0,null,0,'interaction',cursor,1])),['2']);for(const bad of [{...cursor,score:null},{...cursor,score:0},{...cursor,score:'9223372036854775808'},{...cursor,created_at:'Infinity'},{...cursor,id:'9223372036854775808'}])await assert.rejects(rpc(db,context,['chapter',1,0,null,0,'interaction',bad,1]),e=>e.code==='22023');});
 await t.test('NULL admin fingerprint cannot masquerade as valid typed cursor',async()=>{await viewer(db);const r=await rpc(db,context,['chapter',1,0,null,0,'all',null,1]);await assert.rejects(rpc(db,context,['chapter',1,0,null,0,'all',{...r.next_cursor,viewer_fingerprint:null},1]),e=>e.code==='22023');});
 await t.test('thread cursor cannot cross root, target cannot be supplied with cursor',async()=>{await reset(db);await add(db,1);await add(db,2,1);await add(db,3);await viewer(db);let r=await rpc(db,thread,[1]);await assert.rejects(rpc(db,thread,[3,r.next_cursor]),e=>e.code==='22023');await assert.rejects(rpc(db,thread,[1,r.next_cursor,6,2]),e=>e.code==='22023');});
 await t.test('RLS-hidden continuation boundary safely stale, no inaccessible detail',async()=>{await reset(db);await chain(db,70);await viewer(db);let r=await rpc(db,target,[71]);await db.exec('RESET ROLE;CREATE POLICY local_boundary ON comments AS RESTRICTIVE FOR SELECT USING(id<>7)');await viewer(db);assert.equal((await rpc(db,target,[71,r.continuation])).status,'stale_path');await db.exec('RESET ROLE;DROP POLICY local_boundary ON comments');});
 await t.test('cross-chunk cycle detected by accumulated client IDs without root guessing',async()=>{await reset(db);await chain(db,130);await db.exec('RESET ROLE;UPDATE comments SET parent_id=100 WHERE id=1');await viewer(db);let r=await rpc(db,target,[131]),seen=new Set(ids(r));assert.equal(r.status,'more');let next=await rpc(db,target,[131,r.continuation]);assert.equal(next.status,'more');for(const id of ids(next))seen.add(id);next=await rpc(db,target,[131,next.continuation]);assert.ok(ids(next).some(id=>seen.has(id)));assert.notEqual(next.status,'resolved');assert.equal(next.root,null);});
 await t.test('bigint aggregate/score encoding expressions exact >2^53 (expression test, not fake rows)',async()=>{const r=(await db.query("SELECT jsonb_build_object('root_total',9007199254740993::bigint::text,'descendant_total',9007199254740994::bigint::text,'root_like_count',9007199254740995::bigint::text,'score',(9007199254740994::bigint+9007199254740995::bigint)::text) value")).rows[0].value;assert.equal(r.score,'18014398509481989');for(const val of Object.values(r))assert.equal(typeof val,'string');assert.match(sql,/'root_like_count',r\.real_likes::text,'score',r\.score::text/);});

 await t.test('frozen inline slug map matches all1,112,064 Unicode scalar fragments (static Node24 parity)',()=>{const match=sql.match(/slug_map jsonb:='([^']*)'::jsonb/);assert.ok(match);const map=JSON.parse(match[1]);assert.equal(Object.keys(map).length,666);for(let cp=0;cp<=0x10ffff;cp++){if(cp>=0xd800&&cp<=0xdfff)continue;const expected=String.fromCodePoint(cp).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-');assert.equal(map[cp]??'-',expected,'codepoint '+cp);}});
 await t.test('database permission failure propagates, not empty-success; subsequent retry usable',async()=>{await db.exec('RESET ROLE;REVOKE SELECT ON comments FROM anon');await viewer(db);await assert.rejects(rpc(db,story,[1]),e=>e.code==='42501');await db.exec('RESET ROLE;GRANT SELECT ON comments TO anon');await viewer(db);assert.equal((await rpc(db,story,[1])).status,'ok');});
 // Validation errors must not depend on resource existence or RLS visibility.
 const validThreadCursor=root=>({v:1,root_id:String(root),id:'2',created_at:'2026-01-01T00:00:00+00:00'});
 const validPathToken=id=>({v:1,target_id:String(id),last_id:'2',next_id:'1',effective_context:['story','1']});
 for(const [label,root] of [['missing',999],['visible nonroot',2],['valid root',1]]){
  await t.test(`validation before lookup: malformed thread cursor + ${label} =>22023`,async()=>{
   await reset(db);await add(db,1);await add(db,2,1);await viewer(db);
   for(const bad of [{},[],{...validThreadCursor(root),v:2},{...validThreadCursor(root),root_id:'998'},
    {...validThreadCursor(root),id:2},{...validThreadCursor(root),id:null},
    {...validThreadCursor(root),id:'9223372036854775808'},
    {...validThreadCursor(root),created_at:2},{...validThreadCursor(root),created_at:'Infinity'}]){
    await assert.rejects(rpc(db,thread,[root,bad]),e=>e.code==='22023');
   }
  });
 }
 await t.test('validation before lookup: malformed thread cursor + RLS-hidden root =>22023; valid =>not_found',async()=>{
  await reset(db);await add(db,1);await add(db,2,1);
  await db.exec('RESET ROLE;CREATE POLICY local_validation_hidden ON comments AS RESTRICTIVE FOR SELECT USING(id<>1)');
  try{await viewer(db);await assert.rejects(rpc(db,thread,[1,{}]),e=>e.code==='22023');
   assert.equal((await rpc(db,thread,[1,validThreadCursor(1)])).status,'not_found');
  }finally{await db.exec('RESET ROLE;DROP POLICY local_validation_hidden ON comments');}
 });
 await t.test('structurally valid thread cursor + missing/nonroot retains semantic status',async()=>{
  await reset(db);await add(db,1);await add(db,2,1);await viewer(db);
  assert.equal((await rpc(db,thread,[999,validThreadCursor(999)])).status,'not_found');
  assert.equal((await rpc(db,thread,[2,validThreadCursor(2)])).status,'invalid_root');
 });
 await t.test('valid root + emitted cursor retains successful ASC paging',async()=>{
  await reset(db);for(let i=1;i<=9;i++)await add(db,i,i===1?null:i-1);await viewer(db);
  const first=await rpc(db,thread,[1]);const next=await rpc(db,thread,[1,first.next_cursor]);
  assert.deepEqual(ids(next),['8','9']);assert.equal(next.descendant_total,'8');assert.equal(next.status,'ok');
 });
 for(const [label,id] of [['missing',999],['existing',2]]){
  await t.test(`validation before lookup: malformed path token + ${label} target =>22023`,async()=>{
   await reset(db);await add(db,1);await add(db,2,1);await viewer(db);
   for(const bad of [{},[],{...validPathToken(id),v:2},{...validPathToken(id),target_id:'998'},
    {...validPathToken(id),target_id:id},{...validPathToken(id),last_id:2},
    {...validPathToken(id),next_id:'0'},{...validPathToken(id),last_id:'9223372036854775808'},
    {...validPathToken(id),next_id:'9223372036854775808'}]){
    await assert.rejects(rpc(db,target,[id,bad]),e=>e.code==='22023');
   }
  });
 }
 await t.test('validation before lookup: malformed path token + RLS-hidden target =>22023; valid =>not_found',async()=>{
  await reset(db);await add(db,1);await add(db,2,1);
  await db.exec('RESET ROLE;CREATE POLICY local_validation_hidden ON comments AS RESTRICTIVE FOR SELECT USING(id<>2)');
  try{await viewer(db);await assert.rejects(rpc(db,target,[2,{}]),e=>e.code==='22023');
   assert.equal((await rpc(db,target,[2,validPathToken(2)])).status,'not_found');
  }finally{await db.exec('RESET ROLE;DROP POLICY local_validation_hidden ON comments');}
 });
 await t.test('structurally valid path token + missing target =>not_found',async()=>{
  await viewer(db);assert.equal((await rpc(db,target,[999,validPathToken(999)])).status,'not_found');
 });
 const malformedContexts=[
  ['number',42],['string','story'],['object',{}],['JSON null',null],['empty array',[]],
  ['wrong discriminator',['unknown','1']],['null discriminator',[null,'1']],
  ['story too short',['story']],['story too long',['story','1',0]],
  ['chapter too short',['chapter','1']],['chapter too long',['chapter','1',0,0]],
  ['paragraph too short',['paragraph','1',0]],['paragraph too long',['paragraph','1',0,0,0]],
  ['numeric story ID',['story',1]],['empty story ID',['story','']],['zero story ID',['story','0']],
  ['negative story ID',['story','-1']],['plus story ID',['story','+1']],['leading-zero story ID',['story','01']],
  ['fractional story ID',['story','1.5']],['exponent story ID',['story','1e2']],
  ['bigint overflow',['story','9223372036854775808']],['null story ID',['story',null]],
  ['whitespace story ID',['story',' 1']],
  ['string chapter index',['chapter','1','0']],['negative chapter index',['chapter','1',-1]],
  ['fractional chapter index',['chapter','1',0.5]],['int4 overflow chapter index',['chapter','1',2147483648]],
  ['null chapter index',['chapter','1',null]],['boolean chapter index',['chapter','1',true]],
  ['paragraph string chapter index',['paragraph','1','0',0]],
  ['paragraph invalid chapter index',['paragraph','1',-1,0]],
  ['string paragraph index',['paragraph','1',0,'0']],['negative paragraph index',['paragraph','1',0,-1]],
  ['fractional paragraph index',['paragraph','1',0,0.5]],['int4 overflow paragraph index',['paragraph','1',0,2147483648]],
  ['null paragraph index',['paragraph','1',0,null]],['boolean paragraph index',['paragraph','1',0,true]]
 ];
 // Every malformed context runs both before a missing-target return and with an existing target.
 for(const [label,effective_context] of malformedContexts){
  await t.test(`strict effective_context ${label} =>22023 independent of existence`,async()=>{
   await reset(db);await add(db,1);await add(db,2,1);await viewer(db);
   for(const id of [999,2])await assert.rejects(rpc(db,target,[id,{...validPathToken(id),effective_context}]),e=>e.code==='22023');
  });
 }
 await t.test('valid old context/bigint maximum/int4 maximum are semantic stale, not22023',async()=>{
  await reset(db);await add(db,1);await add(db,2,1);await viewer(db);
  for(const effective_context of [['story','2'],['story','9223372036854775807'],
   ['chapter','1',2147483647],['paragraph','1',0,2147483647]]){
   assert.equal((await rpc(db,target,[2,{...validPathToken(2),effective_context}])).status,'stale_path');
  }
 });
 for(const [label,scope,ci,pi] of [['story','story',null,null],['chapter','chapter',0,null],['paragraph','paragraph',0,0]]){
  await t.test(`strict effective_context valid ${label} continuation succeeds`,async()=>{
   await reset(db);await add(db,1,null,scope,1,ci,pi);await add(db,2,1,scope,1,ci,pi);await viewer(db);
   const effective_context=scope==='story'?['story','1']:scope==='chapter'?['chapter','1',0]:['paragraph','1',0,0];
   const r=await rpc(db,target,[2,{...validPathToken(2),effective_context}]);
   assert.equal(r.status,'resolved');assert.equal(r.root.id,'1');assert.deepEqual(r.effective_context,effective_context);
  });
 }
 await t.test('int4 numeric integral representations accepted, never fractional rounding',async()=>{
  await reset(db);await add(db,1,null,'paragraph',1,0,0);await add(db,2,1,'paragraph',1,0,0);await viewer(db);
  // Preserve raw JSON numeric spellings 0.0 and 0e0 through PostgreSQL jsonb.
  const token='{"v":1,"target_id":"2","last_id":"2","next_id":"1","effective_context":["paragraph","1",0.0,0e0]}';
  const r=(await db.query('SELECT nca_comment_target_path(2,$1::jsonb) AS value',[token])).rows[0].value;
  assert.equal(r.status,'resolved');
 });
 await t.test('target_not_found preserves exact total only after complete valid traversal',async()=>{
  await reset(db);await add(db,1);await add(db,2,1);await add(db,3,2);await viewer(db);
  const r=await rpc(db,thread,[1,null,6,999]);
  assert.equal(r.status,'target_not_found');assert.equal(r.descendant_total,'2');
  assert.deepEqual(r.rows,[]);assert.equal(r.before_cursor,null);assert.equal(r.next_cursor,null);
 });
 await t.test('malformed/incomplete traversal with target still has no exact total/rows/cursors',async()=>{
  await reset(db);await add(db,1);await add(db,2,1,'chapter',1,0);await viewer(db);
  let r=await rpc(db,thread,[1,null,6,999]);assert.equal(r.status,'malformed_thread');
  for(const value of [r]){assert.equal(value.descendant_total,null);assert.deepEqual(value.rows,[]);assert.equal(value.before_cursor,null);assert.equal(value.next_cursor,null);}
  await reset(db);await chain(db,1025);await viewer(db);r=await rpc(db,thread,[1,null,6,999]);
  assert.equal(r.status,'incomplete');assert.equal(r.reason,'resource_budget');assert.equal(r.descendant_total,null);
  assert.deepEqual(r.rows,[]);assert.equal(r.before_cursor,null);assert.equal(r.next_cursor,null);
 });

 // Every server-emitted timestamp cursor must round-trip, including PostgreSQL infinities.
 const nonfiniteTimes=['-infinity','-infinity','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','infinity','infinity'];
 async function timestampFixture(mode){
  await reset(db);
  if(mode==='thread'){
   await add(db,100);
   for(let i=0;i<6;i++)await add(db,i+1,100,'story',1,null,null,nonfiniteTimes[i]);
  }else{
   const size=mode==='all'?12:6;
   for(let i=0;i<size;i++)await add(db,i+1,null,'chapter',1,0,null,nonfiniteTimes[i%6],i<6?A:B);
   if(mode==='all'){
    await db.exec('RESET ROLE');await db.query("UPDATE profiles SET display_name='Alex' WHERE id=$1",[A]);
   }
   if(mode==='interaction'){
    await db.exec('RESET ROLE');
    for(const [id,owners] of [[1,[A,B]],[3,[A,B]],[4,[A]],[5,[A]],[6,[A]]])
     for(const owner of owners)await db.query('INSERT INTO comment_likes(comment_id,user_id) VALUES($1,$2)',[id,owner]);
   }
  }
  await viewer(db,mode==='all'?A:null);
 }
 const timestampExpected={newest:['6','5','4','3','2','1'],all:Array.from({length:12},(_,i)=>String(i+1)),interaction:['3','1','6','5','4','2'],thread:['1','2','3','4','5','6']};
 async function timestampPage(mode,cursor=null,limit=1){
  return mode==='thread'?rpc(db,thread,[100,cursor,limit]):rpc(db,context,['chapter',1,0,null,0,mode,cursor,limit]);
 }
 // Deterministic property fixtures vary page sizes, so timestamps cross page edges and ID ties.
 for(const mode of ['newest','all','interaction','thread'])for(const limit of [1,2,3,6]){
  await t.test(`nonfinite self-round-trip property ${mode} page size ${limit}`,async()=>{
   await timestampFixture(mode);let cursor=null,seen=[],iterations=0;
   do{
    const r=await timestampPage(mode,cursor,limit);assert.equal(r.status,'ok');
    assert.equal(mode==='thread'?r.descendant_total:r.root_total,String(timestampExpected[mode].length));
    assert.ok(r.rows.length<=limit);seen.push(...ids(r));
    for(const token of [r.before_cursor,r.next_cursor].filter(Boolean)){
     assert.equal(typeof token.created_at,'string');
     // before_cursor is also a valid forward keyset boundary, not a backward-page promise.
     assert.equal((await timestampPage(mode,token,limit)).status,'ok');
    }
    if(!r.has_more)break;
    assert.ok(r.next_cursor);cursor=r.next_cursor;
    assert.ok(++iterations<20,'bounded fixture must finish');
   }while(true);
   assert.deepEqual(seen,timestampExpected[mode]);assert.equal(new Set(seen).size,seen.length);
  });
 }
 for(const [mode,expectedToken] of [['newest','infinity'],['all','-infinity'],['interaction','2026-01-01T00:00:00+00:00'],['thread','-infinity']]){
  await t.test(`nonfinite canonical first boundary and primary ordering ${mode}`,async()=>{
   await timestampFixture(mode);const r=await timestampPage(mode,null,1);
   assert.equal(r.next_cursor.created_at,expectedToken);
   assert.equal(r.before_cursor.created_at,expectedToken);
   assert.deepEqual(ids(r),timestampExpected[mode].slice(0,1));
   assert.deepEqual(ids(await timestampPage(mode,r.next_cursor,1)),timestampExpected[mode].slice(1,2));
   if(mode==='all'){assert.equal(r.rows[0].admin_bucket,1);assert.equal(r.viewer_classification.own_admin,true);}
   if(mode==='interaction')assert.equal(r.rows[0].score,'2');
  });
 }
 await t.test('all: infinity inside admin bucket transitions to lower bucket negative infinity',async()=>{
  await timestampFixture('all');const r=await timestampPage('all',null,6);
  assert.equal(r.next_cursor.created_at,'infinity');assert.equal(r.next_cursor.admin_bucket,1);
  const next=await timestampPage('all',r.next_cursor,6);
  assert.deepEqual(ids(next),['7','8','9','10','11','12']);assert.equal(next.rows[0].admin_bucket,0);
  assert.equal(next.before_cursor.created_at,'-infinity');
 });
 await t.test('interaction: score dominates infinity; equal-score timestamp/id continuation',async()=>{
  await timestampFixture('interaction');const high=await timestampPage('interaction',null,2);
  assert.deepEqual(ids(high),['3','1']);assert.equal(high.next_cursor.created_at,'-infinity');
  const mid=await timestampPage('interaction',high.next_cursor,1);
  assert.deepEqual(ids(mid),['6']);assert.equal(mid.next_cursor.created_at,'infinity');assert.equal(mid.next_cursor.score,'1');
  assert.deepEqual(ids(await timestampPage('interaction',mid.next_cursor,2)),['5','4']);
 });
 for(const targetId of [1,5])await t.test(`thread nonfinite target window ${targetId} cursor round-trips`,async()=>{
  await timestampFixture('thread');const r=await rpc(db,thread,[100,null,1,targetId]);
  assert.equal(r.status,'ok');assert.deepEqual(ids(r),[String(targetId)]);
  assert.equal(r.next_cursor.created_at,targetId===1?'-infinity':'infinity');
  assert.equal(r.has_more,true);
  assert.deepEqual(ids(await rpc(db,thread,[100,r.next_cursor,1])),[String(targetId+1)]);
  assert.equal((await rpc(db,thread,[100,r.before_cursor,1])).status,'ok');
 });
 const invalidTimestampValues=[['uppercase','Infinity'],['plus','+infinity'],['short','inf'],['negative short','-inf'],['NaN','NaN'],['empty',''],['garbage','not-a-timestamp'],['numeric',42],['JSON null',null],['uppercase negative','-Infinity'],['leading space',' infinity'],['trailing space','-infinity ']];
 for(const mode of ['newest','all','interaction','thread'])for(const [label,value] of invalidTimestampValues){
  await t.test(`nonfinite canonical validation ${mode}: ${label} =>22023`,async()=>{
   await timestampFixture(mode);const first=await timestampPage(mode,null,1);
   await assert.rejects(timestampPage(mode,{...first.next_cursor,created_at:value},1),e=>e.code==='22023');
  });
 }
 await t.test('canonical nonfinite cursor retains stale classification/context validation order',async()=>{
  await timestampFixture('all');const first=await timestampPage('all',null,1);
  assert.equal(first.next_cursor.created_at,'-infinity');
  await viewer(db); // Different canonical viewer fingerprint: valid timestamp, stale classification.
  assert.equal((await timestampPage('all',first.next_cursor,1)).status,'stale_cursor');
  await assert.rejects(rpc(db,context,['chapter',1,1,null,0,'all',first.next_cursor,1]),e=>e.code==='22023');
  await assert.rejects(timestampPage('all',{...first.next_cursor,created_at:'Infinity'},1),e=>e.code==='22023');
 });

 console.log('migration SHA256',crypto.createHash('sha256').update(sql).digest('hex'));
 }finally{await db.close();}
});
