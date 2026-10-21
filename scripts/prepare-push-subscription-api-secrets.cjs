'use strict';

// OFFLINE operator helper. Import does nothing; no key/password generation or DB calls.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const readline = require('node:readline');
const {Writable} = require('node:stream');
const {databaseConfig} = require('../server/push-db.cjs');
const {decodeSenderCA} = require('../server/personal-push-db.cjs');
const {windowsAcl, noLinks, sameFile} = require('./personal-push-secret-security.cjs');
const FIELDS = Object.freeze(['NCA_PUSH_API_DATABASE_URL','NCA_PUSH_API_CA_CERT_B64','NCA_PUSH_API_AUTH_PUBLISHABLE_KEY']);
function requireTTY(terminal) {
  if (!terminal.stdin.isTTY || !terminal.stdout.isTTY || !terminal.stderr.isTTY ||
    typeof terminal.stdin.setRawMode !== 'function' || terminal.stdin.isRaw) throw Error('PRIVATE_TTY_REQUIRED');
}
function hiddenInput(kind, terminal = process) {
  requireTTY(terminal);
  const label = kind === 'publishable' ? 'Project Supabase publishable key (hidden; sb_publishable_ only): ' :
    kind === 'password' ? 'Existing nca_push_api password (hidden; NOT admin or sender password): ' : null;
  if (!label) throw Error('HIDDEN_INPUT_FAILED');
  return new Promise((resolve, reject) => {
    const sink = new Writable({write(_chunk, _encoding, done) { done(); }});
    sink.isTTY = true; sink.columns = terminal.stdout.columns || 80;
    let rl, settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (rl) { rl.line = ''; rl.history.length = 0; rl.close(); }
      sink.end(); terminal.stdout.write('\n');
      if (error) reject(Error('HIDDEN_INPUT_FAILED')); else resolve(value);
    };
    try {
      rl = readline.createInterface({input:terminal.stdin, output:sink, terminal:true, historySize:0, crlfDelay:Infinity});
      if (!terminal.stdin.isRaw) throw Error();
      rl.once('line', value => finish(!value, value));
      rl.once('SIGINT', () => finish(true));
      rl.once('error', () => finish(true));
      rl.once('close', () => { if (!settled) finish(true); });
      terminal.stdout.write(label);
    } catch { finish(true); }
  });
}
async function prepareBundle({caFile, output} = {}, dependencies = {}) {
  const {terminal = process, home = os.homedir(), platform = process.platform,
    uid = process.getuid, acl = windowsAcl,
    readPublishable = () => hiddenInput('publishable', terminal),
    readPassword = () => hiddenInput('password', terminal)} = dependencies;
  let fd, target, password, publishable;
  try {
    requireTTY(terminal);
    if (!path.isAbsolute(home) || typeof caFile !== 'string' || !path.isAbsolute(caFile)) throw Error();
    noLinks(path.dirname(caFile));
    let caFD, caB64;
    try {
      if (!fs.lstatSync(caFile).isFile()) throw Error();
      caFD = fs.openSync(caFile, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      sameFile(caFD, caFile);
      if (fs.fstatSync(caFD).size > 12288) throw Error();
      const bytes = Buffer.alloc(12289), count = fs.readSync(caFD, bytes, 0, bytes.length, 0);
      if (count > 12288) throw Error();
      caB64 = bytes.subarray(0,count).toString('base64');
      decodeSenderCA(caB64); sameFile(caFD, caFile);
    } finally { if (caFD !== undefined) fs.closeSync(caFD); }
    output = output || path.join(home, '.nca-push-api-private', 'push-subscription-api-secrets.json');
    if (typeof output !== 'string' || !path.isAbsolute(output) || path.normalize(output) !== output || path.basename(output) !== 'push-subscription-api-secrets.json') throw Error();
    const parent = path.dirname(output), repo = fs.realpathSync(path.join(__dirname, '..'));
    const inside = p => { const rel = path.relative(repo,p); return rel === '' || (rel !== '..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel)); };
    if (inside(parent)) throw Error();
    noLinks(path.dirname(parent));
    let created = false;
    try { fs.lstatSync(parent); } catch (error) { if (error.code !== 'ENOENT') throw error; fs.mkdirSync(parent,{mode:0o700}); created = true; }
    noLinks(parent);
    if (inside(fs.realpathSync(parent))) throw Error();
    const identity = fs.lstatSync(parent,{bigint:true});
    const checkDirectory = () => {
      noLinks(parent);
      const now = fs.lstatSync(parent,{bigint:true});
      if (now.ino === 0n || now.dev !== identity.dev || now.ino !== identity.ino) throw Error();
      if (platform === 'win32') acl(parent,'Directory','Verify');
      else { const stat = fs.statSync(parent); if (typeof uid !== 'function' || stat.uid !== uid() || (stat.mode & 0o077)) throw Error(); }
    };
    if (platform === 'win32' && created) acl(parent,'Directory','Apply');
    checkDirectory(); target = path.join(parent,path.basename(output));
    try { fs.lstatSync(target); throw Error('ALREADY_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    publishable = await readPublishable();
    // Exact current API verifier config check, without invoking Auth/network.
    if (typeof publishable !== 'string' || publishable.length > 512 || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishable)) throw Error();
    password = await readPassword();
    if (typeof password !== 'string' || !password) throw Error();
    const url = 'postgresql://nca_push_api.cwwulyrutdvuekydydew:' + encodeURIComponent(password) + '@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
    databaseConfig({NCA_PUSH_API_DATABASE_URL:url, NCA_PUSH_API_CA_CERT_B64:caB64}); // Pure offline configuration only.
    password = undefined;
    checkDirectory();
    fd = fs.openSync(target, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
    sameFile(fd,target);
    if (platform === 'win32') acl(target,'File','Apply'); // EMPTY file only, before values.
    const checkFile = () => {
      checkDirectory(); sameFile(fd,target);
      if (platform === 'win32') acl(target,'File','Verify');
      else { const stat = fs.fstatSync(fd); if (stat.uid !== uid() || (stat.mode & 0o777) !== 0o600) throw Error(); }
      sameFile(fd,target);
    };
    checkFile();
    const bundle = {NCA_PUSH_API_DATABASE_URL:url, NCA_PUSH_API_CA_CERT_B64:caB64, NCA_PUSH_API_AUTH_PUBLISHABLE_KEY:publishable};
    fs.writeFileSync(fd, JSON.stringify(bundle,null,2)+'\n', 'utf8');
    fs.fsyncSync(fd); checkFile(); fs.closeSync(fd); fd = undefined;
    return target;
  } catch {
    if (fd !== undefined) {
      try { fs.ftruncateSync(fd,0); } catch {}
      try { sameFile(fd,target); fs.unlinkSync(target); } catch {}
      try { fs.closeSync(fd); } catch {}
    }
    throw Error('PUSH_API_SECRET_PREPARATION_FAILED');
  } finally { password = undefined; publishable = undefined; }
}
async function main(args = process.argv.slice(2), dependencies = {}) {
  const terminal = dependencies.terminal || process;
  try {
    if (args.length !== 2 || args[0] !== '--ca-file') throw Error();
    const output = await prepareBundle({caFile:args[1]}, dependencies);
    terminal.stdout.write('PUSH_API_PRIVATE_BUNDLE_CREATED — VALUES_NOT_PRINTED\n'+output+'\nFIELDS='+FIELDS.join(',')+'\n');
    return 0;
  } catch { terminal.stderr.write('PUSH_API_SECRET_PREPARATION_FAILED — NO_VALUES_PRINTED\n'); return 1; }
}
if (require.main === module) main().then(code => { process.exitCode = code; });
module.exports = {prepareBundle, hiddenInput, main};
