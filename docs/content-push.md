# Content Web Push — local foundation

Source base: `b09c44ae25d7885ce1ab03f8b9d20a8a93de6ef3`.
Authority: the user's reviewed PostgreSQL 17.11 catalog contract supplied for this
task, including the supplemental nine-relation/64-internal-trigger evidence and
zero non-internal target triggers. No additional production inspection occurred.
The old SQL is neither restored nor modified. The existing personal SQL safety
patterns and `docs/push-category-preferences-contract-v1.md` are local references.

## Runtime bridge status — 2026-10-23

The operator reports that the production base Content Push migration is installed
and post-install verified. The supplied read-only queue snapshot at
`2026-10-23 02:29:07.593043+00` reported zero events and zero content deliveries.
This document records that supplied evidence; it is not a new production query.
Runtime remains OFF. No fanout endpoint or scheduler is deployed, and no push
worker has been enabled.

`database/migrations/20261023_content_push_fanout_runtime_bridge.sql` is a local
candidate only; it has not been installed in production. It preserves
`nca_push_fanout` as NOLOGIN and introduces a dedicated `nca_push_fanout_runner`
LOGIN that can execute only two fixed SECURITY DEFINER wrappers. It has no table
or column privileges and no membership in `nca_push_fanout`. PostgreSQL 17
automatically grants a new role created by a non-superuser CREATEROLE installer
back to that creator with ADMIN TRUE, SET FALSE, and INHERIT FALSE; the bootstrap
superuser is recorded as grantor. This is administrative control, not runtime
inheritance. The bridge verifier requires exactly that one incoming installer
membership, no outgoing runner memberships, and no runner/fanout membership.
The runner is created with `PASSWORD NULL`; PostgreSQL 17 permits a LOGIN role without a password, and
password authentication always fails until a separately authorized operation
provisions one. No password is committed or generated here.

Before any runtime configuration, a separate secret operation must provision a
password and a dedicated connection URL for the runner. The expected shared
Supavisor custom-role username shape is `[ROLE].[PROJECT-REF]`; the runtime must
verify both `current_user` and `session_user` as `nca_push_fanout_runner` and
must never fall back to postgres credentials. No actual host, project reference,
or password belongs in this repository. The bridge is still a preflight candidate;
its collector has not been run against production.

The bridge does not implement an HTTP endpoint or scheduler. The existing sender
flag remains fail-closed; a fanout runtime flag has not been implemented.
Controlled E2E remains blocked pending bridge preflight/installation, separate
password provisioning, runtime implementation, client deployment/adoption, and
explicit rollout authorization.

## Capture and legacy behavior

`20261022_content_push_delivery.sql` creates two AFTER INSERT OR UPDATE row
triggers, on stories and chapters, using one postgres-owned SECURITY DEFINER
function with empty search_path and short timeouts. Existing publication_state
partial unique indexes serialize entity identity. The state row is locked before
the singleton publication clock. Preference enabling must continue locking the
same clock BEFORE selecting enabled_since; capture never takes preference locks.

A new INSERT establishes state; published=true captures immediately, otherwise
the later false-to-true transition captures. One database timestamp, an advanced
clock frontier, a positive publication revision, a server UUID and SHA256 of
server-derived identifiers/time form one genuine publication. One unique content
event references it, with expiry exactly 24 hours after that captured timestamp.
Failure rolls back the originating story/chapter transaction too.
Chapter capture first takes a NOWAIT parent key-share lock: if a parent delete
already owns that row while waiting for this chapter, capture fails busy (55P03)
instead of adding a parent/child deadlock. It introduces no automatic retry.

Ordinary published edits create no publication/event. Unpublish/republish creates
no second announcement once first_publication_recorded is true. Existing
publication records of any origin also suppress a new first announcement.

Installation reads no historical application rows, initializes no clock row,
backfills nothing, and creates no event/notification. For a pre-existing UPDATE
with no state, history is unknown: establish a state tombstone with
first_publication_recorded=true and suppress announcement. This also conservatively
suppresses a legacy draft's first later publish if it has no trusted state. An
already-published OLD row similarly marks any false state recorded, without an
announcement. No created_at or user-supplied timestamp is used to infer history.
Normal draft/revision/freshness UI code and existing setters are unchanged.

