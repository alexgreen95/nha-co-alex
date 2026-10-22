'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {payloadFor}=require('../server/personal-push-worker.cjs');
const migration=fs.readFileSync('database/migrations/20261022_personal_push_rich_content.sql','utf8');
const baseline=fs.readFileSync('tests/helpers/personal-push-sender-baseline.sql','utf8');
const n={id:'9007199254740993',story_id:'9223372036854775807',chapter_id:'2',comment_id:'3',actor_display_name:'Thảo Nguyễn',story_title:'Nhà của Ánh'};
const verbs={comment:'đã bình luận trong',reply:'đã trả lời bình luận của bạn trong',mention:'đã nhắc đến bạn trong một bình luận của',comment_like:'đã thích bình luận của bạn trong'};
const fallbacks={comment:'đã bình luận về truyện của bạn.',reply:'đã trả lời bình luận của bạn.',mention:'đã nhắc đến bạn trong một bình luận.',comment_like:'đã thích bình luận của bạn.'};
for(const category of Object.keys(verbs)){
 test(category+' exact Vietnamese actor/story body, title, unchanged route and grouping tag',()=>{
  const p=payloadFor({...n,category});assert.equal(p.title,'Alex hiện lên và nói');assert.equal(p.body,`Thảo Nguyễn ${verbs[category]} “Nhà của Ánh”.`);
  assert.equal(p.tag,'nca-notification-'+n.id);assert.deepEqual(p.data,{notification_id:n.id,category,story_id:n.story_id,chapter_id:n.chapter_id,comment_id:n.comment_id});
 });
 test(category+' missing title and actor use safe bell-compatible fallbacks, never IDs',()=>{
  for(const story_title of [undefined,null,'',42,{},'https://arbitrary.invalid']){
   const p=payloadFor({...n,category,story_title,actor_display_name:null});assert.equal(p.body,'Thành viên '+fallbacks[category]);assert(!p.body.includes(n.id));assert(!p.body.includes('undefined'));assert(!p.body.includes('://'));
  }
 });
}
test('quotes, emoji and Vietnamese accents remain plain Unicode text, not payload fields/URLs',()=>{
 const actor='Thảo “Mèo” O\'Neil 🐈',story='“Đêm” và Alex\'s 🌙';const p=payloadFor({...n,category:'reply',actor_display_name:actor,story_title:story,url:'https://evil.invalid',content:'PRIVATE_COMMENT_NEVER_IN_PUSH'});
 assert.equal(p.body,`${actor} đã trả lời bình luận của bạn trong “${story}”.`);assert.equal(JSON.parse(JSON.stringify(p)).body,p.body);assert.deepEqual(Object.keys(p),['version','type','title','body','tag','data']);assert(!JSON.stringify(p).includes('PRIVATE_COMMENT'));assert(!JSON.stringify(p).includes('evil.invalid'));
});
test('normalizes whitespace and controls, preserves NFC and rejects malformed optional strings',()=>{
 const p=payloadFor({...n,category:'comment',actor_display_name:' \tTha\u0309o\n Nguyễn\0 ',story_title:' A\r\n\t B \u202eC '});
 assert.equal(p.body,'Thảo Nguyễn đã bình luận trong “A B C”.');assert(!/[\x00-\x1f\x7f]/.test(p.body));
 for(const actor_display_name of ['user@example.invalid','x'.repeat(80)+'@example.invalid','https://evil.invalid','www.evil.invalid','\ud800',{},123,'x'.repeat(8193)])assert(payloadFor({...n,category:'comment',actor_display_name}).body.startsWith('Thành viên '));
});
test('grapheme-safe bounding always stays within unchanged SW limits and JSON message budget',()=>{
 for(const category of Object.keys(verbs))for(const text of ['ế'.repeat(900),'👨‍👩‍👧‍👦'.repeat(200),'x'+'\u0301'.repeat(900)]){
  const p=payloadFor({...n,category,actor_display_name:text,story_title:text});assert(p.body.length<=240);assert(p.title.length<=100);assert(p.body.isWellFormed());assert(Buffer.byteLength(JSON.stringify(p))<4096);
 }
});
test('malformed core routing remains fail-closed despite optional display fallbacks',()=>{
 for(const value of [null,[],{...n,category:'new_story'},{...n,category:'new_chapter'},{...n,category:'comment',id:1},{...n,category:'reply',story_id:'01'},{...n,category:'reply',comment_id:'9223372036854775808'},{...n,category:'reply',chapter_id:undefined}])assert.throws(()=>payloadFor(value),/INVALID_NOTIFICATION_SHAPE/);
});
test('unchanged SW accepts every new copy and retains root/same-origin click behavior',async()=>{
 const handlers={},shown=[],opened=[];const self={location:{origin:'https://local.invalid'},addEventListener:(k,f)=>handlers[k]=f,registration:{showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(fs.readFileSync('push-sw.js','utf8'),{self,URL});
 for(const category of Object.keys(verbs)){const p=payloadFor({...n,category});let done;handlers.push({data:{text:()=>JSON.stringify(p),json:()=>p},waitUntil:p=>done=p});await done;}
 assert.equal(shown.length,4);assert(shown.every(x=>x.title==='Alex hiện lên và nói'));let done;handlers.notificationclick({notification:{data:{url:'https://evil.invalid'},close(){}},waitUntil:p=>done=p});await done;assert.deepEqual(opened,['https://local.invalid/']);
});
test('new migration replaces only prepare, has no privilege grants or runtime invocation',()=>{
 assert.match(migration,/BEGIN;[\s\S]*COMMIT;\s*$/);assert.equal((migration.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 const executable=migration.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");
 assert.doesNotMatch(executable,/\b(?:CREATE TABLE|CREATE ROLE|ALTER TABLE|GRANT|REVOKE|EXECUTE)\b/);
 assert.doesNotMatch(migration,/ERRCODE\s*=\s*'(?:40001|40P01)'/);
 assert.match(migration,/SECURITY DEFINER SET search_path=''/);assert.match(migration,/8901ee381de45fe1e4af73f219e33207/);
 assert.match(migration,/LEFT JOIN public\.profiles p ON p\.id=n\.actor_id/);assert.match(migration,/LEFT JOIN public\.stories t ON t\.id=n\.story_id/);
 assert(!/n\.content|p\.email|n\.actor_id::/.test(migration));
});
test('prepare authoritative checks, suppression and existing lock order are byte-preserved',()=>{
 const old=baseline.match(/CREATE FUNCTION public.nca_prepare_personal_push_delivery[\s\S]*?AS \$fn\$([\s\S]*?)\$fn\$;/)[1];
 let body=migration.match(/AS \$fn\$([\s\S]*?)\$fn\$;/)[1];
 body=body.replace(' actor_display_name pg_catalog.text;\n story_title pg_catalog.text;\n','');
 body=body.replace(/ -- Presentation uses only[\s\S]*? LEFT JOIN public.stories t ON t.id=n.story_id;\n/,'');
 body=body.replace(",\n   'actor_display_name',actor_display_name,'story_title',story_title",'');assert.equal(body,old);
});
