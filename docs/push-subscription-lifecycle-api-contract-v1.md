# Web Push subscription lifecycle API — fresh contract v1

Verdict: **CONTRACT CLOSED FOR IMPLEMENTATION**; focused document review and final
narrow re-review passed as recorded below. This authorizes later local implementation planning only,
not deployment, credentials, database changes or browser integration execution.

## 1. Scope, provenance and fixed database boundary

This is a NEW contract, not historical behavior or reconstructed source. The
historical API/test bytes are permanently unavailable. The earlier evidence-only
document `docs/push-subscription-lifecycle-fresh-contract.md` at commit
`105f9bace7b7f8092f09d1270fa545976a736fc1` remains an accurate record of its then-open
decisions. This document closes those decisions prospectively, without editing it.

The authoritative installed/consumed DB contract is
`database/migrations/20261020_push_subscription_lifecycle_install_v4.sql`, SHA256
`6b6a4ae9336651f8f45c025e8884db9f657c14ffa470284b2bde7f9ab8b1fa7f`.
Its signatures, states, constraints, errors, role authority and recovery prerequisite
are unchanged. All six return scalar jsonb, are postgres-owned SECURITY DEFINER
with empty search_path; GET is STABLE, mutations VOLATILE. EXECUTE belongs only to
postgres and nca_push_api, not PUBLIC/anon/authenticated/service_role/authenticator.
No direct browser table access or lifecycle PostgREST invocation is permitted.

The runtime is CommonJS Vercel Node >=22 with existing pg 8.16.3. Node crypto/HTTPS
built-ins suffice; no new dependency, migration, helper function, schema/RLS/grant
change or privileged DB credential is required by this design. Existing sender,
fanout, auth coordinator, house gate and reader/comment behavior are outside scope.

Every normative choice in sections 2–10, including their tables and schemas, has
this provenance: **NEW FRESH-CONTRACT DECISION — NOT HISTORICAL EVIDENCE**.
Statements explicitly attributed to V4 retain their existing DB provenance.

## 2. Installation and capability

**NEW FRESH-CONTRACT DECISION — NOT HISTORICAL EVIDENCE**

- Only the server generates installation IDs, using Node crypto.randomUUID():
  canonical lowercase UUIDv4, including RFC variant bits. No client-chosen ID on
  create; subsequent request installation_id must match that grammar exactly.
- Generate 32 cryptographically random capability bytes with crypto.randomBytes(32),
  256 bits of entropy. Encode as canonical unpadded base64url, exactly 43 characters;
  decode/length/re-encode equality is required. Never use UUIDs, passwords, JWTs,
  Math.random, timestamps or deterministic test values as capability material.
- DB input is SHA-256 of the decoded 32 raw capability bytes, exactly ONCE. Pass
  the resulting 32-byte Buffer as bytea parameter. Do not hash the base64url string,
  do not double-hash the stored digest, and do not send a raw token to V4. V4 itself
  performs no hashing. Never accept a digest from request JSON.
- The installation ID inside the cookie must equal request installation_id before
  GET or mutation. A digest valid for one row cannot authorize a different row.
- Creation issues a new capability. Reserve/activate/release keep it unchanged.
  Recover generates an independent new capability and stores its new digest.
  Old raw capability becomes invalid when recovery commits. No token is returned
  in JSON, logs, URLs, localStorage or JS-accessible configuration.
- This is a per-browser-installation bearer capability, not an account credential.
  Possession permits status and revocation, while binding delivery to an account
  additionally requires verified auth. Separate device/browser storage installations
  share neither capability nor installation IDs. Sequential accounts on the SAME
  installation intentionally reuse its capability/ID, but always use fresh binding
  generations. One browser profile/origin has one current cookie; an installed PWA
  and browser sharing that cookie jar are one logical installation, not two IDs per
  OS shortcut. Do not claim storage isolation an OS/browser does not provide.
- Cookie expiry is browser retention, NOT DB-side token expiration: V4 has no
  expiry predicate. Release does not invalidate the capability digest. Only actual
  digest rotation/removal makes a copied old capability unusable; do not claim otherwise.

## 3. Exact cookie contract

**NEW FRESH-CONTRACT DECISION — NOT HISTORICAL EVIDENCE**

