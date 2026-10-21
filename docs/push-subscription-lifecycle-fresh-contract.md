# Fresh Web Push subscription lifecycle API contract

Verdict: **CONTRACT BLOCKED**

The historical lifecycle API implementation and its reviewed tests are unavailable.
This is an evidence-backed contract for a deliberately fresh implementation, not
reconstructed historical source. No recovery campaign or replacement implementation
was performed. The database contract is established below; unresolved API security
decisions are not silently supplied by this document.

## Authority and evidence boundary

- Authoritative SQL: `database/migrations/20261020_push_subscription_lifecycle_install_v4.sql`.
- Exact SQL SHA256: `6b6a4ae9336651f8f45c025e8884db9f657c14ffa470284b2bde7f9ab8b1fa7f`.
- Inspected local revision before this document: `df633074f82e2b94d433fde1cdc0d4dc3f49cb19`.
- Supporting source: `tests/push-subscription-lifecycle-install-v4.test.cjs`,
  especially the final metadata/ACL and lifecycle behavior cases, lines 381–406.
  Tests were read, not executed. Their fixture is not an independent production snapshot.
- Relevant existing patterns: `api/_gate.js`, `api/gate-login.js`,
  `api/gate-check.js`, `api/personal-push-worker.js`, `vercel.json`, frontend
  Supabase client initialization in `index.html`, and the pure subscription
  validator in `server/personal-push-transport.cjs`.
- Production V4 installation is an operator-supplied, consumed fact. Class A below
  means the local authoritative contract proves the property; it does not mean
  production was contacted or freshly reverified.

## Shared database contract

All six functions are in `public`, return one scalar `jsonb` object, are PL/pgSQL
`SECURITY DEFINER`, owned by installer `postgres`, and have `search_path=''`
(`proconfig = ['search_path=""']`). They have no argument defaults, variadic
arguments, OUT arguments or set-returning behavior. GET is STABLE; the other five
are VOLATILE. Evidence: V4 lines 321–524 and final metadata checks at 554–596.

Each successful result has exactly these fields, denoted **S** in the table:

| Field | Database JSON representation |
| --- | --- |
| `status` | String `ok` |
| `installation_id` | UUID represented as JSON string |
| `state` | String `unbound`, `reserved`, `active` or `disabled` |
| `binding_id` | UUID represented as JSON string |
| `binding_version` | Decimal JSON string, from explicit bigint-to-text cast |
| `user_id` | UUID represented as JSON string, or JSON null |

S contains no endpoint, push keys, capability or capability hash. This is the DB
return contract, not approval to expose every field unchanged to a browser.

Function ACL normalization removes every non-owner grantee before granting
EXECUTE to `nca_push_api`. Final ACLs have exactly two non-grantable EXECUTE entries:
`postgres` and `nca_push_api`, granted by `postgres`. PUBLIC, anon, authenticated,
service_role and authenticator have no lifecycle EXECUTE grant; the installer also
rejects prohibited membership routes. Trusted owner/platform administrative
authority is not a browser access mechanism. Evidence: per-function ACL loops,
V4 lines 525–552, 554–596; V4 test's browser-role denial case.

`nca_push_api` receives database CONNECT and public schema USAGE, not schema CREATE,
subscription-table/column DML or sequence authority. V4 creates LOGIN with NULL
password, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION,
NOBYPASSRLS, no owned objects or role settings. The sole creator-admin membership
is `postgres` holding API ADMIN with INHERIT=false and SET=false; it is not runtime
adoption/delegation. Narrow platform ambient exceptions in V4 do not grant usable
subscription-table authority. No credentials or usable runtime connection are
established by this document.

## Six-function contract

Argument names and order below are exact. Every row uses the ownership, ACL,
search_path and return contract above. The application caller must be the trusted
server connected as `nca_push_api`, never a browser role or user-supplied DB identity.

