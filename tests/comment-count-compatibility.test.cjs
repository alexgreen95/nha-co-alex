const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {PGlite}=require('@electric-sql/pglite');
const {startBrowser,stopBrowser,feedPage}=require('./helpers/public-feed-browser.cjs');
before(startBrowser);after(stopBrowser);
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
// Local SQL results are compared with the wired browser's mocked RPC contract.
test('SQL scalar contracts match existing story/profile counts, paragraph markers and comment heart UI',async()=>{
 const db=new PGlite();let page;
 try{
 await db.exec(fs.readFileSync(path.join(__dirname,'helpers/notifications-schema.sql'),'utf8'));
 await db.query('INSERT INTO auth.users VALUES($1),($2)',[A,B]);await db.exec('INSERT INTO stories VALUES(1)');
 const rows=[
 {id:1,user_id:A,scope:'story',parent_id:null},{id:2,user_id:B,scope:'story',parent_id:1},
 {id:3,user_id:A,scope:'story',parent_id:2},{id:4,user_id:B,scope:'chapter',parent_id:null},
 {id:5,user_id:A,scope:'paragraph',parent_id:null,paragraph_index:0},{id:6,user_id:B,scope:'paragraph',parent_id:5,paragraph_index:0},
 {id:7,user_id:A,scope:'paragraph',parent_id:null,paragraph_index:1}
 ].map(r=>({...r,story_id:1,chapter_index:r.scope==='story'?null:0,paragraph_index:r.paragraph_index??null,content:'Comment '+r.id,created_at:'2026-10-10T00:00:00Z'}));
 for(const r of rows)await db.query('INSERT INTO comments(id,user_id,scope,parent_id,story_id,chapter_index,paragraph_index,content,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[r.id,r.user_id,r.scope,r.parent_id,r.story_id,r.chapter_index,r.paragraph_index,r.content,r.created_at]);
 await db.query('INSERT INTO comment_likes(comment_id,user_id) VALUES(1,$1),(1,$2),(5,$2)',[A,B]);
 await db.exec(fs.readFileSync(path.join(__dirname,'../database/migrations/20261010_comment_counts_step5b_draft.sql'),'utf8'));
 const call=async(name,args)=>(await db.query(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS v`,args)).rows[0].v;
 await db.exec('SET ROLE anon');const counts=await call('nca_story_comment_counts',[[1]]),markers=await call('nca_chapter_comment_counts',[1,0,[0,1]]),likes=await call('nca_comment_like_counts',[rows.map(r=>r.id)]),profileCount=Number(await call('nca_profile_comment_count',[A]));
 page=await feedPage(0,{fixtures:{comments:rows,comment_likes:[{comment_id:1,user_id:A},{comment_id:1,user_id:B},{comment_id:5,user_id:B}],profiles:[{id:A,display_name:'Reader A',role:'reader'},{id:B,display_name:'Reader B',role:'reader'}],stories:[{id:1,title:'Test',author:'Writer',published:true,baseline_views:10000,baseline_likes:1000}],chapters:[{id:11,story_id:1,chapter_number:1,published:true,title:'Chapter'}]}});
 await page.evaluate(A=>refreshProfileCommentCount(A),A);
 const compare=await page.evaluate(({counts,markers,profileCount,A})=>{
 const story=stories[0];return {storyCount:storyCommentCount(story),sqlStory:counts[0].comment_count,
 general:commentList('chapter_1_0').length,sqlGeneral:markers.chapter_comment_count,
 markers:markers.paragraph_counts.map(x=>[commentList('1_0_'+x.paragraph_index).length,x.comment_count]),
 profile:profileLocalCounts(A).commentCount,sqlProfile:profileCount};
 },{counts,markers,profileCount,A});
 assert.equal(compare.storyCount,7);assert.equal(compare.storyCount,compare.sqlStory);assert.equal(compare.general,compare.sqlGeneral);assert.deepEqual(compare.markers,[[2,2],[1,1]]);assert.equal(compare.profile,compare.sqlProfile);
 for(const owner of [null,A,B,A,null]){
 let membership=[];if(owner){await db.exec('SET ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[owner]);membership=await call('nca_my_comment_likes',[rows.map(r=>r.id)])}
 await page.evaluate(async({owner,membership,likes})=>{
 authUser=owner?{id:owner}:null;resetAuthAccount(owner);
 syncCommentHeartAccount();await refreshCommentLikeEnrichment(Object.values(comments).flat().map(c=>c.id));
 if(owner)for(const row of Object.values(comments).flat())assertMembership(row.id);
 function assertMembership(id){if(commentStats.membership.get(String(id))!==membership.map(String).includes(String(id)))throw new Error('SQL/browser membership mismatch')}
 openStory(1);showIntroTab('comments',document.querySelectorAll('.intro-tabs button')[3]);
 },{owner,membership,likes});
 const state=await page.locator('#storyCommentList [data-comment-id="1"] [data-comment-action="like"]').evaluate(el=>({pressed:el.getAttribute('aria-pressed'),count:el.querySelector('span').textContent}));
 assert.equal(state.count,'2');assert.equal(state.pressed,String(!!owner));
 assert.equal(await page.evaluate(()=>storyCommentCount(stories[0])),7,'No baseline in comment total');
 }
 await page.evaluate(()=>{currentStory=stories[0];currentChapter=0;currentStory.chapters[0].paras=['First','Second'];renderChapter()});
 await page.waitForLoadState('networkidle');
 assert.equal(await page.locator('#para_1_0_0 .comment-btn span').textContent(),'2');assert.equal(await page.locator('#para_1_0_1 .comment-btn span').textContent(),'1');
 assert.deepEqual(page.errors,[]);
 }finally{await page?.close();await db.close()}
});