Name: `__Host-nca_push_installation`.
Value: `<canonical-installation-uuidv4>.<canonical-43-character-base64url-capability>`.
No URL/percent decoding, quotes, padding, controls or extra separators are allowed.

Attributes are exactly: `Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`.
Domain and Expires are absent; it is host-only, with the __Host prefix rules.
Creation/recovery overwrite only this exact name/path/host after confirmed DB
success. They never affect nha_gate, Supabase auth cookies/storage or other devices.
Status/reserve/activate/release do not issue, refresh, rotate or delete a cookie.

Parse Cookie by exact case-sensitive name; ignore unrelated cookies. More than one
occurrence of this name is invalid (403 INVALID_CAPABILITY), never first/last-wins.
The whole Cookie header is capped at 16,384 bytes; oversized is 431 HEADERS_TOO_LARGE.
A malformed target cookie is 403 INVALID_CAPABILITY with no DB call. A required but
absent cookie is the same 403 class. Never echo cookie/header contents.

No API error clears a cookie: an older failed concurrent response must not delete
a successful newer cookie. No general-purpose forget/reset endpoint exists. If an
explicit future operator action deletes it, deletion must use the same name/path/
host and Secure/HttpOnly/SameSite attributes with Max-Age=0, no Domain; such deletion
is not subscription revocation and is not part of the operation whitelist below.

Only explicit, authenticated create may bootstrap without a cookie. If create has a syntactically
valid existing cookie, first GET using that cookie's ID/digest. Successful GET returns
the existing installation, 200, unchanged cookie and no mutation, regardless of state.
If GET specifically returns PT403 (unverifiable/absent old installation), create may
make ONE entirely new unbound row and replace the cookie after success. Missing
cookie also permits that one insertion. Malformed/duplicate cookie does NOT trigger
this fallback. DB/network failures do not trigger it. No automatic create on status.

Concurrent fresh creates can produce separate unbound rows; there is no DB idempotency
key or claim of exactly-once HTTP delivery. A stale response's ID cannot control the
cookie-selected installation. The future browser must serialize create across tabs;
if it detects an ID/cookie mismatch, explicitly create once to rediscover a valid
cookie-selected row, rather than rebinding an arbitrary ID.

## 4. Origin, transport and request handling

**NEW FRESH-CONTRACT DECISION — NOT HISTORICAL EVIDENCE**

- Sole production Origin: `https://nha-co-alex.vercel.app`. Exact byte equality only;
  no other origin, wildcard, suffix match, localhost, preview/immutable URL, extra
  slash, explicit port, alternate casing or request-Host-derived value is allowed.
- Require exactly one Origin header value. Missing, literal null, malformed,
  duplicated or list/comma-valued Origin returns 403 ORIGIN_FORBIDDEN, before auth,
  DB initialization or any cookie issuance. Apply even to status and create.
- HTTPS browser requests are required. Do not derive trust from forwarded headers.
  Secure cookie and fixed Origin are not proof that arbitrary client headers are
  authentic; the capability and verified auth remain required authority.
- Only POST `/api/push-subscriptions`. Other methods, including GET/OPTIONS, return
  405 METHOD_NOT_ALLOWED and `Allow: POST`, no stateful work. No CORS allow-origin or
  allow-credentials headers; same-origin use only. No redirects.
- POST requires media type application/json, optionally charset=utf-8 (case-insensitive
  media type/charset spelling); other parameters/media types yield 415 UNSUPPORTED_MEDIA_TYPE.
  Reject non-identity Content-Encoding. Limit raw body to 16,384 bytes while reading;
  Content-Length alone is not enforcement. Oversized is 413 PAYLOAD_TOO_LARGE.
- Decode UTF-8 fatally, reject BOM; parse one JSON value once, object root only.
  JSON member duplicates use the single JSON.parse result's last-member-wins
  semantics; all validation, dispatch and authorization use ONLY that same parsed
  object. Never authorize a different raw/previous parse representation. Reject
  unknown own keys at every schema level (including __proto__/constructor), wrong
  types, arrays/null roots, trailing non-whitespace, malformed JSON or invalid UTF-8.
  The maximum accepted schema nesting is root -> subscription -> keys; no extensible
  user metadata. Vercel body handling must preserve/enforce the raw-byte limit;
  if unavailable in a runtime configuration, fail closed rather than claim it does.