## Global audience and fanout

Content announcements NEVER insert `public.notifications`. They use a separate
lane in existing push_deliveries: content_event_id present, personal source null.

`nca_claim_content_push_events(integer)` claims at most 100 uncompleted,
unexpired events with SKIP LOCKED and a fresh 120-second token. A page is claimed
again only after lease expiry. `nca_fanout_content_push_event_page(bigint,uuid,integer)`
walks at most 100 subscription UUIDs plus one lookahead using fanout_after;
inactive/unbound rows still advance the cursor. Complete pages clear the lease.
Expired or mismatched work fails closed with PT409 or is completed without work.
No automatic SQL retries or SQLSTATE 40001/40P01 business control flow.

Every bound installation can qualify, including multiple devices for one account.
The relevant preference must be enabled with enabled_since <= publication.occurred_at.
The subscription must be active, bound, have encryption material, and have
activated_at <= publication.occurred_at. Enabling/rebinding after publication
never authorizes retroactive delivery. Binding IDs/versions are captured.

Lock order: publication -> event -> preference -> subscription -> delivery.
An unlocked subscription locator provides only a candidate owner. The page locks
that preference first, then rereads/locks the subscription and requires owner
agreement. Replacement during that interval cannot authorize a stale owner.
The subscription SHARE lock is NOWAIT in both fanout and prepare: an account
deletion may hold the subscription via cascade while waiting for the preference.
Busy 55P03 aborts/rolls back the call instead of waiting back and deadlocking.
It neither silently cancels uncertain work nor triggers an automatic retry.
The unique content-event/subscription index makes duplicate expansion harmless.
Lease and expiry are checked after blocking phases and after all insertions;
failure rolls back inserts/cursor together. Completed-token repeats are PT409,
not replay receipts. A partial-page repeat advances the existing durable cursor.

Fanout EXECUTE is granted only to postgres and existing NOLOGIN nca_push_fanout.
This task provides the routines, not a scheduler or a new fanout login. A future
trusted operator/orchestrator must invoke them under that authority with short
autocommit calls and bounded statement/transaction timeouts. The sender endpoint
cannot fanout and receives no extra role memberships/credentials.

## Sender and API

New claim/prepare/finish routines accept content deliveries only; personal RPCs
remain untouched and reject content rows. Claim/finish retain the personal
algorithm's 90-second leases, six-attempt cap, exponential backoff, effect-only
terminal no-op and binding-safe invalidation on invalid_subscription. Malformed
subscriptions fail the delivery without disabling a replacement installation.

Prepare locks/revalidates the genuine publication/event, preference, active
subscription owner, captured binding, activation time and exact delivery token.
It requires >15 seconds lease left and an unexpired event. Invalid authority
cancels before send. Stories.title and chapters.title are read internally,
including chapter-to-parent agreement. The story and, for new_chapter, the chapter
must still be published: an old event cannot expose a title edited in a draft
after unpublishing. Otherwise SOURCE_NOT_PUBLISHED cancels before returning titles.
It returns endpoint/encryption keys,
remaining lease/event time and only content identifiers/category/titles; never
raw story/chapter bodies. Sender role has no direct application-table SELECT.

Server modules: `server/content-push-db.cjs`, `server/content-push-worker.cjs`,
`api/content-push-worker.js`. The DB adapter reuses the closed personal databaseConfig
unchanged: exact Session Pooler host/wire user/port, explicit pinned verified CA,
minimal startup parameters and checked nca_push_sender backend identity. It
sets/verifies its own `nca_content_push_sender` application_name before RPCs.
Only the three new content sender RPCs are callable through that adapter.

The endpoint is POST-only and disabled unless NCA_CONTENT_PUSH_WORKER_ENABLED is
exactly `true`. Missing flag means disabled. It uses the EXISTING NCA_PUSH_WORKER_SECRET
format and timing-safe bearer check before constructing DB/transport. Callers
cannot supply recipients/endpoints/payloads/limits. Existing sender DATABASE_URL,
CA_CERT_B64 and VAPID public/private/subject configuration is reused; no second
secret or credential provisioning. No environment settings were changed here.
Vercel config adds only the new endpoint's 60-second maximum duration, no cron.

