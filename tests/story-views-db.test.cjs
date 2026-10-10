const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('view aggregate: RLS, event semantics, repeated migration and concurrent inserts',async()=>{
 const db=new PGlite();
 try{
  // Fixture reproduces inspected production columns/policies used by this RPC.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE TABLE stories(id bigint PRIMARY KEY);
   CREATE TABLE story_views(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,story_id bigint NOT NULL REFERENCES stories(id) ON DELETE CASCADE,user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now());
   ALTER TABLE stories ENABLE ROW LEVEL SECURITY; ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;
   CREATE POLICY story_read ON stories FOR SELECT TO anon,authenticated USING(true);
   CREATE POLICY "Views are viewable" ON story_views FOR SELECT USING(true);
   CREATE POLICY "Record story views" ON story_views FOR INSERT WITH CHECK(user_id IS NULL OR user_id=auth.uid());
   GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
   GRANT SELECT ON stories TO anon,authenticated;
   GRANT SELECT,INSERT,UPDATE,DELETE ON story_views TO anon,authenticated;
   GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon,authenticated;
   INSERT INTO stories VALUES(1),(2),(3);
   INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
   INSERT INTO story_views(story_id) SELECT 1 FROM generate_series(1,10000);`);
  const policies=()=>db.query('SELECT policyname,cmd,qual,with_check FROM pg_policies ORDER BY policyname');
  const before=await policies();
  const sql=fs.readFileSync(path.join(__dirname,'../database/migrations/20261010_story_view_counts.sql'),'utf8');
  await db.exec(sql);await db.exec(sql);
  assert.deepEqual(await policies(),before);
  assert.equal((await db.query('select count(*)::int as n from story_views')).rows[0].n,10000);
  const counts=async ids=>(await db.query('select * from nca_story_view_counts($1::bigint[]) order by story_id',[ids])).rows.map(r=>[Number(r.story_id),Number(r.view_count)]);
  await db.exec('SET ROLE anon');
  assert.deepEqual(await counts([1,1,2,999]),[[1,10000],[2,0]]);
  assert.deepEqual(await counts([]),[]);assert.deepEqual(await counts(null),[]);
  await assert.rejects(counts(Array(101).fill(1)),/at most 100/);
  await Promise.all(Array.from({length:50},()=>db.query('insert into story_views(story_id) values(1)')));
  assert.deepEqual(await counts([1]),[[1,10050]]);
  await assert.rejects(db.query("insert into story_views(story_id,user_id) values(1,'00000000-0000-0000-0000-000000000001')"),/row-level security/);
  await db.exec("SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)");
  await db.exec("insert into story_views(story_id,user_id) values(2,auth.uid()),(2,auth.uid())");
  assert.deepEqual(await counts([2]),[[2,2]]); // Multiple opens remain multiple events.
  await assert.rejects(db.exec("insert into story_views(story_id,user_id) values(2,'00000000-0000-0000-0000-000000000002')"),/row-level security/);
  await db.exec('delete from story_views; update story_views set story_id=3');
  assert.deepEqual(await counts([1,2,3]),[[1,10050],[2,2],[3,0]]);
  await db.exec('RESET ROLE; CREATE POLICY test_restrictive ON story_views AS RESTRICTIVE FOR SELECT USING(story_id=2); SET ROLE anon');
  assert.deepEqual(await counts([1,2]),[[1,0],[2,2]]); // SECURITY INVOKER respects RLS.
 }finally{await db.close();}
});