- All responses, including errors, have `Cache-Control: no-store`, JSON UTF-8 content
  type and `X-Content-Type-Options: nosniff`. No tokens/headers/DB error text are logged.
  Validation errors perform no mutations or cookie changes. No operations by query
  parameter, URL fragment, alternate route or implicit default.

## 5. Server authentication and account authorization

**NEW FRESH-CONTRACT DECISION — NOT HISTORICAL EVIDENCE**

The current frontend uses Supabase OAuth/session access tokens. Do not use nha_gate,
the worker Bearer secret, a refresh token, API/service-role key or unverified JWT
decoding as a user identity. Select remote project Auth verification, not a new
JWT library or improvised local signature verification:

1. Accept a single Authorization header with exact `Bearer <access-token>` spelling
   and one ASCII space. Token grammar is three nonempty unpadded base64url segments
   separated by dots, total token length <=8192 characters, no whitespace/controls.
   This grammar is NOT authentication. Duplicated Authorization headers are 400
   INVALID_REQUEST; any supplied but malformed token is 401 UNAUTHORIZED.
2. Verify EACH supplied token via one HTTPS GET to the fixed URL
   `https://cwwulyrutdvuekydydew.supabase.co/auth/v1/user`, with that Authorization
   and the server-only configuration `NCA_PUSH_API_AUTH_PUBLISHABLE_KEY` as apikey.
   That configuration contains the project's public/publishable key, never admin/
   service-role authority. No secrets are specified or read by this document.
3. Use Node HTTPS with default CA/hostname verification, no redirects, no URL from
   input, no retry, a 2000ms total deadline including response, and a 32,768-byte
   response cap. Credentials go only to that exact host/path. Never forward cookies.
4. Only a 200 JSON user object with canonical lowercase UUID `id` establishes a user;
   take user UUID exclusively from that verified response. Supabase Auth owns token
   signature/expiry/project validation. Discard all user metadata/email; expose/log
   none of the verification response. Do not infer current auth session from client
   account claims or locally decode claims for authority. Remote Auth acceptance is
   the verification policy, not a promise of instantaneous global logout revocation.
5. Auth 400/401/403 is 401 UNAUTHORIZED. Network/TLS/timeout/oversize, unexpected
   status or malformed successful response is 503 UNAVAILABLE, not anonymous fallback.
   No cross-request auth caching, credential refreshing or automatic reauthentication.

Auth is required for create/reserve/activate/recover; optional for status/release.
Whenever supplied, it must pass the verification above before ANY DB work. Missing
required auth is 401. Optional never means invalid supplied auth is ignored.
Origin can be spoofed by non-browser clients; requiring genuine account auth for
creation avoids granting anonymous callers an unrestricted row-creation surface.
It is not a claim that account authentication alone provides volumetric abuse control.

Each existing-installation mutation first performs GET with the cookie digest.
Validate its exact DB result, match request binding_id AND binding_version to the
observed row, then apply account/state rules below before calling the mutator.
Use exactly those observed/matched values. Never replace a stale submitted pair
with fresher values silently. V4's atomic version/pair predicates close the race
between GET and mutation. Reserve only has a version parameter; its monotonically
increasing version still rejects an intervening generation. Bigint overflow fails,
never wraps. A→B→A always has a new binding pair; stale requests cannot reconnect.

| Operation | Account rule after valid capability/GET/pair |
| --- | --- |
| create | Required verified user; creates only an unbound row, never implicitly binds it. For an existing cookie, auth affects redacted ownership classification only |
| status | Optional verified user affects only redacted ownership classification; no binding change |
| reserve | Verified user becomes target owner. Allowed for unbound/disabled, or reserved/active already owned by that user. A row owned by another user gives 409 ACCOUNT_BINDING_CONFLICT; explicit release must precede switching |
| activate | Must be reserved and owned by verified user; different owner gives 409 ACCOUNT_BINDING_CONFLICT, other wrong state 409 STATE_CONFLICT |
| release | Capability + pair alone authorizes revocation/unbinding, including a different owner's row. Auth, when supplied, is verified but owner equality is NOT required. This permits safe logout/account-switch cleanup without letting the caller bind delivery to anyone |
| recover | Must be reserved/active and owned by verified user, with old capability GET checked in this request. Different owner gives 409 ACCOUNT_BINDING_CONFLICT; other wrong state gives 409 STATE_CONFLICT |