| Function and exact ordered arguments | Meaning and transitions | Return / errors |
| --- | --- | --- |
| `public.nca_get_push_subscription(p_installation_id uuid, p_capability bytea, p_context text)` | ID selects installation; capability must equal stored 32-byte `device_secret_hash`; context must be exactly `status`. Reads `push_subscriptions` without FOR UPDATE; no mutation. | S. Invalid context: `22023 / NCA_PUSH_CONTEXT_INVALID`. Null ID, null/wrong-length capability, nonexistent ID or mismatched capability: `PT403 / NCA_PUSH_CAPABILITY_INVALID`. |
| `public.nca_create_push_installation(p_installation_id uuid, p_capability bytea)` | Trusted caller supplies non-null ID and 32-byte stored capability value. Inserts one unbound row, null owner/material/activation/disabled time, new random binding UUID, version 0, creation/update timestamps. ID conflict does nothing then raises; it never overwrites or silently returns an existing row. | S. Invalid ID/capability: `PT403 / NCA_PUSH_CAPABILITY_INVALID`. Existing ID: `PT409 / NCA_PUSH_INSTALLATION_CONFLICT`. |
| `public.nca_reserve_push_subscription(p_installation_id uuid, p_capability bytea, p_user_id uuid, p_version bigint)` | Locks installation FOR UPDATE; validates existing capability; requires non-null target owner and exact nonnegative current version. There is no binding-ID argument and no prior-state restriction. Sets target owner, state reserved, clears endpoint/keys/activation/disabled time, increments version and generates a new binding UUID. This can rebind ownership and invalidates old generations, including A→B→A. | S. Capability failure: PT403 as above. Missing owner: `22023 / NCA_PUSH_OWNER_REQUIRED`. Stale/null/negative version: `PT409 / NCA_PUSH_BINDING_CONFLICT`. Maximum bigint: `PT409 / NCA_PUSH_BINDING_OVERFLOW`. |
| `public.nca_activate_push_subscription(p_installation_id uuid, p_capability bytea, p_binding_id uuid, p_version bigint, p_endpoint text, p_p256dh text, p_auth text)` | Locks row, validates existing capability and exact binding UUID/version pair, then requires reserved state with owner. Checks material bounds below. Sets active with supplied material, activation/update time, null disabled time; retains owner and stored capability; increments version and rotates binding UUID. | S. Capability failure: PT403. Bad pair: `PT409 / NCA_PUSH_BINDING_CONFLICT`. Wrong state: `PT409 / NCA_PUSH_RESERVATION_REQUIRED`. Overflow: `PT409 / NCA_PUSH_BINDING_OVERFLOW`. Bad material: `22023 / NCA_PUSH_MATERIAL_INVALID`. |
| `public.nca_release_push_subscription(p_installation_id uuid, p_capability bytea, p_binding_id uuid, p_version bigint, p_disable boolean)` | Locks row; existing capability and exact binding pair required. No prior-state/owner restriction. Non-null disable flag: true sets disabled with disabled time; false sets unbound with null disabled time. Both clear owner, endpoint, push keys and activation, retain stored capability, increment version and rotate binding UUID. No DELETE; delivery history remains. | S. Capability failure: PT403. Bad pair/overflow: respective PT409 above. Null flag: `22023 / NCA_PUSH_DISABLE_REQUIRED`. |
| `public.nca_recover_push_subscription(p_installation_id uuid, p_binding_id uuid, p_version bigint, p_user_id uuid, p_capability bytea, p_endpoint text, p_p256dh text, p_auth text)` | Trusted server MUST first validate the OLD capability using GET. Pass that observed binding pair to recovery, plus the authenticated owner and NEW 32-byte capability value. Recovery itself does not compare an old capability. Locks row, requires exact pair, same non-null owner and reserved/active state; validates material. Stores new capability/material, sets active and activation/update time, clears disabled time, increments version and rotates binding UUID. | S. Null ID or invalid new capability: PT403. Missing row or invalid pair: `PT409 / NCA_PUSH_BINDING_CONFLICT`. Owner/state mismatch: `PT409 / NCA_PUSH_RECOVERY_CONFLICT`. Overflow: PT409. Bad material: `22023 / NCA_PUSH_MATERIAL_INVALID`. |

GET checks context before capability. Reserve checks owner after capability and
before version. Activate checks pair, reservation, overflow, then material.
Release checks pair, overflow, then disable flag. Recovery checks new capability,
row/pair, owner/state, overflow, then material. Preserve those distinctions when
designing any externally visible error policy; no API mapping is specified here.

Updates are atomic under row locks, with version increments bounded at
`9223372036854775807`. No routine performs a hidden CAS retry. Bigint versions must
not be rounded through JavaScript Number. In addition to explicit application
errors, the API must account for database constraint errors, including endpoint
uniqueness `23505` and invalid owner FK `23503`, without exposing raw database
details or stealing another installation's endpoint. Exact HTTP mapping remains
an unresolved decision; PT403/PT409 encode the intended 403/409 error classes,
not a complete HTTP contract for a fresh Node handler.

**Critical trust boundary:** DB routines do not verify Supabase JWTs or Origin,
derive cookie hashes, or authorize browser-provided `p_user_id`. In particular,
activation/release do not accept a current authenticated-user parameter. The trusted
API must close the account/capability policy before these routines are exposed.
Recovery with authentication alone is explicitly insufficient.

## Subscription storage and constraints

There is no separate installation table in these routines: installation ID is
`public.push_subscriptions.id`. All six read/write only this relation directly;
intrinsic FK triggers may enforce dependent constraints. API code must call the
routines rather than acquire direct DML access.

