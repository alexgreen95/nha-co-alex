'use strict';
// Non-secret filesystem/ACL operations only. Never pass bundle/password to this module.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const WINDOWS_ACL = String.raw`
$ErrorActionPreference = 'Stop'
try {
 $p = $env:NCA_SECRET_PATH
 $kind = $env:NCA_SECRET_KIND
 $action = $env:NCA_SECRET_ACTION
 if ($kind -notin @('File','Directory') -or $action -notin @('Apply','Verify')) { throw 'invalid' }
 # Reject every reparse-point component, including junctions/ancestor aliases.
 $cursor = $p
 while ($cursor) {
  $entry = Get-Item -LiteralPath $cursor -Force
  if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'reparse' }
  $parent = [IO.Directory]::GetParent($cursor)
  $cursor = if ($parent) { $parent.FullName } else { $null }
 }
 $item = Get-Item -LiteralPath $p -Force
 if ($item.PSIsContainer -ne ($kind -eq 'Directory')) { throw 'kind' }
 $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
 if ($action -eq 'Apply') {
  if ($kind -eq 'File') {
   if ($item.Length -ne 0) { throw 'not empty' }
   $acl = [Security.AccessControl.FileSecurity]::new()
   $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow)
  } else {
   if (@(Get-ChildItem -LiteralPath $p -Force).Count -ne 0) { throw 'not empty' }
   $acl = [Security.AccessControl.DirectorySecurity]::new()
   $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
  }
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true,$false)
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $p -AclObject $acl
 }
 $acl = Get-Acl -LiteralPath $p
 $rules = @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
 if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or -not $acl.AreAccessRulesProtected -or $rules.Count -ne 1) { throw 'acl' }
 $r = $rules[0]
 $inherit = if ($kind -eq 'Directory') { [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit } else { [Security.AccessControl.InheritanceFlags]::None }
 if ($r.IdentityReference.Value -ne $sid.Value -or $r.IsInherited -or $r.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or $r.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or $r.InheritanceFlags -ne $inherit -or $r.PropagationFlags -ne [Security.AccessControl.PropagationFlags]::None) { throw 'rule' }
 [Console]::Out.Write('ACL_OK')
} catch { exit 1 }
`;

function windowsAcl(target, kind, action, {spawn = spawnSync, env = process.env} = {}) {
  const systemRoot = env.SystemRoot;
  if (typeof systemRoot !== 'string' || !path.win32.isAbsolute(systemRoot) || /[\x00-\x1f\x7f]/.test(systemRoot)) throw Error('ACL_FAILED');
  const powershell = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const childEnv = {SystemRoot: systemRoot, WINDIR: systemRoot,
    PSModulePath: path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','Modules'),
    NCA_SECRET_PATH: target, NCA_SECRET_KIND: kind, NCA_SECRET_ACTION: action};
  const result = spawn(powershell, ['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(WINDOWS_ACL,'utf16le').toString('base64')],
    {env: childEnv, shell: false, encoding: 'utf8', timeout: 10000, maxBuffer: 4096, windowsHide: true});
  if (result.error || result.status !== 0 || result.stdout !== 'ACL_OK') throw Error('ACL_FAILED');
}

function noLinks(target) {
  let cursor = path.resolve(target);
  while (true) {
    const entry = fs.lstatSync(cursor);
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw Error('UNSAFE_DIRECTORY');
    const next = path.dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }
}
function sameFile(fd, target) {
  const held = fs.fstatSync(fd, {bigint: true}), named = fs.lstatSync(target, {bigint: true});
  if (!held.isFile() || !named.isFile() || named.isSymbolicLink() || held.ino === 0n || held.dev !== named.dev || held.ino !== named.ino || held.nlink !== 1n || named.nlink !== 1n) throw Error('FILE_IDENTITY_CHANGED');
}
module.exports = {windowsAcl, WINDOWS_ACL, noLinks, sameFile};