Race failures remain conflicts even if the HTTP caller has a valid account. No
client-supplied user_id is accepted. Auth verification is performed before DB calls,
never while holding a DB transaction open. No authenticated account alone can
recover an installation lacking its old capability.

## 6. Frozen HTTP schemas and V4 mapping

**NEW FRESH-CONTRACT DECISION — NOT HISTORICAL EVIDENCE**

Define I = canonical lowercase UUIDv4; B = canonical lowercase UUID string (DB
binding UUID); V = canonical decimal STRING matching `^(0|[1-9][0-9]*)$`, value
0..9223372036854775807 parsed with BigInt, never Number. IDs may not be null.
All request objects have exactly the listed required keys, no optional/extra keys.
Token, digest, user_id, p_context and arbitrary DB function names are never accepted
in JSON. Material M is defined in section 7. Cookie C means a valid target cookie
whose embedded ID matches I. Every operation requires the fixed Origin O.

| Operation | Exact request JSON keys/types | Auth / cookie / Origin | DB mapping | Success |
| --- | --- | --- | --- | --- |
| create | `{operation:"create"}` | Required auth; cookie absent or parsed as section 3; O | Existing cookie: GET(cookie I, digest, 'status'). If absent or that GET returns PT403, generate new I/raw capability and call create(I,new digest) once | 200 existing, 201 new; envelope E below, operation=create. Set cookie only on new confirmed insertion |
| status | `{operation:"status",installation_id:I}` | Optional verified auth; C; O | GET(I,digest,'status') | 200 E, operation=status; never Set-Cookie |
| reserve | `{operation:"reserve",installation_id:I,binding_id:B,binding_version:V}` | Required auth; C; O | GET + checks, then reserve(I,digest,verified user UUID,V) | 200 E; new reserved binding |
| activate | `{operation:"activate",installation_id:I,binding_id:B,binding_version:V,subscription:M}` | Required auth; C; O | GET + checks, then activate(I,digest,B,V,M.endpoint,M.keys.p256dh,M.keys.auth) | 200 E; new active binding |
| release | `{operation:"release",installation_id:I,binding_id:B,binding_version:V,disable:boolean}` | Optional verified auth; C; O | GET + checks, then release(I,digest,B,V,disable) | 200 E; disabled if true, unbound if false |
| recover | `{operation:"recover",installation_id:I,binding_id:B,binding_version:V,subscription:M}` | Required auth; old C; O | GET with OLD digest + pair/owner checks; generate NEW raw capability/digest; recover(I,B,V,verified user UUID,NEW digest,M.endpoint,M.keys.p256dh,M.keys.auth) | 200 E; active with new pair; Set-Cookie with new raw capability only after confirmed success |

GET calls for create/status are read-only; mutators are each dispatched at most
once per request. All SQL is a fixed six-function allowlist with bound typed
parameters, using bytea Buffers and bigint decimal strings. No generic RPC bridge.
No automatic reserve/activate composition inside one HTTP operation.

Success envelope **E**, with exactly these keys:

```text
{ "ok": true, "operation": "<the requested operation>",
  "subscription": { "installation_id": "<I>", "state": "<V4 state>",
    "binding_id": "<B>", "binding_version": "<V>",
    "ownership": "none|self|other|unverified" } }
```

The pipe notation denotes one enum member, not a literal combined string.
Ownership: null DB owner -> none; otherwise no supplied auth -> unverified;
otherwise equality with verified user -> self, else other. Never return owner UUID,
endpoint, keys, capability or digest. Check exact DB S shape/types/state consistency
and expected transition before projecting E; unexpected data is fail-closed, not
passed through. Do not treat a confirmed mutation's result-validation failure as
proof it rolled back; use OUTCOME_UNKNOWN below.