V4 validates these exact ordered columns (lines 112–125):

| Attnum | Column | Type | Nullable | Default |
| --- | --- | --- | --- | --- |
| 1 | `id` | uuid | No | None |
| 2 | `user_id` | uuid | Yes | None |
| 3 | `endpoint` | text | Yes | None |
| 4 | `p256dh` | text | Yes | None |
| 5 | `auth` | text | Yes | None |
| 6 | `device_secret_hash` | bytea | No | None |
| 7 | `binding_id` | uuid | No | None |
| 8 | `binding_version` | bigint | No | 0 |
| 9 | `state` | text | No | `unbound` |
| 10 | `activated_at` | timestamptz | Yes | None |
| 11 | `created_at` | timestamptz | No | clock_timestamp() |
| 12 | `updated_at` | timestamptz | No | clock_timestamp() |
| 13 | `disabled_at` | timestamptz | Yes | None |

All typmods are -1; no identity/generated/dropped columns. Text columns use the
catalog default collation (OID 100); other columns have collation 0. V4 pins raw
default/CHECK node representations, rather than asking a new API to reproduce DDL.

The thirteen constraints comprise PK(id), UNIQUE(endpoint), the validated immediate
non-deferrable user FK to auth.users(id) ON DELETE CASCADE / ON UPDATE NO ACTION,
and ten CHECKs:

- `push_subscriptions_device_secret_hash_check`: exactly 32 bytes.
- `push_subscriptions_binding_version_check`: version >= 0.
- `push_subscriptions_state_check`: only unbound/reserved/active/disabled.
- `push_subscriptions_endpoint_check`: null or 1–2048 characters beginning `https://`.
- `push_subscriptions_p256dh_check`, `push_subscriptions_auth_check`: null or 1–256 characters each.
- `push_subscriptions_check1`: creation and update timestamps finite.
- `push_subscriptions_activated_at_check`, `push_subscriptions_disabled_at_check`: null or finite.
- `push_subscriptions_check`: the state/column consistency table below.

| State | user_id | endpoint / p256dh / auth | activated_at | disabled_at |
| --- | --- | --- | --- | --- |
| unbound | Null | All null | Null | Null |
| reserved | Non-null | All null | Null | Null |
| active | Non-null | All non-null | Non-null | Null |
| disabled | Null | All null | Null | Non-null |

The three validated indexes are the primary index on id, unique endpoint index
(ordinary NULLs-distinct behavior), and non-unique `(user_id,id)` index. No partial
predicate or expression index is involved. Endpoint uniqueness spans all rows;
inactive states null the endpoint rather than bypass uniqueness. All ten foundation
relations are owner-postgres ordinary tables with RLS and FORCE RLS; the subscription
relation has no policies or user triggers, only the four pinned intrinsic FK triggers.
The API must not alter these constraints, policies, indexes, triggers or grants.

The SQL's Web Push checks are deliberately only structural bounds. They do not
prove canonical browser key encoding, EC point validity, safe provider endpoint or
transport policy. SQL comments assign that validation to the trusted API.

## Security-critical classification

A = proven local contract/source fact. B = preserved historical/product requirement
supplied by the operator, not independently recovered implementation. C = missing;
must not guess. Split rows distinguish known invariants from unknown wire details.

