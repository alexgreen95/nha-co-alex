'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {PassThrough}=require('node:stream');
const {execFileSync,spawnSync}=require('node:child_process');
const {prepareBundle,hiddenInput,main}=require('../scripts/prepare-push-subscription-api-secrets.cjs');
const {databaseConfig}=require('../server/push-db.cjs');
const {WINDOWS_ACL,windowsAcl}=require('../scripts/personal-push-secret-security.cjs');
const f=require('./helpers/push-api-fixture.cjs');f.guardNetwork(test);
const root=path.resolve(__dirname,'..');
const password='OFFLINE_ONLY_@:/?#% +\\"\'é漢字';
const publicKey='sb_publishable_OFFLINE_ONLY';
let directory;
test.before(()=>{directory=fs.mkdtempSync(path.join(os.tmpdir(),'nca-api-prep-unit-'));fs.chmodSync(directory,0o700);});
test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
function terminal(){const stdin=new PassThrough(),stdout=new PassThrough(),stderr=new PassThrough();stdin.isTTY=stdout.isTTY=stderr.isTTY=true;stdin.isRaw=false;stdin.setRawMode=function(value){this.isRaw=value;};let out='',err='';stdout.on('data',b=>out+=b);stderr.on('data',b=>err+=b);return {stdin,stdout,stderr,get out(){return out;},get err(){return err;}};}
function setup(){const home=fs.mkdtempSync(path.join(directory,'home-'));fs.chmodSync(home,0o700);const caFile=path.join(home,'test-ca.pem');fs.writeFileSync(caFile,f.testCA.pem);const term=terminal(),reads=[];return {home,caFile,term,reads,target:path.join(home,'.nca-push-api-private','push-subscription-api-secrets.json'),deps:{home,terminal:term,readPublishable:async()=>{reads.push('public');return publicKey;},readPassword:async()=>{reads.push('password');return password;}}};}
const fields=['NCA_PUSH_API_DATABASE_URL','NCA_PUSH_API_CA_CERT_B64','NCA_PUSH_API_AUTH_PUBLISHABLE_KEY'];
const options=x=>({caFile:x.caFile});
test('exact dedicated Session URL, encoded existing password, canonical CA and three fields only',async()=>{
 const x=setup(),out=await prepareBundle(options(x),x.deps),bundle=JSON.parse(fs.readFileSync(out));assert.equal(out,x.target);assert.deepEqual(Object.keys(bundle),fields);assert.deepEqual(x.reads,['public','password']);
 const c=databaseConfig(bundle);assert.equal(c.user,'nca_push_api.cwwulyrutdvuekydydew');assert.equal(c.host,'aws-0-ap-northeast-2.pooler.supabase.com');assert.equal(c.port,5432);assert.equal(c.database,'postgres');assert.ok(c.password===password);assert.equal(c.ssl.rejectUnauthorized,true);assert.equal(c.ssl.minVersion,'TLSv1.2');assert.ok(c.ssl.ca===f.testCA.pem);
 const url=new URL(bundle.NCA_PUSH_API_DATABASE_URL);assert.ok(decodeURIComponent(url.password)===password);assert.equal(url.search,'');assert.equal(url.hash,'');assert.ok(bundle.NCA_PUSH_API_CA_CERT_B64===f.testCA.base64);assert.ok(bundle.NCA_PUSH_API_AUTH_PUBLISHABLE_KEY===publicKey);assert.equal(fs.statSync(out).mode&0o777,0o600);assert.equal(fs.statSync(path.dirname(out)).mode&0o077,0);assert.equal(x.term.out+x.term.err,'');
});
for(const value of ['OFFLINE_ONLY_😀漢字','OFFLINE_ONLY_a b+c','OFFLINE_ONLY_@?#%:/'])test('password-only percent encoding round-trips synthetic reserved input',async()=>{const x=setup(),p=await prepareBundle(options(x),{...x.deps,readPassword:async()=>value});assert.ok(databaseConfig(JSON.parse(fs.readFileSync(p))).password===value);});
for(const value of ['',null,undefined,'OFFLINE\n','OFFLINE\0','\ud800'])test('invalid password input leaves no bundle and prints nothing',async()=>{const x=setup();await assert.rejects(prepareBundle(options(x),{...x.deps,readPassword:async()=>value}),/^Error: PUSH_API_SECRET_PREPARATION_FAILED$/);assert.ok(!fs.existsSync(x.target));assert.equal(x.term.out+x.term.err,'');});
for(const value of [undefined,'','sb_secret_OFFLINE_ONLY','aaa.bbb.ccc','sb_publishable_',' sb_publishable_x','sb_publishable_x\n','sb_publishable_'+ 'x'.repeat(512)])test('wrong/oversized/nonpublic key rejected before password input',async()=>{const x=setup();await assert.rejects(prepareBundle(options(x),{...x.deps,readPublishable:async()=>value}));assert.equal(x.reads.length,0);assert.ok(!fs.existsSync(x.target));});
for(const variant of ['missing','relative','oversized','junk','multi','BOM','invalid-UTF8','symlink','ancestor-link'])test('CA '+variant+' fails before either hidden prompt',async()=>{
 const x=setup();let caFile=x.caFile;
 if(variant==='missing')caFile=undefined;if(variant==='relative')caFile='test-ca.pem';
 if(variant==='oversized')fs.writeFileSync(caFile,Buffer.alloc(12289,65));if(variant==='junk')fs.writeFileSync(caFile,f.testCA.pem+'junk');if(variant==='multi')fs.writeFileSync(caFile,f.testCA.pem+f.testCA.pem);if(variant==='BOM')fs.writeFileSync(caFile,'\uFEFF'+f.testCA.pem);if(variant==='invalid-UTF8')fs.writeFileSync(caFile,Buffer.from([255]));
 if(variant==='symlink'){fs.renameSync(caFile,caFile+'.original');fs.symlinkSync(caFile+'.original',caFile);}
 if(variant==='ancestor-link'){const alias=path.join(directory,'alias-'+path.basename(x.home));fs.symlinkSync(x.home,alias,'dir');caFile=path.join(alias,'test-ca.pem');}
 await assert.rejects(prepareBundle({caFile},x.deps));assert.equal(x.reads.length,0);assert.ok(!fs.existsSync(x.target));
});
test('CRLF CA bytes are preserved exactly, not normalized',async()=>{const x=setup(),pem=f.testCA.pem.replace(/\n/g,'\r\n');fs.writeFileSync(x.caFile,pem);const p=await prepareBundle(options(x),x.deps);assert.ok(databaseConfig(JSON.parse(fs.readFileSync(p))).ssl.ca===pem);});
for(const stream of ['stdin','stdout','stderr'])test('non-TTY '+stream+' fails closed before hidden inputs',async()=>{const x=setup();x.term[stream].isTTY=false;await assert.rejects(prepareBundle(options(x),x.deps));assert.equal(x.reads.length,0);});
for(const kind of ['publishable','password'])test('hidden '+kind+' input uses raw no-echo sink and restores terminal',async()=>{
 const t=terminal(),p=hiddenInput(kind,t);assert.equal(t.stdin.isRaw,true);t.stdin.write('OFFLINE_ONLY_INPUT漢字\r');assert.ok(await p==='OFFLINE_ONLY_INPUT漢字');assert.equal(t.stdin.isRaw,false);assert.ok(!t.out.includes('OFFLINE_ONLY_INPUT'));assert.equal(t.err,'');assert.ok(t.out.includes(kind==='password'?'Existing nca_push_api password':'Project Supabase publishable key'));
});
test('hidden input Ctrl-C, EOF, failed raw mode and invalid prompt kind do not fall back',async()=>{
 for(const input of [null,'\x03']){const t=terminal(),p=hiddenInput('password',t);if(input)t.stdin.write(input);else t.stdin.end();await assert.rejects(p,/HIDDEN_INPUT_FAILED/);assert.equal(t.stdin.isRaw,false);}
 const t=terminal();t.stdin.setRawMode=()=>{};await assert.rejects(hiddenInput('password',t));assert.throws(()=>hiddenInput('untrusted',terminal()));
});
test('existing bundle and dangling link are never overwritten; no prompts',async()=>{
 for(const link of [false,true]){const x=setup();fs.mkdirSync(path.dirname(x.target),{mode:0o700});if(link)fs.symlinkSync(path.join(x.home,'missing'),x.target);else fs.writeFileSync(x.target,'ORIGINAL',{mode:0o600});await assert.rejects(prepareBundle(options(x),x.deps));assert.equal(x.reads.length,0);if(!link)assert.equal(fs.readFileSync(x.target,'utf8'),'ORIGINAL');else assert.ok(fs.lstatSync(x.target).isSymbolicLink());}
});
test('inside-repo, lexical traversal, wrong basename, relative output and symlink alias fail before input',async()=>{
 const x=setup(),alias=path.join(x.home,'repo-alias');fs.symlinkSync(root,alias,'dir');
 for(const output of [path.join(root,'push-subscription-api-secrets.json'),path.join(alias,'push-subscription-api-secrets.json'),x.home+'/alias/../private/push-subscription-api-secrets.json','relative/push-subscription-api-secrets.json',path.join(x.home,'personal-push-sender-secrets.json')])await assert.rejects(prepareBundle({...options(x),output},x.deps));assert.equal(x.reads.length,0);
});
test('insecure existing directory / wrong POSIX owner not repaired',async()=>{const x=setup();fs.mkdirSync(path.dirname(x.target),{mode:0o755});fs.chmodSync(path.dirname(x.target),0o755);await assert.rejects(prepareBundle(options(x),x.deps));fs.chmodSync(path.dirname(x.target),0o700);await assert.rejects(prepareBundle(options(x),{...x.deps,uid:()=>process.getuid()+1}));assert.equal(x.reads.length,0);});
for(const replacement of ['symlink','ordinary-directory','file-race'])test('replacement during hidden input: '+replacement+' never writes/truncates another object',async()=>{
 const x=setup(),other=fs.mkdtempSync(path.join(directory,'other-'));
 await assert.rejects(prepareBundle(options(x),{...x.deps,readPassword:async()=>{if(replacement==='file-race')fs.writeFileSync(x.target,'USER_FILE',{flag:'wx',mode:0o600});else{fs.renameSync(path.dirname(x.target),path.dirname(x.target)+'.old');if(replacement==='symlink')fs.symlinkSync(other,path.dirname(x.target),'dir');else fs.mkdirSync(path.dirname(x.target),{mode:0o700});}return password;}}));
 if(replacement==='file-race')assert.equal(fs.readFileSync(x.target,'utf8'),'USER_FILE');else assert.ok(!fs.existsSync(x.target));
});
test('Windows reused ACL sequence secures EMPTY output before any values and verifies after fsync (mocked)',async()=>{
 const x=setup(),calls=[];await prepareBundle(options(x),{...x.deps,platform:'win32',uid:undefined,acl:(p,kind,action)=>{calls.push([kind,action,kind==='File'?fs.statSync(p).size:null]);if(kind==='File'&&action==='Apply')assert.equal(fs.statSync(p).size,0);}});
 assert.deepEqual(calls[0],['Directory','Apply',null]);const files=calls.filter(c=>c[0]==='File');assert.deepEqual(files.slice(0,2),[['File','Apply',0],['File','Verify',0]]);assert.equal(files.at(-1)[1],'Verify');assert.ok(files.at(-1)[2]>0);
});
for(const stage of ['directory','apply','first-verify','final-verify'])test('Windows '+stage+' failure is fatal, sanitized and no permission fallback (mocked)',async()=>{
 const x=setup();let checks=0;const code=await main(['--ca-file',x.caFile],{...x.deps,platform:'win32',acl:(p,kind,action)=>{if(kind==='File'&&action==='Verify')checks++;if((kind==='Directory'&&stage==='directory')||(kind==='File'&&action==='Apply'&&stage==='apply')||(kind==='File'&&action==='Verify'&&checks===(stage==='first-verify'?1:2)&&['first-verify','final-verify'].includes(stage)))throw Error('PRIVATE '+password);}});
 assert.equal(code,1);assert.ok(!fs.existsSync(x.target));assert.equal(x.term.out,'');assert.equal(x.term.err,'PUSH_API_SECRET_PREPARATION_FAILED — NO_VALUES_PRINTED\n');
});
test('post-create replacement is not removed by failure cleanup',async()=>{const x=setup();await assert.rejects(prepareBundle(options(x),{...x.deps,platform:'win32',acl:(p,kind,action)=>{if(kind==='File'&&action==='Apply'){fs.unlinkSync(p);fs.writeFileSync(p,'REPLACEMENT');}}}));assert.equal(fs.readFileSync(x.target,'utf8'),'REPLACEMENT');});
test('successful CLI prints only path/field names; never bundle, password, key or CA values',async()=>{
 const x=setup();assert.equal(await main(['--ca-file',x.caFile],x.deps),0);
 assert.equal(x.term.out,'PUSH_API_PRIVATE_BUNDLE_CREATED — VALUES_NOT_PRINTED\n'+x.target+'\nFIELDS='+fields.join(',')+'\n');assert.equal(x.term.err,'');
 const b=JSON.parse(fs.readFileSync(x.target));for(const value of [password,publicKey,...Object.values(b),f.testCA.pem])assert.ok(!x.term.out.includes(value));
});
for(const args of [[],['password'],['--ca-file'],['--ca-file','x','PASSWORD'],['--password','x'],['--ca-file','x','--publishable-key','PUBLIC']])test('CLI rejects extra/credential arguments before prompting',async()=>{const x=setup();assert.equal(await main(args,x.deps),1);assert.equal(x.reads.length,0);assert.equal(x.term.out,'');});
test('existing sender bundle is not read/modified, API bundle has no sender/worker/VAPID fields',async()=>{
 const x=setup(),p=path.join(x.home,'.nca-personal-push-private');fs.mkdirSync(p,{mode:0o700});const sender=path.join(p,'personal-push-sender-secrets.json');fs.writeFileSync(sender,'DO_NOT_TOUCH',{mode:0o600});await prepareBundle(options(x),x.deps);assert.equal(fs.readFileSync(sender,'utf8'),'DO_NOT_TOUCH');const b=JSON.parse(fs.readFileSync(x.target));assert.deepEqual(Object.keys(b),fields);
});
test('reused PowerShell helper receives only non-secret path/ACL data, no inherited credentials',()=>{
 let call;windowsAcl('C:\\Users\\OFFLINE\\private\\push-subscription-api-secrets.json','File','Verify',{env:{SystemRoot:'C:\\Windows',PGPASSWORD:password,NCA_PUSH_API_DATABASE_URL:'PRIVATE'},spawn:(file,args,options)=>{call={file,args,options};return {status:0,stdout:'ACL_OK'};}});
 assert.equal(call.options.env.PGPASSWORD,undefined);assert.equal(call.options.env.NCA_PUSH_API_DATABASE_URL,undefined);assert.ok(!JSON.stringify(call).includes(password));assert.equal(Buffer.from(call.args.at(-1),'base64').toString('utf16le'),WINDOWS_ACL);assert.equal(call.options.shell,false);
});
test('password operation has one hidden API-only change and no other persistent mutation/plaintext path',()=>{
 const sql=fs.readFileSync(path.join(root,'database/operations/20261021_push_api_password.psql'),'utf8');
 assert.equal((sql.match(/^\\password nca_push_api$/gm)||[]).length,1);assert.equal((sql.match(/^\\password /gm)||[]).length,1);
 for(const text of ['\\set ON_ERROR_STOP on','\\set ECHO none','\\set ECHO_HIDDEN off','\\set HISTFILE /dev/null',"SET LOCAL password_encryption='scram-sha-256'", "CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'", "server_version_num')<>'170011'",'pg_catalog.pg_stat_ssl','NOT target.rolcanlogin','target.rolinherit','target.rolbypassrls','m.grantor=10','m.admin_option AND NOT m.inherit_option AND NOT m.set_option',"pg_catalog.to_jsonb(r)-'rolpassword'",'\\gset nca_api_before_','\\if :nca_api_after_matches\nCOMMIT;\nSELECT \'PUSH_API_CREDENTIAL_CHANGE_COMPLETE\''])assert.ok(sql.includes(text),text);
 const code=sql.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");assert.doesNotMatch(code,/\b(?:INSERT|UPDATE|DELETE|MERGE|COPY|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|EXECUTE|PERFORM)\b|SET ROLE|pg_authid|pg_cancel_backend|pg_terminate_backend/i);
 assert.doesNotMatch(code,/nca_push_sender|PGPASSWORD|HOUSE_PASSWORD|\\prompt|\\!|\\include|\\connect/);
 assert.match(sql,/ONE-TIME/);assert.match(sql,/consumes this operation permanently/);
});
test('V4 creation evidence and protected runtime/sender source stay byte-for-byte unchanged',()=>{
 const sql=fs.readFileSync(path.join(root,'database/migrations/20261020_push_subscription_lifecycle_install_v4.sql'),'utf8');assert.match(sql,/CREATE ROLE nca_push_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL;/);
 for(const name of ['server/push-api.cjs','server/push-db.cjs','server/push-validation.cjs','api/push-subscriptions.js','scripts/personal-push-secret-security.cjs','scripts/prepare-personal-push-sender-secrets.cjs','database/operations/20261021_personal_push_sender_password.psql'])assert.ok(fs.readFileSync(path.join(root,name)).equals(execFileSync('git',['show','7cbff43c2bc182e82f1fd9d185e8f8442f4cfd7e:'+name],{cwd:root})),name);
 assert.equal(crypto.createHash('sha256').update(sql).digest('hex'),'6b6a4ae9336651f8f45c025e8884db9f657c14ffa470284b2bde7f9ab8b1fa7f');
});
test('helper import/source is offline, no random/password generation, env password, subprocess secret or runtime mutation',()=>{
 const source=fs.readFileSync(path.join(root,'scripts/prepare-push-subscription-api-secrets.cjs'),'utf8');
 assert.doesNotMatch(source,/randomBytes|randomUUID|generateVAPID|createDatabase\(|new Pool|\.connect\(|fetch\(|https?\.request|process\.env|console\.|child_process|spawn\(/);
 assert.match(source,/if \(require\.main === module\)/);assert.match(source,/databaseConfig\(\{NCA_PUSH_API_DATABASE_URL:url, NCA_PUSH_API_CA_CERT_B64:caB64\}\)/);
 const api=fs.readFileSync(path.join(root,'server/push-api.cjs'),'utf8');assert.ok(api.includes("key.length > 512 || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)"));assert.ok(source.includes("publishable.length > 512 || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishable)"));
 assert.equal(execFileSync('git',['check-ignore','--no-index','push-subscription-api-secrets.json'],{cwd:root,encoding:'utf8'}).trim(),'push-subscription-api-secrets.json');
});
test('native POSIX PTY verifies no echo for new helper hidden input (synthetic input, no DB)',()=>{
 const modulePath=path.join(root,'scripts/prepare-push-subscription-api-secrets.cjs'),value='OFFLINE_ONLY_PTY_VALUE',hash=crypto.createHash('sha256').update(value).digest('hex');
 const node=`require('node:net').Socket.prototype.connect=()=>{throw Error('NETWORK_FORBIDDEN')};require(${JSON.stringify(modulePath)}).hiddenInput('password').then(value=>{if(require('node:crypto').createHash('sha256').update(value).digest('hex')!==${JSON.stringify(hash)})process.exitCode=1;else process.stdout.write('PTY_OK\\n')}).catch(()=>{process.exitCode=1});`;
 const python=`import os,pty,subprocess,select,termios,time\nmaster,slave=pty.openpty()\np=subprocess.Popen([${JSON.stringify(process.execPath)},'-e',${JSON.stringify(node)}],stdin=slave,stdout=slave,stderr=slave,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'})\nout=b''\ndeadline=time.monotonic()+8\ntry:\n while b'NOT admin or sender password): ' not in out:\n  assert time.monotonic()<deadline,'prompt timeout'\n  if select.select([master],[],[],0.1)[0]:out+=os.read(master,4096)\n assert not (termios.tcgetattr(slave)[3]&termios.ECHO),'echo enabled'\n os.write(master,${JSON.stringify(value)}.encode()+b'\\r')\n while p.poll() is None:\n  assert time.monotonic()<deadline,'completion timeout'\n  if select.select([master],[],[],0.1)[0]:out+=os.read(master,4096)\n while select.select([master],[],[],0)[0]:out+=os.read(master,4096)\n assert p.returncode==0 and b'PTY_OK' in out,'bad result'\n assert ${JSON.stringify(value)}.encode() not in out,'input leaked'\n print('PTY_PASS')\nfinally:\n if p.poll() is None:p.kill();p.wait()\n os.close(master);os.close(slave)\n`;
 const r=spawnSync('python3',['-'],{input:python,encoding:'utf8',timeout:12000,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'}});assert.ifError(r.error);assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'PTY_PASS');
});