All errors have exactly `{ "ok": false, "error": { "code": "<code>" } }`.
No message, SQLSTATE, DB detail, token, row or original request echo. Selection
order: method -> Origin -> size/content type/JSON/schema -> auth -> cookie ->
DB GET -> submitted pair -> account/state -> mutation. Create's optional cookie
exception is only the explicit section 3 behavior. Header duplication/size checks
must occur before their values are used.

| HTTP | Public code and meaning |
| --- | --- |
| 400 | INVALID_REQUEST: malformed schema/IDs/version/JSON/material, unknown operation/fields or duplicate Authorization |
| 401 | UNAUTHORIZED: missing required, malformed supplied or genuinely invalid supplied auth; include WWW-Authenticate: Bearer |
| 403 | ORIGIN_FORBIDDEN; or INVALID_CAPABILITY for absent/malformed/duplicate/mismatching cookie ID, DB PT403, nonexistent or wrong-capability row (no existence oracle between those DB failures) |
| 405 | METHOD_NOT_ALLOWED, Allow: POST |
| 409 | STATE_CONFLICT for PT409 binding/reservation/recovery/install/overflow conflicts or stale submitted pair; ACCOUNT_BINDING_CONFLICT for explicit account rule; ENDPOINT_CONFLICT for unique endpoint 23505; ACCOUNT_UNAVAILABLE for owner FK 23503 |
| 413 / 415 / 431 | PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE / HEADERS_TOO_LARGE as above |
| 503 | UNAVAILABLE for config, dependency, pool/session/auth-service failure before mutation dispatch; OUTCOME_UNKNOWN for a mutation dispatched without a confirmed valid success or definite SQL error |

An identified create-ID 23505/install conflict is STATE_CONFLICT, not endpoint
disclosure. Invalid-argument SQLSTATE 22023 maps to 400 INVALID_REQUEST. Unexpected
DB codes (including 40001) never trigger retries: UNAVAILABLE if definitely rolled
back, OUTCOME_UNKNOWN if commit outcome cannot be established. Distinguish known
constraint/application SQL errors (statement failed atomically) from transport/
timeout/disconnect or response-write ambiguity; none is a signal to repeat a mutator.

Status is repeatable/read-only. Successful create with a valid cookie rediscovers
the current row; first-time create is not generally idempotent across lost cookies.
With a still-valid cookie, a consumed pair is 409; a replay using the old capability
after recovery fails GET with 403 INVALID_CAPABILITY instead. Neither is fabricated
success or permission to retry. On 409 the client may perform status and reconsider current user intent;
it must not automatically replay old intent with a new pair. No idempotency keys,
background retries or exactly-once claim are added to V4.

## 7. Subscription material M

**NEW FRESH-CONTRACT DECISION — NOT HISTORICAL EVIDENCE**

Exact M shape: `{endpoint:string,keys:{p256dh:string,auth:string}}`, both objects
non-null, no arrays/unknown keys. Browser toJSON expirationTime and other metadata
must be projected out before sending; accepting arbitrary full browser objects is
not part of this contract.

- Endpoint: 1..2048 ASCII bytes/characters, no whitespace/controls. WHATWG URL parse
  must succeed AND serialized href must equal the original exactly. Require https:
  with hostname, no username/password/fragment and no non-default port. Canonical
  serialization consequently rejects an explicit :443, encoded/lookalike host,
  uppercase/normalized variants or parser-repaired input; queries are allowed.
- Exact allowed hosts: fcm.googleapis.com, updates.push.services.mozilla.com,
  web.push.apple.com, or one label matching `[a-z0-9-]+` followed exactly by
  `.notify.windows.com`. No other host, IP literal, wildcard suffix extension,
  localhost, arbitrary user endpoint or redirect target. No URL fetch or DNS
  lookup during validation; the lifecycle API never sends a push to the endpoint.
- p256dh: exactly 87 unpadded canonical base64url characters decoding to 65 bytes,
  first byte 0x04, a valid uncompressed prime256v1/P-256 point accepted by Node
  ECDH.convertKey. Re-encoding must match byte-for-byte.
- auth: exactly 22 unpadded canonical base64url characters decoding to 16 bytes,
  same re-encoding rule. No `=`, standard-base64 `+`/`/`, whitespace or empty values.
