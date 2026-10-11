const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {startBrowser,stopBrowser}=require('./helpers/public-feed-browser.cjs');
const {setup,A,B}=require('./helpers/scoped-comments-browser.cjs');
before(startBrowser);after(stopBrowser);
async function using(fn){const s=await setup();try{await fn(s);}finally{await s.close();}}
const desc=surface=>surface==='story'?{surface,story:'1',page:'1'}:surface==='chapter'?{surface,story:'1',ci:0,count:2,sort:'newest',classification:null}:{surface,story:'1',ci:0,pi:0,sort:'newest'};
const roots=(p,d,opt={})=>p.evaluate(([d,opt])=>scopedComments.roots(d,opt),[d,opt]);
const ids=(p,d)=>p.evaluate(d=>scopedComments.state.rootPages.get(scopedComments.pageKey(d))?.ids,d);
for(const surface of ['story','chapter','paragraph'])test(`scoped ${surface} works with empty legacy snapshot`,()=>using(async s=>{
 await s.add(1,null,surface==='paragraph'?'paragraph':surface,surface==='story'?null:0,surface==='paragraph'?0:null);
 await s.page.evaluate(()=>comments={});const d=desc(surface);assert.equal(await roots(s.page,d),true);assert.deepEqual(await ids(s.page,d),['1']);
 assert(!s.calls.some(c=>c.name==='comments'&&c.method==='GET'&&!c.url.searchParams.has('id')));
}));
test('story arbitrary numbered page / locator / clamp use one direct page RPC',()=>using(async s=>{
 for(let i=1;i<=45;i++)await s.add(i);const d={...desc('story'),page:'100'};assert.equal(await roots(s.page,d),true);
 const r=await s.page.evaluate(d=>scopedComments.state.rootPages.get(scopedComments.pageKey(d)).data,d);assert.equal(r.actual_page,'3');assert.equal(r.root_total,'45');assert.equal(r.page_count,'3');
 assert.equal(s.calls.filter(c=>c.name==='nca_story_comment_root_page').length,1);
 assert.equal(await roots(s.page,desc('story'),{target:'1',force:true}),true);
}));
test('chapter loaded prefix and paragraph exact tuple are passed unchanged',()=>using(async s=>{
 await s.add(1,null,'chapter',0);await s.add(2,null,'paragraph',0,0);await s.add(3,null,'paragraph',0,2);await roots(s.page,desc('chapter'));assert.deepEqual(await ids(s.page,desc('chapter')),['2','1']);
 await roots(s.page,desc('paragraph'));assert.deepEqual(await ids(s.page,desc('paragraph')),['2']);
 const args=s.calls.find(c=>c.name==='nca_context_comment_root_page').body;assert.equal(args.p_loaded_paragraph_count,2);assert(!('p_viewer_admin' in args));
}));
test('entity presence and target merge never imply root page completeness',()=>using(async s=>{
 await s.add(1);await s.add(2,1);assert.equal(await s.page.evaluate(()=>scopedComments.path('2')),true);
 assert.equal(await s.page.evaluate(()=>scopedComments.state.rootPages.size),0);assert.equal(await s.page.evaluate(()=>scopedComments.state.entities.size),2);
 await roots(s.page,desc('story'));assert.deepEqual(await ids(s.page,desc('story')),['1']);
}));
test('overlap replacement, retry and identity-safe old finalizer',()=>using(async s=>{
 await s.add(1);const d=desc('story'),held=s.hold('nca_story_comment_root_page');await s.page.evaluate(d=>{window.old=scopedComments.roots(d)},d);await held.started.promise;
 s.fail.add('nca_story_comment_root_page');assert.equal(await roots(s.page,d,{force:true}),false);s.fail.clear();await s.add(2);assert.equal(await roots(s.page,d),true);
 held.release.resolve();assert.equal(await s.page.evaluate(()=>old),false);assert.deepEqual(await ids(s.page,d),['2','1']);assert.equal(await s.page.evaluate(()=>scopedComments.state.flights.size),0);
}));
test('deleted/edited entities cannot be restored by held pre-mutation reads',()=>using(async s=>{
 await s.add(1);const d=desc('story'),held=s.hold('nca_story_comment_root_page');await s.page.evaluate(d=>{window.old=scopedComments.roots(d)},d);await held.started.promise;
 await s.page.evaluate(()=>{scopedComments.mutate('1');scopedComments.knownDelete('1')});held.release.resolve();assert.equal(await s.page.evaluate(()=>old),false);assert.equal(await s.page.evaluate(()=>scopedComments.state.entities.has('1')),false);
}));
for(const end of ['B','A',null])test(`held A enrichment cannot apply after ${end==='A'?'A→B→A':end||'logout'}`,()=>using(async s=>{
 await s.add(1);await s.account(A);const h=s.hold('profiles');await s.page.evaluate(d=>{window.old=scopedComments.roots(d)},desc('story'));await h.started.promise;
 await s.account(B);if(end==='A')await s.account(A);if(end===null)await s.account(null);h.release.resolve();assert.equal(await s.page.evaluate(()=>old),false);
 assert.equal(await s.page.evaluate(()=>scopedComments.state.rootPages.size),0);
}));
test('all-sort waits for own-profile readiness; stale fingerprint cursor rebases',()=>using(async s=>{
 await s.add(1,null,'chapter',0,null,A);await s.add(2,null,'chapter',0,null,B);await s.account(A);await s.page.evaluate(()=>authAccount.profileReady=false);
 const d={...desc('chapter'),sort:'all'};assert.equal(await roots(s.page,d),false);assert(!s.calls.some(c=>c.name==='nca_context_comment_root_page'));
 await s.page.evaluate(()=>authAccount.profileReady=true);assert.equal(await roots(s.page,d),true);const cursor=await s.page.evaluate(d=>scopedComments.state.rootPages.get(scopedComments.pageKey(d)).data.next_cursor,d);
 await s.db.query("UPDATE profiles SET display_name='Reader' WHERE id=$1",[A]);assert.equal(await roots(s.page,d,{force:true,cursor,append:true}),true);
 assert.equal(s.calls.filter(c=>c.name==='nca_context_comment_root_page').length,3);
}));
test('thread reveal 6/+6 and exact server descendant total',()=>using(async s=>{
 await s.add(1);for(let i=2;i<=15;i++)await s.add(i,i-1);await roots(s.page,desc('story'));
 assert.equal(await s.page.evaluate(()=>scopedComments.thread('1')),true);assert.deepEqual(await s.page.evaluate(()=>scopedComments.state.threads.get('1').ids),['2','3','4','5','6','7']);
 assert.equal(await s.page.evaluate(()=>scopedComments.thread('1',{cursor:scopedComments.state.threads.get('1').data.next_cursor,append:true})),true);
 assert.equal(await s.page.evaluate(()=>scopedComments.state.threads.get('1').ids.length),12);assert.equal(await s.page.evaluate(()=>scopedComments.state.threads.get('1').data.descendant_total),'14');
}));
for(const kind of ['target_not_found','malformed_thread'])test(`thread ${kind} never becomes partial exact success`,()=>using(async s=>{
 await s.add(1);await s.add(2,1,kind==='malformed_thread'?'chapter':'story',kind==='malformed_thread'?0:null);await s.page.evaluate(()=>{const e=scopedComments.entity({id:'1',story_id:'1',scope:'story',parent_id:null});scopedComments.state.entities.set('1',e)});
 assert.equal(await s.page.evaluate(()=>scopedComments.thread('1',{target:'999'})),false);
 const r=await s.page.evaluate(()=>scopedComments.state.threads.get('1'));assert.equal(r.ready,false);
 if(kind==='target_not_found')assert.equal(r.data.descendant_total,'1');else assert.equal(r.ids.length,0);
}));
test('130 ancestors resolve in bounded chunks and all edges revalidate',()=>using(async s=>{
 for(let i=1;i<=131;i++)await s.add(i,i===1?null:i-1);assert.equal(await s.page.evaluate(()=>scopedComments.path('131')),true);
 assert.equal(s.calls.filter(c=>c.name==='nca_comment_target_path').length,3);assert.equal(s.calls.filter(c=>c.name==='comments').length,1);
 assert.equal(await s.page.evaluate(()=>scopedComments.state.targetPaths.get('131').data.root.id),'1');
}));
test('cross-chunk cycle fails without guessed root',()=>using(async s=>{
 for(let i=1;i<=131;i++)await s.add(i,i===1?null:i-1);await s.db.exec('UPDATE comments SET parent_id=100 WHERE id=1');assert.equal(await s.page.evaluate(()=>scopedComments.path('131')),false);
 assert.equal(await s.page.evaluate(()=>scopedComments.state.targetPaths.get('131').ready),false);
}));
test('earlier-edge reparent caught by final structural revalidation and bounded restart',()=>using(async s=>{
 for(let i=1;i<=70;i++)await s.add(i,i===1?null:i-1);const h=s.hold('nca_comment_target_path');await s.page.evaluate(()=>{window.old=scopedComments.path('70')});await h.started.promise;
 await s.db.exec('UPDATE comments SET parent_id=1 WHERE id=69');h.release.resolve();assert.equal(await s.page.evaluate(()=>old),true);
 assert.equal(s.calls.filter(c=>c.name==='nca_comment_target_path').length,3);
 assert.deepEqual(await s.page.evaluate(()=>scopedComments.state.targetPaths.get('70').ids),['70','69','1']);
}));
test('navigation epoch cancellation prevents path completion',()=>using(async s=>{
 await s.add(1);const h=s.hold('nca_comment_target_path');await s.page.evaluate(()=>{window.old=scopedComments.path('1')});await h.started.promise;await s.page.evaluate(()=>show('home'));h.release.resolve();assert.equal(await s.page.evaluate(()=>old),false);
}));
for(const table of ['comment_mentions','profiles'])test(`${table} enrichment failure remains unresolved/retryable`,()=>using(async s=>{
 await s.add(1);s.fail.add(table);assert.equal(await roots(s.page,desc('story')),false);s.fail.clear();assert.equal(await roots(s.page,desc('story')),true);
}));
test('mentions >200 associations and profiles >200 IDs bounded independently',()=>using(async s=>{
 await s.add(1);await s.db.exec("INSERT INTO auth.users SELECT ('00000000-0000-0000-0001-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,205) i; INSERT INTO profiles(id,display_name) SELECT id,'Synthetic' FROM auth.users WHERE id NOT IN ('"+A+"','"+B+"'); INSERT INTO comment_mentions(comment_id,mentioned_user_id) SELECT 1,id FROM profiles;");
 assert.equal(await roots(s.page,desc('story')),true);const mentions=s.calls.filter(c=>c.name==='comment_mentions');assert.equal(mentions.length,2);assert.deepEqual(mentions.map(c=>Number(c.url.searchParams.get('offset')||0)),[0,200]);
 const profiles=s.calls.filter(c=>c.name==='profiles');assert.equal(profiles.length,2);assert(profiles.every(c=>c.url.searchParams.get('id').split(',').length<=200));
}));
test('bigint >2^53 preserved in entities, RPC arguments and structural edge reads',()=>using(async s=>{
 await s.add('9007199254740993');await s.add('9007199254740994','9007199254740993');assert.equal(await s.page.evaluate(()=>scopedComments.path('9007199254740994')),true);
 assert.equal(await s.page.evaluate(()=>scopedComments.state.targetPaths.get('9007199254740994').data.root.id),'9007199254740993');
 assert.equal(s.calls.find(c=>c.name==='nca_comment_target_path').body.p_comment_id,'9007199254740994');
 assert.equal(await s.page.evaluate(()=>{try{scopedComments.decimal(9007199254740993);return false}catch{return true}}),true);
}));
test('opaque infinity cursors cross frontend unchanged',()=>using(async s=>{
 await s.add(1,null,'chapter',0,null,B,'infinity');await s.add(2,null,'chapter',0,null,B,'-infinity');await roots(s.page,desc('chapter'));
 const cursor=await s.page.evaluate(d=>scopedComments.state.rootPages.get(scopedComments.pageKey(d)).data.next_cursor,desc('chapter'));assert.equal(cursor.created_at,'-infinity');
 assert.equal(await roots(s.page,desc('chapter'),{cursor,force:true}),true);assert.equal(s.calls.filter(c=>c.name==='nca_context_comment_root_page').at(-1).body.p_cursor.created_at,'-infinity');
}));
test('root create and reply create do not wait for global comment reload',()=>using(async s=>{
 await s.account(A);const result=await s.page.evaluate(async()=>{const root=await insertCloudComment('story_1','Root');const reply=await insertCloudComment('story_1','Reply',{parentId:root.id,replyToUserId:authUser.id});return [root,reply]});
 assert.equal(result[1].parent_id,result[0].id);assert(!s.calls.some(c=>c.name==='comments'&&c.method==='GET'&&!c.url.searchParams.has('id')));
 assert(s.calls.some(c=>c.name==='nca_story_comment_counts'));
}));
test('root like rebases interaction; reply like targeted only',()=>using(async s=>{
 await s.add(1,null,'chapter',0,null,A);await s.add(2,1,'chapter',0,null,A);await s.account(B);
 await s.page.evaluate(()=>{currentStory=stories[0];currentChapter=0;chapterCommentSort='interaction';currentStory.chapters[0].paras=['one','two'];document.getElementById('reader').classList.remove('hidden')});
 await roots(s.page,{...desc('chapter'),sort:'interaction'});await s.page.evaluate(()=>scopedComments.thread('1'));s.calls.length=0;
 await s.page.evaluate(()=>toggleCommentLike('chapter_1_0','1'));assert.equal(s.calls.filter(c=>c.name==='nca_context_comment_root_page').length,1);s.calls.length=0;
 await s.page.evaluate(()=>toggleCommentLike('chapter_1_0','2'));assert.equal(s.calls.filter(c=>c.name==='nca_context_comment_root_page').length,0);assert(!s.calls.some(c=>c.name==='comment_likes'&&c.method==='GET'));
}));
test('reader and view recorder source bytes unchanged from HEAD',()=>{
 const cp=require('node:child_process'),source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),head=cp.execFileSync('git',['show','HEAD:index.html'],{cwd:require('node:path').join(__dirname,'..'),encoding:'utf8'});
 for(const [start,end] of [['async function read(','function isImportedChapterMetadata'],['async function recordStoryView(','async function read(']])assert.equal(source.slice(source.indexOf(start),source.indexOf(end)),head.slice(head.indexOf(start),head.indexOf(end)));
});
async function showStory(s){await s.page.evaluate(()=>{comments={};openStory(stories[0].id);showIntroTab('comments',document.querySelectorAll('.intro-tabs button')[3])});await s.page.waitForFunction(()=>scopedComments.state.rootPages.get(scopedComments.pageKey(scopedComments.descriptor('story')))?.ready===true);}
test('story scoped renderer displays authoritative roots with legacy empty and preserves draft/focus',()=>using(async s=>{
 await s.add(1);await s.account(B);await showStory(s);assert.equal(await s.page.locator('#storyCommentList .comment-item').count(),1);
 await s.page.locator('#storyCommentInput').fill('Preserved draft');await s.page.locator('#storyCommentInput').focus();
 await s.page.evaluate(()=>scopedComments.refresh(scopedComments.descriptor('story'),{force:true}));assert.equal(await s.page.locator('#storyCommentInput').inputValue(),'Preserved draft');
 assert.equal(await s.page.evaluate(()=>document.activeElement.id),'storyCommentInput');
}));
test('chapter/paragraph renderer works empty global snapshot, marker count and mobile panel preserved',()=>using(async s=>{
 await s.add(1,null,'chapter',0);await s.add(2,null,'paragraph',0,0);await s.page.setViewportSize({width:375,height:812});
 await s.page.evaluate(()=>{comments={};currentStory=stories[0];currentChapter=0;currentStory.chapters[0].paras=['one','two'];renderChapter();toggleComments('1_0_0',true)});
 await s.page.waitForFunction(()=>scopedComments.state.rootPages.get(scopedComments.pageKey(scopedComments.descriptor('paragraph','1_0_0')))?.ready);
 assert.equal(await s.page.locator('#paragraphCommentPanelBody .comment-item').count(),1);assert.equal(await s.page.locator('#paragraphCommentPanel.open').count(),1);
 await s.page.evaluate(()=>scopedComments.refresh(scopedComments.descriptor('paragraph','1_0_0'),{force:true}));assert.equal(await s.page.locator('#paragraphCommentPanel.open').count(),1);
}));
test('actual reply buttons reveal 6 then +6 without legacy capture-listener interference',()=>using(async s=>{
 await s.add(1);for(let i=2;i<=15;i++)await s.add(i,1);await showStory(s);
 await s.page.locator('[data-scoped-thread="1"]').click();await s.page.waitForFunction(()=>document.querySelectorAll('#storyCommentList .comment-replies .comment-item').length===6);
 await s.page.locator('[data-scoped-mode="more"]').click();await s.page.waitForFunction(()=>document.querySelectorAll('#storyCommentList .comment-replies .comment-item').length===12);
 assert(!s.calls.some(c=>c.name==='comments'&&c.method==='GET'));
}));
test('story target locator navigates to root page and target thread without reader view event',()=>using(async s=>{
 for(let i=1;i<=22;i++)await s.add(i);await s.add(23,1);s.calls.length=0;
 assert.equal(await s.page.evaluate(()=>scopedComments.navigate('23')),true);assert.equal(await s.page.evaluate(()=>String(storyCommentPage)),'2');
 assert.equal(await s.page.locator('#storyCommentList .comment-item[data-comment-id="23"]').count(),1);assert(!s.calls.some(c=>c.name==='story_views'));
}));
test('completed-reader chapter target navigation creates zero additional view/content GETs',()=>using(async s=>{
 await s.add(1,null,'chapter',0);await s.page.evaluate(()=>{currentStory=stories[0];currentChapter=0;currentStory.chapters[0].paras=['one'];renderChapter()});
 await s.page.waitForLoadState('networkidle');s.calls.length=0;assert.equal(await s.page.evaluate(()=>scopedComments.navigate('1')),true);
 assert(!s.calls.some(c=>['story_views','paragraphs','chapter_images'].includes(c.name)));
}));
test('target deleted after path read fails safely before navigation/focus',()=>using(async s=>{
 await s.add(1);const h=s.hold('comments');await s.page.evaluate(()=>{window.old=scopedComments.navigate('1')});await h.started.promise;await s.db.exec('DELETE FROM comments WHERE id=1');h.release.resolve();assert.equal(await s.page.evaluate(()=>old),false);
 assert(!s.calls.some(c=>c.name==='story_views'));
}));
test('old finalizer does not clear still-pending replacement flight',()=>using(async s=>{
 await s.add(1);const d=desc('story'),old=s.hold('nca_story_comment_root_page');await s.page.evaluate(d=>{window.old=scopedComments.roots(d)},d);await old.started.promise;
 const newer=s.hold('nca_story_comment_root_page');await s.page.evaluate(d=>{window.newer=scopedComments.roots(d,{force:true})},d);await newer.started.promise;
 old.release.resolve();assert.equal(await s.page.evaluate(()=>old),false);assert.equal(await s.page.evaluate(()=>scopedComments.state.flights.size),1);
 newer.release.resolve();assert.equal(await s.page.evaluate(()=>newer),true);
}));
test('current partial entity merge does not mark obsolete page covered',()=>using(async s=>{
 await s.add(1);const d=desc('story'),old=s.hold('nca_story_comment_root_page');await s.page.evaluate(d=>{window.old=scopedComments.roots(d)},d);await old.started.promise;
 const newer=s.hold('nca_story_comment_root_page');await s.page.evaluate(d=>{window.newer=scopedComments.roots(d,{force:true})},d);await newer.started.promise;
 old.release.resolve();await s.page.evaluate(()=>old);assert.equal(await s.page.evaluate(()=>scopedComments.state.entities.has('1')),true);assert.equal(await s.page.evaluate(d=>scopedComments.state.rootPages.get(scopedComments.pageKey(d)).ready,d),false);
 newer.release.resolve();assert.equal(await s.page.evaluate(()=>newer),true);
}));
test('edit patches entity without content reload/count refresh, held old read cannot overwrite it',()=>using(async s=>{
 await s.add(1,null,'story',null,null,A);await s.account(A);await showStory(s);await s.page.evaluate(()=>commentActivity.load('home'));const held=s.hold('nca_story_comment_root_page');await s.page.evaluate(()=>{window.old=scopedComments.roots(scopedComments.descriptor('story'),{force:true})});await held.started.promise;
 await s.page.evaluate(()=>beginEditComment('story_1','1'));await s.page.locator('.comment-edit-box textarea').fill('Edited locally');s.calls.length=0;
 await s.page.evaluate(()=>saveEditComment('story_1','1',document.querySelector('.comment-item[data-comment-id="1"]')));held.release.resolve();await s.page.evaluate(()=>old);
 assert.equal(await s.page.evaluate(()=>scopedComments.state.entities.get('1').text),'Edited locally');assert(!s.calls.some(c=>c.name.startsWith('nca_')||c.name==='comments'&&c.method==='GET'));
}));
test('root delete uses cascade exact counts and tombstones known entities only',()=>using(async s=>{
 await s.add(1);await s.add(2,1);await s.add(3,2);const C='00000000-0000-0000-0000-000000000003';await s.db.query('INSERT INTO auth.users VALUES($1)',[C]);await s.db.query('UPDATE comments SET user_id=$1 WHERE id=2',[C]);await s.account(A);await roots(s.page,desc('story'));await s.page.evaluate(C=>refreshProfileCommentCount(C),C);assert.equal(await s.page.evaluate(C=>commentStats.profiles.get(C),C),1);s.page.on('dialog',d=>d.accept());s.calls.length=0;
 await s.page.evaluate(()=>deleteCommentById('story_1','1'));assert.equal(await s.page.evaluate(C=>commentStats.profiles.has(C),C),false);assert(!s.calls.some(c=>c.name==='nca_profile_comment_count'&&c.body.p_user_id===C));
 assert.equal((await s.db.query('SELECT count(*) n FROM comments')).rows[0].n,0);assert.deepEqual(await s.page.evaluate(()=>[...scopedComments.state.tombstones]),['1']);
 assert(s.calls.some(c=>c.name==='nca_story_comment_counts'));assert(!s.calls.some(c=>c.name==='comments'&&c.method==='GET'));
}));
test('reply delete invalidates thread/interaction and preserves root membership',()=>using(async s=>{
 await s.add(1,null,'chapter',0);await s.add(2,1,'chapter',0);await s.add(3,2,'chapter',0);await s.account(A);
 await s.page.evaluate(()=>{currentStory=stories[0];currentChapter=0;currentStory.chapters[0].paras=['one'];chapterCommentSort='interaction';displayPage('reader');renderChapter()});await s.page.waitForLoadState('networkidle');assert.equal(await roots(s.page,desc('chapter'),{force:true}),true);assert.equal(await s.page.evaluate(()=>scopedComments.thread('1')),true);s.page.on('dialog',d=>d.accept());s.calls.length=0;
 await s.page.evaluate(()=>deleteCommentById('chapter_1_0','2'));assert.equal((await s.db.query('SELECT count(*) n FROM comments')).rows[0].n,1);
 assert(s.calls.some(c=>c.name==='nca_context_comment_root_page'));assert(s.calls.some(c=>c.name==='nca_comment_thread_page'));assert.equal(await s.page.evaluate(()=>scopedComments.state.entities.has('1')),true);
}));
test('held create ACK after logout performs no mentions/reconciliation under new account',()=>using(async s=>{
 await s.account(A);const held=s.hold('comments');await s.page.evaluate(B=>{window.old=insertCloudComment('story_1','@Reader hi',{mentions:[{id:B,token:'@Reader',start:0,end:7}]})},B);await held.started.promise;await s.account(null);s.calls.length=0;held.release.resolve();assert.equal(await s.page.evaluate(()=>old),null);
 assert(!s.calls.some(c=>c.name==='comment_mentions'||c.name==='nca_story_comment_counts'));
}));
test('create selected mention preserves exact chosen UUID in association row',()=>using(async s=>{
 await s.account(A);const r=await s.page.evaluate(B=>insertCloudComment('story_1','@Reader hi',{mentions:[{id:B,token:'@Reader',start:0,end:7}]}),B);const rows=(await s.db.query('SELECT comment_id::text,mentioned_user_id FROM comment_mentions')).rows;
 assert.deepEqual(rows,[{comment_id:r.id,mentioned_user_id:B}]);
}));
test('create composer clears sent draft after scoped rerender and leaves no pending writer',()=>using(async s=>{
 await s.account(B);await showStory(s);await s.page.locator('#storyCommentInput').fill('Sent draft');
 await s.page.evaluate(()=>submitStoryComment({preventDefault(){}}));assert.equal(await s.page.locator('#storyCommentInput').inputValue(),'');assert.equal(await s.page.locator('#storyCommentInput').isEnabled(),true);assert.equal(await s.page.evaluate(()=>scopedComments.state.writers.size),0);
}));
test('UI refresh itself creates no reader views, and legacy refresh cannot overwrite scoped entity',()=>using(async s=>{
 await s.add(1);await showStory(s);const text=await s.page.evaluate(()=>scopedComments.state.entities.get('1').text);s.calls.length=0;
 await s.page.evaluate(()=>{comments={'story_1':[{id:1,text:'Old legacy text',name:'Old',userId:'Old'}]};refreshCommentViews()});await s.page.waitForLoadState('networkidle');
 assert.equal(await s.page.evaluate(()=>scopedComments.state.entities.get('1').text),text);assert(!s.calls.some(c=>c.name==='story_views'));
}));
test('incomplete thread keeps previous validated window but never marks new coverage ready',()=>using(async s=>{
 await s.db.query("INSERT INTO comments(id,user_id,content,scope,story_id,parent_id) SELECT i,$1,'Synthetic','story',1,CASE WHEN i=1 THEN NULL ELSE i-1 END FROM generate_series(1,1026) i",[B]);
 await s.page.evaluate(()=>{scopedComments.owner();scopedComments.state.entities.set('1',scopedComments.entity({id:'1',story_id:'1',scope:'story',parent_id:null}));scopedComments.state.threads.set('1',{key:'1',ids:['2'],ready:true,data:{descendant_total:'1'}})});
 assert.equal(await s.page.evaluate(()=>scopedComments.thread('1',{force:true})),false);const r=await s.page.evaluate(()=>scopedComments.state.threads.get('1'));assert.deepEqual(r.ids,['2']);assert.equal(r.ready,false);assert.equal(r.error,'incomplete');
}));
test('path UI continuation budget is bounded and exposes retryable failure',()=>using(async s=>{
 await s.db.query("INSERT INTO comments(id,user_id,content,scope,story_id,parent_id) SELECT i,$1,'Synthetic','story',1,CASE WHEN i=1 THEN NULL ELSE i-1 END FROM generate_series(1,2000) i",[B]);
 assert.equal(await s.page.evaluate(()=>scopedComments.path('2000')),false);assert.equal(s.calls.filter(c=>c.name==='nca_comment_target_path').length,17);assert.match(await s.page.evaluate(()=>scopedComments.state.targetPaths.get('2000').error),/budget/);
}));
test('chapter notification opens ordinary reader once; repeated target in completed reader adds zero views',()=>using(async s=>{
 await s.add(1,null,'chapter',0);await s.account(B);await s.page.evaluate(B=>{stories[0].chapters[0]._parasLoaded=true;stories[0].chapters[0].paras=['one'];notificationOwner=B;notificationRows.set('1',{id:'1',user_id:B,comment_id:'1',type:'reply'});},B);s.calls.length=0;
 await s.page.evaluate(()=>openNotification('1'));assert.equal(s.calls.filter(c=>c.name==='story_views'&&c.method==='POST').length,1);assert.equal(await s.page.locator('#reader:not(.hidden)').count(),1);
 assert.equal(await s.page.locator('#chapterCommentsList .comment-item[data-comment-id="1"]').count(),1);
 s.calls.length=0;assert.equal(await s.page.evaluate(()=>scopedComments.navigate('1')),true);assert.equal(s.calls.filter(c=>c.name==='story_views').length,0);
}));
test('scoped request budgets measured against actual B1 SQL, independent of legacy/global history',()=>using(async s=>{
 const budgets={};for(let i=1;i<=20;i++)await s.add(i);for(let i=21;i<=26;i++)await s.add(i,1);
 for(const surface of ['story','chapter','paragraph']){
  if(surface==='chapter')await s.add(27,null,'chapter',0);if(surface==='paragraph')await s.add(28,null,'paragraph',0,0);
  s.calls.length=0;assert.equal(await roots(s.page,desc(surface),{force:true}),true);budgets[surface+'Anonymous']=s.calls.length;
 }
 s.calls.length=0;await s.page.evaluate(()=>scopedComments.thread('1'));budgets.reply6Anonymous=s.calls.length;
 await s.account(A);s.calls.length=0;await roots(s.page,desc('story'),{force:true});budgets.storySigned=s.calls.length;
 s.calls.length=0;await s.page.evaluate(()=>scopedComments.thread('1',{force:true}));budgets.reply6Signed=s.calls.length;
 await showStory(s);await s.page.waitForLoadState('networkidle');s.calls.length=0;assert.equal(await s.page.evaluate(()=>scopedComments.navigate('21')),true);budgets.deepStoryNavigationSigned=s.calls.length;
 s.calls.length=0;await s.page.evaluate(()=>toggleCommentLike('story_1','21'));budgets.replyLike=s.calls.length;
 s.calls.length=0;await s.page.evaluate(()=>toggleCommentLike('story_1','1'));budgets.storyRootLike=s.calls.length;
 await s.page.waitForLoadState('networkidle');s.calls.length=0;const r=await s.page.evaluate(()=>insertCloudComment('story_1','New root'));budgets.createStoryRoot=s.calls.length;
 s.calls.length=0;await s.page.evaluate(root=>insertCloudComment('story_1','New reply',{parentId:root}),r.id);budgets.createStoryReply=s.calls.length;
 assert.equal(budgets.storyAnonymous,4);assert.equal(budgets.chapterAnonymous,4);assert.equal(budgets.paragraphAnonymous,4);assert.equal(budgets.reply6Anonymous,4);assert.equal(budgets.storySigned,5);assert.equal(budgets.reply6Signed,5);
 assert.equal(budgets.replyLike,3);assert.equal(budgets.storyRootLike,3);
 console.log('B2 CONTROLLED REQUEST BUDGET',JSON.stringify(budgets));fs.writeFileSync('/tmp/step5cb2-request-budget.json',JSON.stringify(budgets,null,2));
}));
test('pending ordinary reader is awaited by actual renderer, target navigation adds no duplicate view',()=>using(async s=>{
 await s.add(1,null,'chapter',0);const held=s.hold('story_views');
 // The generic fixture route handles the write; hold it explicitly without touching read().
 let release;const gate=new Promise(r=>release=r),started=new Promise(resolve=>s.page.route('**/rest/v1/story_views**',async route=>{resolve();await gate;await route.fulfill({status:201,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'[]'})}));
 await s.page.evaluate(()=>{stories[0].chapters[0]._parasLoaded=true;stories[0].chapters[0].paras=['one'];window.readerWork=read(stories[0].id,0)});await started;
 await s.page.evaluate(()=>{window.navWork=scopedComments.navigate('1')});await s.page.waitForFunction(()=>scopedComments.state.intent?.story==='1');release();await s.page.evaluate(()=>readerWork);assert.equal(await s.page.evaluate(()=>navWork),true);
 assert.equal(await s.page.locator('#chapterCommentsList .comment-item[data-comment-id="1"]').count(),1);
}));
test('direct reply recipient is rendered from UUID profile, not a guessed comment ID',()=>using(async s=>{
 await s.add(1);await s.add(2,1);await s.db.query('UPDATE comments SET reply_to_user_id=$1 WHERE id=2',[A]);await showStory(s);await s.page.locator('[data-scoped-thread="1"]').click();
 await s.page.waitForFunction(()=>document.querySelector('[data-reply-user-id]'));
 assert.equal(await s.page.locator('[data-reply-user-id]').getAttribute('data-reply-user-id'),A);assert.match(await s.page.locator('[data-reply-user-id]').textContent(),/Alex/);
}));
test('A→B→A held old edit ACK/finalizer cannot patch current entity or clear newer writer',()=>using(async s=>{
 await s.add(1,null,'story',null,null,A);await s.account(A);await roots(s.page,desc('story'));const old=s.hold('comments');
 await s.page.evaluate(()=>{window.old=saveEditComment('story_1','1',{querySelector:()=>({value:'Old A edit'})})});await old.started.promise;await s.account(B);await s.account(A);const newer=s.hold('comments');
 await s.page.evaluate(()=>{window.newer=saveEditComment('story_1','1',{querySelector:()=>({value:'New A edit'})})});await newer.started.promise;old.release.resolve();await s.page.evaluate(()=>old);
 assert.equal(await s.page.evaluate(()=>scopedComments.state.writers.size),1);assert.notEqual(await s.page.evaluate(()=>scopedComments.state.entities.get('1').text),'Old A edit');
 newer.release.resolve();await s.page.evaluate(()=>newer);assert.equal(await s.page.evaluate(()=>scopedComments.state.entities.get('1').text),'New A edit');assert.equal(await s.page.evaluate(()=>scopedComments.state.writers.size),0);
}));
test('ordinary user cannot delete another author even with reserved display name',()=>using(async s=>{
 await s.add(1,null,'story',null,null,A);await s.account(B);await roots(s.page,desc('story'));await s.page.evaluate(()=>memberProfile.display_name='Alex');s.calls.length=0;
 await s.page.evaluate(()=>deleteCommentById('story_1','1'));assert(!s.calls.some(c=>c.method==='DELETE'));assert.equal((await s.db.query('SELECT count(*) n FROM comments')).rows[0].n,1);
}));
test('successive target locators use their own returned page, not an earlier target cache',()=>using(async s=>{
 for(let i=1;i<=45;i++)await s.add(i);await showStory(s);
 assert.equal(await s.page.evaluate(()=>scopedComments.navigate('1')),true);
 await s.page.evaluate(async()=>{storyCommentPage='2';await scopedComments.refresh(scopedComments.descriptor('story'))});
 assert.equal(await s.page.evaluate(()=>scopedComments.navigate('45')),true);
 assert.equal(await s.page.evaluate(()=>String(storyCommentPage)),'1');
 assert.equal(await s.page.locator('#storyCommentList .comment-item[data-comment-id="45"]').count(),1);
 assert.equal(await s.page.evaluate(()=>scopedComments.navigate('25')),true);assert.equal(await s.page.evaluate(()=>String(storyCommentPage)),'2');
}));
test('location navigation without target ID preserves paragraph jump and panel',()=>using(async s=>{
 await s.page.evaluate(()=>{stories[0].chapters[0]._parasLoaded=true;stories[0].chapters[0].paras=['one','two']});
 await s.page.evaluate(()=>openCommentLocation('1',0,1));
 assert.equal(await s.page.evaluate(()=>activeCommentKey),'1_0_1');assert.equal(await s.page.locator('#paragraphCommentPanel.open').count(),1);
}));
test('scoped comment/reply hearts preserve seven-theme desktop/mobile geometry and counts',()=>using(async s=>{
 await s.add(1);await s.add(2,1);await s.db.query('INSERT INTO comment_likes(comment_id,user_id) VALUES(1,$1),(2,$1)',[B]);await showStory(s);await s.page.locator('[data-scoped-thread="1"]').click();await s.page.waitForFunction(()=>document.querySelector('[data-comment-id="2"]'));
 await s.page.evaluate(()=>commentActivity.load('home'));await s.page.waitForLoadState('networkidle');
 const states=[];for(const width of [390,1280]){await s.page.setViewportSize({width,height:900});for(const theme of ['light','smoky','dustyrose','mistblue','pastel','night','purplenight']){
  await s.page.evaluate(theme=>setTheme(theme),theme);await s.page.waitForLoadState('networkidle');
  for(const id of ['1','2']){const button=s.page.locator('#storyCommentList .comment-item[data-comment-id="'+id+'"] [data-comment-action="like"]');assert.equal((await button.locator('span').textContent()).trim(),'1');const size=await button.evaluate(el=>{const icon=el.querySelector('i'),count=el.querySelector('span'),before=el.getBoundingClientRect(),text=count.getBoundingClientRect(),large=icon.getBoundingClientRect();icon.style.transform='none';const after=el.getBoundingClientRect(),small=icon.getBoundingClientRect(),textAfter=count.getBoundingClientRect();icon.style.removeProperty('transform');return {font:getComputedStyle(count).fontSize,frame:[before.width,before.height],old:[after.width,after.height],text:[text.x,text.y,text.width,text.height],textAfter:[textAfter.x,textAfter.y,textAfter.width,textAfter.height],scale:large.width/small.width}});assert.equal(size.font,'12px');assert.deepEqual(size.frame,size.old);assert.deepEqual(size.text,size.textAfter);assert(Math.abs(size.scale-1.25)<.02);states.push({width,theme,id,...size});}
 }}fs.writeFileSync('/tmp/step5cb2-comment-heart-geometry.json',JSON.stringify(states,null,2));assert.deepEqual(s.page.errors,[]);
}));
test('obsolete target intent cannot suppress the newer reader paragraph loader',()=>using(async s=>{
 await s.add(1,null,'paragraph',0,0);await s.page.evaluate(async()=>{currentStory=stories[0];currentChapter=0;currentStory.chapters[0].paras=['one'];displayPage('reader');scopedComments.owner();scopedComments.state.intent={story:'1',scope:'chapter',ci:0,nav:navigationEpoch-2,account:commentAccountSnapshot()};activeCommentKey='1_0_0';renderParaComments(activeCommentKey);await Promise.all([...scopedComments.state.flights.values()].map(f=>f.promise))});
 await s.page.waitForLoadState('networkidle');assert(s.calls.some(c=>c.name==='nca_context_comment_root_page'&&c.body.p_context==='paragraph'));
}));
for(const end of ['B','A',null])test(`held target navigation cannot apply after ${end==='A'?'A→B→A':end||'logout'}`,()=>using(async s=>{
 await s.add(1,null,'chapter',0);await s.account(A);const held=s.hold('nca_comment_target_path');await s.page.evaluate(()=>{window.oldTarget=scopedComments.navigate('1')});await held.started.promise;
 await s.account(B);if(end==='A')await s.account(A);if(end===null)await s.account(null);s.calls.length=0;held.release.resolve();assert.equal(await s.page.evaluate(()=>oldTarget),false);
 assert(!s.calls.some(c=>c.name==='story_views'||c.name==='nca_context_comment_root_page'));assert.equal(await s.page.locator('#reader:not(.hidden)').count(),0);
}));
test('path partial merge preserves validated root descendant metadata',()=>using(async s=>{
 await s.add(1);await s.add(2,1);await roots(s.page,desc('story'));assert.equal(await s.page.evaluate(()=>scopedComments.state.entities.get('1').descendantTotal),'1');
 assert.equal(await s.page.evaluate(()=>scopedComments.path('2')),true);assert.equal(await s.page.evaluate(()=>scopedComments.state.entities.get('1').descendantTotal),'1');
}));
test('older root response cannot overwrite a newer successful thread descendant total',()=>using(async s=>{
 await s.add(1);await roots(s.page,desc('story'));const held=s.hold('nca_story_comment_root_page');await s.page.evaluate(d=>{window.oldCounter=scopedComments.roots(d,{force:true})},desc('story'));await held.started.promise;
 await s.add(2,1);assert.equal(await s.page.evaluate(()=>scopedComments.thread('1',{force:true})),true);assert.equal(await s.page.evaluate(()=>scopedComments.state.entities.get('1').descendantTotal),'1');
 held.release.resolve();await s.page.evaluate(()=>oldCounter);assert.equal(await s.page.evaluate(()=>scopedComments.state.entities.get('1').descendantTotal),'1');
}));
test('verified Step5B numeric JSON preserves adjacent bigint heart IDs and own membership losslessly',()=>using(async s=>{
 const ids=['9007199254740992','9007199254740993'];for(const id of ids)await s.add(id);await s.db.query('INSERT INTO comment_likes(comment_id,user_id) VALUES($1,$2)',[ids[1],B]);await s.account(B);
 assert.equal(await roots(s.page,desc('story')),true);
 const actual=await s.page.evaluate(ids=>ids.map(id=>({id,count:commentStats.likes.get(id),mine:commentStats.membership.get(id)})),ids);
 assert.deepEqual(actual,[{id:ids[0],count:0,mine:false},{id:ids[1],count:1,mine:true}]);
 assert.equal(s.calls.filter(c=>c.name==='nca_comment_like_counts').length,1);assert.equal(s.calls.filter(c=>c.name==='nca_my_comment_likes').length,1);
}));