The worker copies the established bounded loop: at most five sends, 45-second
budget, fresh prepare with latency/remaining-time checks, one transport call and
one finalize per attempted send. Shared existing transport validates push hosts,
encrypts, uses verified HTTPS, has a five-second deadline and no redirect/retry.
Counters: claimed/sent/suppressed/deferred/failed/errors. DB errors stop the run;
ambiguous finalize is not retried or reported as proven external success.
An external send is not atomic with committed prepare; the existing narrow
prepare-to-network race and possible redelivery after ambiguous finish remain.

## Exact presentation and service-worker safety

Title for both: **Alex hiện lên và nói**.

- new_story: `Alex đã đăng truyện mới “<story title>”.`
- missing story: `Alex đã đăng truyện mới.`
- new_chapter: `Alex đã đăng chương “<chapter title>” cho truyện “<story title>”.`
- missing chapter: `Alex đã đăng chương mới cho truyện “<story title>”.`
- missing story (including both missing): `Alex đã đăng chương mới.`

Titles normalize Unicode NFC/whitespace/controls and are bounded at grapheme
boundaries to 100 UTF-16 units each; optional malformed/URL-looking titles fall
back. Final body fits the existing 240-unit/4096-byte payload budget. Malformed
core identifiers/categories fail closed. No arbitrary URLs, excerpts or IDs in
visible fallback copy. iOS's `from Nhà có Alex` attribution remains OS-controlled.

Payload keeps version/title/body/tag/data, with type=`content`. Exact data keys:
content_event_id, publication_id, category, story_id, chapter_id. IDs remain
canonical signed-bigint decimal strings; new_story has null chapter_id, while
new_chapter requires it. Tag is `nca-content-<event_id>` and stable across devices
and retries. The service worker adds a strict content-only validator; the exact
personal validator and app-root-only click behavior remain unchanged. No URL
field is accepted. App identity, registration, icons and permission flow unchanged.

## Guard scope, validation and later production boundary

The migration locks the nine relations, checks PG17.11/installer, exact critical
column/type/null/identity/generated shapes, PK/FK/index structure and CHECK/raw
predicate trees, RLS/ownership, roles/authority, personal signatures/config/ACL
and absence of competing target triggers/rules/inheritance or new-name collisions.
Both outgoing dedicated-role membership and incoming members other than trusted
postgres are rejected; direct ACLs alone cannot prove the browser boundary.
Only six new functions/two triggers and their function ACLs are installed.
Owner/definer/config/new-body hashes/ACLs and trigger mode/type are checked before
COMMIT. No role/table grant, RLS, consumed migration or preference setter changes.

The committed REQUIRED shape manifest is compiled from the explicit LOCAL model
of this task's catalog contract, with raw attribute references normalized to
column names; it is NOT an approved production snapshot or lost-source recovery.
Each required positional record must equal one whole observed record; unordered
JSON array containment is not used to compare constraints/keys/indexes.
Operator-reviewed production catalog evidence includes the raw CHECK trees and
the exact candidate-to-production hash mapping. The guard accepts only each
candidate hash or its reviewed production equivalent, bound to that table and
logical invariant; the publication metadata mapping is
`4d244c0394485df884ebf8c4c2a84867` to
`32b9db3725b3931d958ed6dc285b2d40`. The distinct
`9c603e8249311c5b9a1557f53b8e6819` origin CHECK remains an exact requirement.
This records reviewed catalog compatibility, not recovered historical DDL or
permission to install. Do not weaken or bypass a failed guard.