- Validate everything before any GET/mutation for activate/recover. Preserve V4's
  character bounds as well. Existing pure validateSubscription is a useful checked
  building block, but the API must add this exact object/canonical-URL/size contract.
  No endpoint/material is returned, logged or accepted as recovery authority alone.

## 8. Dedicated lifecycle DB runtime

**NEW FRESH-CONTRACT DECISION — NOT HISTORICAL EVIDENCE**

New server-only configuration names are `NCA_PUSH_API_DATABASE_URL`,
`NCA_PUSH_API_CA_CERT_B64` and `NCA_PUSH_API_AUTH_PUBLISHABLE_KEY`. No runtime
credentials are created/rotated by this design. API credential provisioning and
verified production configuration are separate gates before deployment.

DB URL has exactly the following non-secret profile (password is percent-encoded):

```text
postgresql://nca_push_api.cwwulyrutdvuekydydew:<PASSWORD>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
```

Only postgresql:; exact case-sensitive wire username, hostname, explicit port 5432
and path /postgres. Nonempty decoded password, no controls. No query/fragment,
whitespace, alternate host/user/project suffix, port 6543, direct endpoint,
multi-host fallback, encoded identity/database, options or service-role credential.
Parse/validate offline, then pass explicit fields to pg, never an unchecked
connectionString. Do not inherit PGUSER/PGPASSWORD/PGHOST/PGPORT/PGOPTIONS/PGSSLMODE,
replication or application startup settings; do not mutate global process.env.

TLS is mandatory: explicit `rejectUnauthorized:true`, `minVersion:'TLSv1.2'`,
hostname verification against the fixed pooler hostname, and explicit ca decoded
from NCA_PUSH_API_CA_CERT_B64. Freeze the SAME strict canonical outer base64,
16,384-character bound, fatal UTF-8/BOM/control rejection, exactly one LF/CRLF PEM
CERTIFICATE block (optional single final newline), canonical inner base64 and
X509 CA/raw-DER equality checks as the reviewed decodeSenderCA helper. Its pure
validation may be reused without using sender DB identity/configuration. Operator
must supply the independently trusted Supabase CA; no arbitrary download or auto
trust-on-first-use, filesystem path, NODE_EXTRA_CA_CERTS requirement or TLS bypass.
Do not log/return CA contents or alter sender-specific env values.

Use a request-owned pg Pool with max=1, connectionTimeoutMillis=2000,
idleTimeoutMillis=1000, query_timeout=7000 and client_encoding=UTF8. Pinned Client
startup emits only user/database (plus protocol UTF8), not PGOPTIONS/startup GUCs.
After exclusive checkout, await identity query requiring exactly one row where BOTH
current_user and session_user are nca_push_api. Then explicitly establish and read
back statement_timeout=5s, lock_timeout=2s, search_path=pg_catalog,
default_transaction_read_only=off, application_name=nca_push_subscription_api.
Validate all settings before any lifecycle call. Replacement physical connections
must be initialized afresh. Any mismatch fails closed and discards the connection.
This session search_path does not change V4's per-function empty search_path.

No API-managed SQL transaction spans GET/auth/network work: V4 mutations use short
autocommit row locks. At most one mutator per request; no SQLSTATE-driven retry.
Release/destroy failed connections and close request-owned pools on completion.
Deadline for total handler work is 25s from entry; bound each awaited query/connect
by remaining time and dispatch no mutation with less than 7000ms left. A later
deployment must provide at least 30s execution allowance; this is not configured
now. Deadline/disconnect after dispatch is potentially committed, not a rollback
guarantee. No code logs raw errors, URI, passwords, auth/cookie headers, rows, keys
or CA; return only allowlisted errors. No admin/direct/pooler provisioning is
authorized here, and no existing consumed provisioning operation is to be rerun.

## 9. Browser sequencing (contract only; no frontend implementation)

**NEW FRESH-CONTRACT DECISION — NOT HISTORICAL EVIDENCE**

