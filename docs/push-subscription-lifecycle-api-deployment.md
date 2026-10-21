# Fresh subscription lifecycle API — future deployment gates

This local server implementation follows
`docs/push-subscription-lifecycle-api-contract-v1.md`. It does not restore historical
source. Installed V4 SHA256 remains
`6b6a4ae9336651f8f45c025e8884db9f657c14ffa470284b2bde7f9ab8b1fa7f`;
do not reinstall it or rerun consumed provisioning/migration operations.

No deployment, push, credentials, production DB/SQL/RPC, frontend integration or
real Web Push is authorized by this document. Tests use synthetic values and fake
Auth/pg/network boundaries. Sender/fanout/preferences and existing auth are unchanged.

## Only three new server configuration variables

The tracked `.env.push-subscriptions.example` is placeholders only. Future operator
configuration must be server-only, private and separately authorized. Never print
values, copy them into tracked files, use NEXT_PUBLIC/VITE prefixes or send them
to browsers. Existing `.env*` local files remain gitignored. The offline helper
never generates/provisions a password; only the separately authorized future
one-time direct-admin operation below may set it.

| Name | Classification | Required profile |
| --- | --- | --- |
| NCA_PUSH_API_DATABASE_URL | Secret | Exact postgresql: Session Pooler URI, wire user nca_push_api.cwwulyrutdvuekydydew, host aws-0-ap-northeast-2.pooler.supabase.com, explicit port 5432, database postgres, existing role password encoded in password component, no query/fragment |
| NCA_PUSH_API_CA_CERT_B64 | Config / trust anchor | Canonical standard base64 of one independently trusted Supabase PEM CA; same strict validator as reviewed sender CA, decoded into explicit ssl.ca, verification true and minimum TLS1.2 |
| NCA_PUSH_API_AUTH_PUBLISHABLE_KEY | Public Config | This project's public Supabase publishable key (sb_publishable_ form), never sb_secret_, service-role JWT, admin password or worker credential |

API DB role/backend identity must be nca_push_api for BOTH current_user and
session_user. No direct/admin route, Transaction Pooler port 6543, sender identity,
privileged key or relaxed TLS fallback is supported. This is a runtime profile,
not authorization to provision it through any administrative route.

## A — Future one-time DIRECT ADMIN password operation (NOT EXECUTED)

V4 creates nca_push_api LOGIN PASSWORD NULL, with NOINHERIT/NOSUPERUSER/NOCREATEDB/
NOCREATEROLE/NOREPLICATION/NOBYPASSRLS. Only CONNECT, public USAGE and the six
lifecycle EXECUTE grants are intended; browser roles have no lifecycle authority.
This is the installed-source contract, not a fresh observation of the production
password. No stored verifier is read by the new operation or by this preparation.

After SEPARATE explicit production authorization, use only
`database/operations/20261021_push_api_password.psql` in interactive native psql
17.x with trusted direct PostgreSQL administrator connectivity. Never SQL Editor,
pooler ADMIN routing, service/API keys or either consumed sender password operation.
If direct connectivity is unavailable, STOP; no transport fallback is authorized.
Keep a private, non-recorded terminal and exclude concurrent privileged role/security
administration through COMMIT. Do not use shell transcripts or CI/logged terminals.

Privately configure a restricted, user-owned libpq service file outside Git. Windows
location: `%APPDATA%\postgresql\.pg_service.conf`; POSIX: `~/.pg_service.conf`.
Service settings contain NO password and must be exactly this direct profile with
an independently trusted, absolute CA-file path substituted locally:

```ini
[nca_push_api_admin]
host=db.cwwulyrutdvuekydydew.supabase.co
port=5432
dbname=postgres
user=postgres
sslmode=verify-full
sslrootcert=<ABSOLUTE_PATH_TO_TRUSTED_SUPABASE_CA_PEM>
gssencmode=disable
```

Require current-user-only write/read access to this external file (restricted NTFS
owner/DACL on Windows; user-owned mode 0600 on POSIX), no password entry or permissive
ancestor/reparse alias. Verify the selected service and CA privately before use.
The SQL guard proves backend TLS/current_user/session_user, NOT client sslmode,
hostname/CA verification or the selected direct hostname. Those remain mandatory
operator preconditions. Do not claim a pooler backend TLS check proves its client leg.

From the approved repo in native PowerShell, the following is a FUTURE command shape,
not an instruction to run now. Require no inherited PG* overrides; check only count,
never print environment values. All command arguments below are non-secret:

```powershell
if (@(Get-ChildItem Env:PG*).Count -ne 0) { throw 'STOP: inherited PG settings must be resolved privately first.' }
psql -X -W -q --dbname='service=nca_push_api_admin gssencmode=disable' --set=ON_ERROR_STOP=1 --file='database/operations/20261021_push_api_password.psql'
```

Sequence: hidden administrator connection-password prompt; PostgreSQL 17.11 / both
identities postgres / TLS / expected API-role LOGIN/attributes/membership guards;
non-secret identity fingerprint; two hidden `\password nca_push_api` prompts for a
new strong, nonempty, UNIQUE API-role password; unchanged-role/membership fingerprint;
COMMIT and `PUSH_API_CREDENTIAL_CHANGE_COMPLETE`. Do not use the sender/admin password
as the API password. The only persistent mutation is this role's password. The SQL
uses SCRAM-SHA-256, empty search_path, timeouts, ON_ERROR_STOP, suppressed echo/history
and no plaintext password variable/query. Never supply passwords on argv, in normal
environment variables, tracked files, chat or screen/log captures.