| Item | A/B/C | Evidence source / precise boundary |
| --- | --- | --- |
| Six DB identities, ordered argument names/types, S, state/CAS/error behavior | A | V4 function bodies and final metadata checks; V4 behavior tests read only |
| Dedicated server role, DEFINER ownership, empty search_path, lifecycle ACL isolation | A | V4 role/ACL/final checks; no browser EXECUTE or subscription DML route |
| Installation identifier DB type | A | Non-null uuid supplied to create; PK on subscription id |
| Installation identifier generation and accepted HTTP spelling | C | UUID version, randomness/generator responsibility and canonical request syntax are not specified by V4; test randomUUID is fixture behavior only |
| Stored capability representation | A | V4 requires exactly 32 bytea bytes and compares directly to device_secret_hash; SQL performs no hashing/decoding |
| Browser capability generation, entropy/length, encoding and hash derivation | C | Column name does not prove a hashing algorithm or raw-token format; test repeated bytes are not a product contract |
| Per-installation capability held in HttpOnly cookie | B | Preserved product contract; not specified by DB |
| Cookie name, per-installation mapping, parser/duplicate policy, rotation/deletion, lifetime | C | No surviving lifecycle API source/tests/docs define these |
| Cookie HttpOnly | B | Explicit preserved requirement |
| Cookie Secure / SameSite / Path / Domain / Max-Age policy | C | Gate-login cookie has its own settings; those do not authorize lifecycle cookie settings |
| Exact Origin matching required | B | Preserved product contract |
| Exact allowed Origin value(s), source of truth and absent/null/malformed/multiple-header handling | C | No surviving lifecycle Origin configuration; deployment/Host reflection is not evidence of a permitted allowlist |
| Status Authorization optional but genuinely verified if supplied | B | Preserved product contract; invalid supplied auth must not silently become anonymous |
| Supabase account context exists in frontend | A | index.html initializes sb with project URL and uses browser auth.getSession(); this is not server JWT verification |
| Server auth verification mechanism/trust configuration and operation-specific account authorization | C | Gate HMAC proves only a house-password gate; worker Bearer proves only worker authentication. Neither verifies a Supabase user JWT. Issuer/audience/expiry/revocation checks, verification mechanism and owner derivation remain unspecified |
| Recovery old-capability GET before mutation, same observed pair and owner | A | Explicit V4 recovery comment and atomic predicates; authentication alone insufficient |
| Bootstrap/create/recovery cookie issuance and failure-ordering protocol | C | V4 defines DB atomicity, not secure HTTP issuance/recovery protocol |
| Endpoint and status request minimum | B | POST /api/push-subscriptions; JSON operation=status with installation_id; capability where applicable |
| Full operation whitelist, per-operation auth/capability rules and exact JSON schemas | C | DB function names do not establish HTTP operation names/body wrappers/allowed extra fields or browser response redaction |
| DB JSON result | A | Exact six-field S above; bigint version is a string |
| HTTP statuses/error envelopes, cache/CORS/method policy and input limits | C | Existing unrelated API routes are examples, not a lifecycle contract; DB SQLSTATE alone is not a complete HTTP schema |
| Existing pure sender subscription validator | A | personal-push-transport.cjs checks HTTPS/provider list, canonical 65-byte valid P-256 public point and 16-byte auth; its behavior is inspectable without calls |
| Adoption of that validator and exact subscription request shape/provider policy at this API boundary | C | Sender helper is not surviving lifecycle validation source; V4 delegates stronger validation without specifying its exact API policy |
| Dedicated lifecycle runtime DB connection/TLS/identity/configuration contract | C | V4 establishes role/grants and initially NULL password, not a runtime adapter/connection profile. Sender-specific config must not be copied as API authorization |

## Exact remaining blockers

1. Close installation-ID generation/input syntax and capability generation,
   entropy, wire encoding, DB hash derivation and cookie-to-installation binding.
2. Close the lifecycle cookie name, complete attributes/lifetime, duplicate-cookie
   parsing, issuance/rotation/removal and bootstrap/recovery failure-ordering rules.
   Keep the explicitly required HttpOnly invariant.
3. Supply the exact trusted Origin allowlist/configuration and rejection rules for
   absent/null/malformed/multiple Origin values; do not infer permission from Host.
4. Select genuine server-side Supabase token verification and its trust settings;
   close each operation's auth requirement, derived user identity, and account-change
   authorization. Preserve optional-but-verified status and mandatory old-capability
   validation for recovery. Do not accept a body user_id as authenticated identity.
5. Close the HTTP operation whitelist, exact request/response schemas (including
   bigint strings and user_id exposure), validation limits, method/content-type,
   CORS/cache and error mapping policy. Define which operations require a capability,
   especially initial creation, without inventing a bootstrap exception implicitly.
6. Approve the exact Web Push material validation/provider policy and its request
   representation; the existing pure sender validator is a candidate evidence source,
   not automatic approval to adopt its interface here.
7. Close the dedicated nca_push_api runtime connection/TLS/identity and configuration
   contract. This requires decisions, not collection or disclosure of any secret.

These are concrete API-boundary decisions, not evidence that the installed DB
functions need replacement. No additional DB migration, production diagnostic,
historical recovery or browser integration is authorized. Implementation is blocked
until these bounded decisions are approved; this document must not be treated as an
implementation-ready API specification in the meantime.

## Review and production safety

This saved document was reviewed once against the inspected V4 function bodies,
metadata/ACL guards, raw column/default/CHECK expectations and V4 tests. Existing
gate/worker/frontend patterns were kept separate from lifecycle evidence. No
historical bytes, production identity/credential or unspecified cookie/JWT/Origin
choice was reconstructed or supplied. Review verdict: evidence-grounded and
internally consistent; API implementation remains CONTRACT BLOCKED.

Production safety state: no production connection, SQL, lifecycle RPC, mutation,
credential access/provisioning, deployment or real Web Push. No tests executed.
The only task change is this document and its authorized local durability commit;
no push. Production V4 remains consumed and must not be reinstalled by this task.