All fetches are same-origin POST JSON with credentials=same-origin. Include current
access token only as Authorization; never capability JSON. Persist installation ID
and last accepted binding pair as nonsecret state; capability remains HttpOnly.
Capture account/auth epoch, ID and binding pair at action start. Serialize lifecycle
actions across tabs/windows using an origin Web Lock named
`nca-push-subscription-lifecycle-v1`; if unavailable, lifecycle mutation is disabled
(fail closed with an unsupported-coordination UI state; do not guess only one tab exists).
Recheck account/installation epoch after every await; ignore stale responses and
never turn old intent into a fresh mutation. Network-dispatched work cannot simply
be unsent: CAS and subsequent explicit cleanup remain authoritative.

1. **First installation:** explicit push setup after verified sign-in creates/recovers
   the cookie-selected installation using create. Signed-out visitors may inspect
   an existing installation via status, but must sign in before creating one.
   Do not reserve, subscribe or prompt merely because Home loaded. If a valid cookie
   already exists, create returns its current row instead of overwriting it.
2. **Permission default/denied:** status is permitted with cookie/ID, optional auth.
   Never prompt automatically. An explicit user action requests permission. If not
   granted, create no browser subscription and perform no reserve/activate/recover.
   An existing delivery binding may be disabled using explicit release(disable=true)
   when permission is revoked; failure is reported, not silently claimed as disabled.
3. **Subscribe:** require existing verified account and granted permission. Under
   the cross-context lock, status. If owned by another account, first release(false)
   with the observed pair; status/accept the resulting unbound pair. Reserve using
   current intended account and exact current pair, obtaining new reserved pair.
   Obtain browser PushManager subscription using the separately approved app VAPID
   public key, project M, then activate with that reserved pair. No VAPID key is
   generated/rotated by this API. If browser subscription acquisition fails after
   reserve, explicitly release(false) with the last known pair; report any conflict.
4. **Existing active self + existing browser subscription:** ordinary startup/status
   does not mutate. Explicit repair for a changed/lost browser subscription obtains
   new browser material and calls recover with the current self-owned reserved/active
   pair and OLD cookie. It rotates capability and binding after DB confirmation.
   If state is unbound/disabled, use reserve -> activate instead. Owner other requires
   release -> reserve; recovery cannot be used to steal an account binding.
5. **Logout:** invalidate the push action epoch, cancel undispatched work and attempt
   release(false) with the observed cookie/ID/pair while serializing known in-flight
   work. Auth may be omitted so expired tokens do not obstruct revocation. If server
   unbinding is unconfirmed/failed, or the cookie is missing/stale, browser unsubscribe
   is a MANDATORY local mitigation attempt, not merely an error message. Local
   unsubscription is confirmed only by unsubscribe() resolving true or a subsequent
   getSubscription() returning null. Do not claim the DB row was revoked from this.
   Normal app signOut must still complete; it is not held hostage by push failures.
   Require confirmed DB unbinding OR confirmed local browser unsubscription before
   enabling personal push for another account. If neither is confirmed, block further
   push activation/switch, prominently report unresolved old-account push risk, and
   offer browser/OS notification disabling as manual mitigation. Already displayed,
   queued or in-flight notifications cannot be promised retracted. Do not keep
   rebinding from queued pre-logout work. Only this installation is affected.
6. **Account switch:** apply the logout cleanup/mitigation gate for A, then reserve for
   verified B and activate with browser material. Successful DB cleanup permits use
   of the resulting unbound pair. Confirmed local unsubscription alone stops future
   delivery locally but does NOT authorize bypassing V4 ownership/CAS or endpoint
   uniqueness: if old binding cannot be cleaned up, use the explicit fresh-installation
   repair path, or remain blocked. Never reuse A's pair or user identity
   on B's work. If cleanup conflicts, status and present explicit retry of the new
   user intent; no silent automatic rebase. A→B→A always obtains fresh generations.
7. **Unsubscribe:** release(true) first, confirming disabled row, then browser
   PushSubscription.unsubscribe(). If the latter fails, server remains disabled;
   report the local failure. If server revocation fails, browser unsubscribe is
   mandatory local safety mitigation; the logout risk/confirmation gate applies,
   but do not claim the DB binding was disabled.