After COMMIT + marker, record success privately: the operation is CONSUMED and must
NEVER be rerun. It does not durably set an external consumed flag or inspect password
NULL state; one-time execution is an operator gate. Any error, cancellation, timeout,
metadata drift, disconnect or missing marker means STOP, no automatic retry, no new
credential attempt and no disclosure of logs/credentials. A pre-COMMIT error aborts
the transaction; disconnect rolls it back. If COMMIT may already have occurred but
the marker was lost, outcome is uncertain and must be reviewed before any action.

## B — Future OFFLINE private API bundle (NOT GENERATED)

Only AFTER confirmed API-role provisioning, and separate local helper-execution
authorization, use Node >=22 from the approved checkout in a private native terminal:

```powershell
node scripts/prepare-push-subscription-api-secrets.cjs --ca-file '<ABSOLUTE_PATH_TO_EXISTING_TRUSTED_SUPABASE_CA_PEM>'
```

Exactly those two CLI arguments are accepted: flag and absolute CA path. No password,
publishable key, output or env argument is accepted. Both inputs are hidden, in order:

1. `Project Supabase publishable key (hidden; sb_publishable_ only): `
2. `Existing nca_push_api password (hidden; NOT admin or sender password): `

Use the existing dedicated API password exactly; do not generate or rotate it. The
same already-validated Supabase CA and this project's public sb_publishable_ key may
be reused under the NEW lifecycle env names. **NCA_PUSH_API_DATABASE_URL must NEVER
reuse nca_push_sender credentials.** No personal sender bundle/settings/password,
worker secret or VAPID pair is read, modified, generated or rotated. A wrong actual
password cannot be detected offline; this helper proves URL/config structure only.

All streams must be TTYs with working raw/no-echo input. No piped/env input, readline
history, visible fallback or secret subprocess exists. The key is hidden too so an
accidentally pasted service-role/secret key is rejected without shell-history exposure.
Only an sb_publishable_ value passing the exact current API shape/length check can
be written. The CA must be a regular unlinked file <=12,288 bytes; raw bytes are
base64-encoded, strictly validated and preserved, not normalized. No network check,
TLS handshake, Auth call, Pool or DB connection is made by the helper.

Default private output from os.homedir():

- Windows: `%USERPROFILE%\.nca-push-api-private\push-subscription-api-secrets.json`.
- POSIX: `$HOME/.nca-push-api-private/push-subscription-api-secrets.json`.

The bundle has exactly the three env names in the table above. No standalone raw
password field, enable flag or sender/VAPID value. It remains outside Git; its basename
is also gitignored as defense in depth. Do not print/cat it, paste it into chat, move
it into the repo or expose it through clipboard history/backups/transcripts.

Reused security helper: `scripts/personal-push-secret-security.cjs`, unchanged.
The directory must be private/current-user-owned, with no linked/reparse ancestors.
POSIX mode is 0700-equivalent for directory and exact 0600 for file; native Windows
uses the existing protected current-SID-only DACL/owner verification with no chmod
fallback. Secure/verify the EMPTY exclusively created file, write through the same
handle, fsync and reverify identities/ACL. No overwrite, insecure-directory repair,
alternate output or weaker fallback. Failure truncates/removes only its own new file,
never a replacement/existing user file. Same-user/administrator hostile races are
not an access-control guarantee. Windows ACL integration is mocked/static on Linux;
no claim of native Windows execution is made by local tests.

Success prints only `PUSH_API_PRIVATE_BUNDLE_CREATED — VALUES_NOT_PRINTED`, the path
and `FIELDS=` followed by the three env NAMES. Failure prints only
`PUSH_API_SECRET_PREPARATION_FAILED — NO_VALUES_PRINTED`; stop without overwrite/retry.
Plaintext necessarily exists in process memory and the restricted bundle; secure
memory/SSD erasure is not claimed. No Vercel environment value is set by this helper.

No deployment until all three values and separately approved credentials/configuration
are present. There is no lifecycle enable flag: missing Auth key is not a global
disable switch for anonymous-compatible status/release. Keep this release gated;
do not run API production smoke until separately authorized.

## Gates before any later release

- Record the exact reviewed local implementation commit, targeted test results and
  independent review. A local commit does not authorize deployment.
- Obtain separately approved nca_push_api credential/configuration evidence without
  exposing secrets. No credential existence or route reachability is claimed here.
- The future Vercel configuration must allow at least 30 seconds for this function;
  no vercel.json change is made now. Handler budget is 25s, Auth verification <=2s,
  DB connection <=2s, each query <=7s and remaining budget. Mutations require >=7s
  remaining; server statement/lock timeouts are 5s/2s.
- Confirm the deployed runtime supplies the original IncomingMessage raw body stream
  and rawHeaders, enforcing a 16KiB raw-byte input cap. The implementation deliberately
  does not trust a pre-parsed req.body or reserialize it to claim a raw-byte bound;
  unavailable/consumed raw data fails closed. Platform compatibility is a future gate,
  not a claim derived from local mocks. No new diagnostic endpoint is created.
- Keep the exact allowed Origin https://nha-co-alex.vercel.app. Preview/custom/localhost
  aliases are not authorized API origins. All six operations are POST JSON only;
  no direct lifecycle PostgREST browser bridge or CORS relaxation exists.
- Browser service worker/permission/subscription UI/Web Lock sequencing is a future
  separate task. This API creates no browser integration or test data.
- A future production runtime smoke must have explicit authorization and a bounded
  approved plan. Some operations mutate rows; do not label them read-only or invoke
  them merely because deployment succeeded. Real push remains independently gated.

Errors expose only allowlisted public codes. No raw cookies, capabilities, auth
tokens, CA, credentials, DB messages, user UUIDs or subscription material are logged
or returned as JSON. A successful creation/recovery alone sends its required secret
in the HttpOnly cookie. Error responses never issue/delete/rotate it. Ambiguous
mutations are OUTCOME_UNKNOWN, not permission to retry or reset a binding.