The guard also requires `ON DELETE CASCADE` for the three reviewed external
foreign keys: subscription user, preference user, and personal notification.
The saved evidence does not record their exact `ON UPDATE` actions or MATCH
types, so those properties are not asserted. The collector can capture them;
obtain and review those values before adding further requirements. The isolated
PostgreSQL 17.11 witness passed in GitHub Actions run `39833675791` on CI-only
SHA `3dd22db7a8ecd21ec2f6ff61e52549c51c1dde1b`, using
`postgres:17.11-bookworm`, `--network none`, and the targeted
`node --test tests/content-push-pg17.test.cjs` regression. This establishes
`PG17_RUNTIME = PASS`; it does not mean the migration was installed. Installation
still requires all review prerequisites to be cleared, and privileged
role/routine DDL must remain excluded throughout any later installation window.

Targeted tests use fake HTTP/pg boundaries plus the already-running network-none
PostgreSQL 17.11 scratch container and one pinned Unix socket, explicit database/
identity, no inherited DB credentials. Fixtures are synthetic and cleaned up.
No production connection, SQL/RPC, push, secret/env change or deployment occurred.

## Manual production read-only preflight

**READ-ONLY PREFLIGHT — run only this file:**
`database/verification/20261022_content_push_contract_collector.sql`

**NOT AUTHORIZED — do not run this file:**
`database/migrations/20261022_content_push_delivery.sql`

Using an already-authorized production SQL Editor, create a new query, paste the
entire read-only collector, and run it once. It starts a `READ ONLY` transaction,
sets local timeouts, reads PostgreSQL catalogs, returns one marker and a
diagnostic JSON result, then rolls back. It reads no application rows and invokes
no application routine. It does not authorize or install the migration.

Save the complete, untruncated SQL Editor result, including its header, marker,
and full diagnostic value, as
`content-push-production-preflight-20261023.txt`. Confirm the marker is present
and `catalog_evidence_complete` is true; stop if output is missing or truncated,
any catalog/output cap is exceeded, or required relation, column, or constraint
records are absent. `evidence_complete` also reports the collector's documented
routine-discovery limitation. Manually confirm the exact required personal
routines and Content Push name/signature collision records are present and not
withheld; do not ignore missing or ambiguous records.

The constraint section includes every constraint on the requested relations.
For the three protected FK local tuples, map each ordered `conkey` attnum through
the emitted relation and column records. Compare all such rows—including wrong
targets, unvalidated and deferrable FKs—then verify the target, ordered
`conf_columns`, delete action, validation, and deferrability. The catalog cap is
fail-closed; if `catalog_evidence_complete` is false, the output cannot prove the
preflight.

The collector withholds source/configuration it flags as potentially sensitive,
but its metadata warns that secret detection is not exhaustive. Keep the result
local until checked for secret-like material. If any appears, do not upload it;
provide only a safe complete result for reconciliation. Until fresh output is
reconciled against the current migration, status remains
`PRODUCTION_PREFLIGHT = BLOCKED` and
`CONTENT_PUSH_MIGRATION_INSTALL = BLOCKED`.

The preceding collector instructions describe the historical pre-install gate.
They are not the current base-migration status recorded above.

### First installation attempt (2026-10-23)

The operator-reported single installation attempt using the reviewed migration
SHA256 `BC17AA897A43CAB24594892451DF9A278981A75B605C8F8010EBA84B0D315112`
failed before `COMMIT` with `NCA_CONTENT_FINAL_ROUTINES`. A subsequent
operator-run read-only catalog collection reported that none of the six new
Content Push routines or two capture triggers persisted and matched the accepted
pre-install catalog apart from its timestamp. The transaction rollback is
therefore confirmed by that supplied evidence. The migration was not retried;
the consumed authorization does not authorize another attempt. No worker or E2E
rollout occurred. Review any verifier fix and obtain separate authorization
before considering another installation attempt.

### Subsequent operator-reported installation status

The operator later reported that the base migration was separately installed
and post-install verified. The supplied pre-runtime queue snapshot was clean.
This later evidence supersedes the earlier pending-install instructions; it does
not authorize runtime deployment or activation. The bridge above remains a local
candidate only. An authorized bridge preflight/installation, separate runner
password provisioning, server runtime implementation, client deployment/adoption,
and staged E2E approval remain outstanding. No endpoint, fanout, or real push is
invoked here.