8. **Missing/stale capability:** status 403 never issues/clears a cookie or uses auth
   as recovery. Explicit create can start a new unbound installation only under
   section 3's rules. Old rows are not adopted/deleted by ID/account/endpoint. To
   avoid old-account delivery and orphaned endpoint reuse, explicit user repair MUST
   first confirm local browser unsubscription (or no subscription) when DB cleanup
   is unconfirmed, then may obtain a new one; if this cannot be confirmed, further
   activation is blocked under the logout risk gate. If endpoint uniqueness still conflicts,
   STOP and report ENDPOINT_CONFLICT. No endpoint-stealing or admin fallback exists.
9. **Stale pair:** 409 changes neither cookie nor server state for that failed
   mutation. Status may obtain current state, but the user action/account must be
   reconsidered before a newly authorized attempt. No automatic stale-CAS loop.
10. **Ambiguous mutation/cookie delivery:** never retry the mutation. Perform one
    status only when still holding a usable cookie/ID. Recover can commit while its
    new Set-Cookie response is lost; old cookie then fails and cannot be resurrected.
    Use explicit fresh-installation repair above, accepting possible orphan rows/
    endpoint conflict. No seamless or exactly-once recovery is claimed. Error responses
    never alter a cookie, but a SUCCESSFUL create/recover response may automatically
    apply Set-Cookie even if JS rejects its stale JSON; epoch checks cannot suppress
    that header. Hold the Web Lock through the full HTTP response; on timeout/unknown
    completion freeze further mutations and do not clear the lock situation by a
    blind retry. Reconcile via status/explicit create as appropriate; if an old success
    later changes the cookie, ID/capability mismatches fail closed and require explicit
    reconciliation again. Never promise cancellation/epoch checks revoke a dispatched
    mutation or suppress a delayed successful cookie. Apply the logout local-mitigation
    gate before a different account's push activation.

Shared architecture supports separate concurrent iOS/iPadOS, Android and desktop
installations for the same account; never deduplicate them by account. iOS/iPadOS
Web Push requires a supporting installed Home Screen PWA (16.4+), service worker
and user-gesture permission; unsupported browser mode must not attempt subscription.
Android supporting browsers may subscribe without installation and installed PWAs
also work. Compatible desktops use the same cookie/API/CAS protocol. Feature-detect
PushManager/service worker/Notification and secure context. Installation/permission
UI differences do not authorize weaker auth, Origin or capability checks.

## 10. Security invariants and implementation acceptance

**NEW FRESH-CONTRACT DECISION — NOT HISTORICAL EVIDENCE**

No direct browser RPC/DML, account ID authority from JSON, unverified auth fallback,
Origin reflection, capability in JS/JSON/logs, TLS downgrade, open endpoint proxy,
retry loop, CAS rebasing, cookie deletion on errors, credential provisioning or
extension of V4 is permitted. XSS/origin compromise and theft of the entire
capability plus valid account access are not solved by HttpOnly alone; no such
claim is made. A capability alone may revoke but cannot activate another account.

Future local tests must prove exact schemas/matrices, every negative Origin/auth/
cookie case, canonical hash/bytea/BigInt mapping, cross-account and A→B→A stale work,
GET-before-recover, strict material validation, all six mappings, ambiguous-outcome
handling, zero secret output, and pinned DB TLS/startup/session/identity behavior.
Use fake Auth/pg/network boundaries and disposable local DB only if separately
authorized; no real Web Push or production fixtures. Successful tests would not
authorize production deployment or credential setup. Browser code remains a later
separate slice.

## Review and durability record

Independent focused adversarial document review identified bounded corrections:
require authenticated creation, mandate local mitigation when logout cleanup fails,
distinguish recovery's old-cookie 403 from consumed-pair 409, and acknowledge that
JS cannot suppress delayed successful Set-Cookie. Those corrections were applied
only here, with browser-storage isolation and Web Lock failure behavior clarified.
Final narrow independent re-review: **PASS — NO REMAINING CONCRETE BLOCKER**.
The installed V4 and runtime sources stay unchanged. No tests were executed in
this design-only task. The reviewed document is approved for its authorized local
durability commit; no implementation/deployment evidence is implied by this review.

Production safety: no production connection/SQL/RPC, secret inspection, credential
generation/provisioning, push/deployment or real Web Push. No runtime/API/browser
code or database artifact is implemented/modified. Only this document is saved and,
after review PASS, locally committed. Historical source is not recovered or recreated.
