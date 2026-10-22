# Account Web Push category preferences contract v1

**Verdict: CONTRACT CLOSED.**

## Authority and scope

Source: the user's authoritative, manually reviewed production raw-catalog
contract evidence supplied for snapshot `2026-10-22T02:38:44.669456+00:00`,
PostgreSQL 17.11. The supplied evidence reports `evidence_complete=true` under
its stated rule, no incomplete reasons, a read-only transaction, and zero RPCs,
application rows read and mutations. Its automatic `semantics_verified=false`
is intentional; the user supplied the manual semantic review recorded below.
No additional production query or RPC was performed by this task.

Collector: `database/verification/20261022_push_preferences_contract_collector.sql`,
commit `971d02bd00b2e52cdf8bf738dc0d94b1a8b560c0`, SHA256
`b0b1c43c9874fd7fabefb9b1657ef8b034ddcad6ee5ed5a712c9fcfe43baef75`.
The supplied reviewed evidence, not the collector's source alone, closes this
contract. The lost historical migration/API source has not been restored or
reconstructed. The earlier LOCAL-only blocked inventory remains in Git history
(commit `8ee9298805f391eab8e5ac903b1cb0d1c9a7ad91`) and
`docs/push-category-preferences-contract-blocker.md` as historical context.

## Proven production DB contract

`public.push_preferences` has NOT NULL UUID `user_id` as its primary key,
NOT NULL bigint `revision`, NOT NULL timestamptz `updated_at`, and these fields:

| Category | NOT NULL boolean | Nullable timestamptz |
| --- | --- | --- |
| comment | comment_enabled | comment_enabled_since |
| reply | reply_enabled | reply_enabled_since |
| mention | mention_enabled | mention_enabled_since |
| comment_like | comment_like_enabled | comment_like_enabled_since |
| new_story | new_story_enabled | new_story_enabled_since |
| new_chapter | new_chapter_enabled | new_chapter_enabled_since |

RLS and FORCE RLS are enabled. Authenticated has table SELECT and an own-select
policy `user_id = auth.uid()`. No direct table writes are part of this UI contract.

### Getter

`public.nca_get_push_preferences()` takes no arguments and returns one `jsonb`
object. Owner: `postgres`; SECURITY INVOKER; empty search_path. EXECUTE ACL:
`postgres`, `authenticated`, `service_role`.

Null `auth.uid()` raises SQLSTATE `42501`, message `Authentication required`.
It reads only the row whose `user_id = auth.uid()`. The response has exactly 13
keys: `revision`, the six boolean column names above, and their six timestamp
column names. Revision is cast to text in JSON, never a JSON number.
Missing row: revision string `"0"`, six false booleans, six null timestamps.

### Setter

`public.nca_set_push_preferences(bigint,boolean,boolean,boolean,boolean,boolean,boolean)`
returns the same 13-key `jsonb` shape. Exact named arguments/order:

1. `p_expected_revision bigint`
2. `p_comment_enabled boolean`
3. `p_reply_enabled boolean`
4. `p_mention_enabled boolean`
5. `p_comment_like_enabled boolean`
6. `p_new_story_enabled boolean`
7. `p_new_chapter_enabled boolean`

Owner: `postgres`; SECURITY DEFINER; empty search_path. EXECUTE ACL:
`postgres`, `authenticated`; not `anon`. Identity is exclusively `auth.uid()`;
there is no user UUID parameter. Null identity raises `42501` / `Authentication required`.

Expected revision must be non-null/non-negative; all six booleans must be
non-null. Invalid arguments raise `22023` / `NCA_PUSH_PREFERENCES_INVALID_ARGUMENT`.
The setter inserts the caller's default row with `ON CONFLICT (user_id) DO NOTHING`,
then selects it FOR UPDATE. The installed initial revision is 0; therefore the
first save uses the getter's string `"0"`.

Current revision unequal to expected raises `PT409` /
`NCA_PUSH_PREFERENCES_REVISION_CONFLICT`. A second fail-closed PT409 branch
covers detected out-of-contract new_story/new_chapter state changes; its exact
message is not supplied and is not needed by this client, which treats all PT409
responses identically. The reviewed complete source has no explicit business
`40001` or `40P01` branch. This client introduces neither branch nor retry rule.

Revision `9223372036854775807` raises `22003`; success always increments the
current revision by one and returns decimal TEXT in JSON. All six input booleans
write their corresponding columns. Disabled values get null enabled_since;
remaining enabled values preserve it; disabled-to-enabled transitions use the
write's effective timestamp. `updated_at` uses that same timestamp.
Enabling new_story/new_chapter may acquire the publication clock first; a missing
clock raises `55000` / `NCA_PUBLICATION_CLOCK_MISSING`.

### Authenticated browser transport

Use the existing authenticated `sb` Supabase browser client, schema `public`:
`sb.rpc('nca_get_push_preferences')` and
`sb.rpc('nca_set_push_preferences', {the seven exact keys above})`.
Authenticated EXECUTE, getter own-row RLS and setter auth.uid identity explicitly
support this path. No new server API, lifecycle cookie or direct table write.

## Client-side safety rules (not claims about DB internals)

- Revision stays a canonical non-negative decimal string, within signed bigint
  range. Send it as a JSON string, never through JavaScript Number.
- Validate the exact 13-key response: string revision, six actual booleans and
  six null or finite ISO timestamp strings. Reject malformed/incomplete/extra
  fields rather than manufacturing defaults. Retain timestamp text unchanged.
- Bind each request to a captured existing account session: verify its user ID
  matches the operation account, then pin its Authorization header on the same
  `sb.rpc` builder. Never display/log/persist that token. Discard work if the
  account or operation generation changes before dispatch or completion.
- Read when signed-in settings opens. Toggling only edits an in-memory draft;
  only an explicit `Lưu lựa chọn` click invokes the setter. No anonymous RPC.
- Validate successful setter output, including incremented revision and the six
  written values, before claiming success. Otherwise reconcile as unconfirmed.
- PT409: no automatic setter replay; perform one getter re-read, replace the
  draft with returned authoritative values and ask the user to review/save again.
- Ambiguous network/transport or malformed success: no automatic setter replay;
  perform one getter re-read if the same account/generation remains current.
  Show unconfirmed status, never claim that the preceding write succeeded.
  If reconciliation fails, clear editable authority until a fresh opening/read.
- Closing, logout or account switch invalidates in-flight reads/saves and clears
  private drafts/revisions. An unresolved write blocks duplicate saving; reopening
  must reconcile its outcome before permitting another save for that account.
- Category reads/saves never call lifecycle enable/repair/disable, ask notification
  permission, or alter a PushSubscription. Device disable never writes preferences.
- Internal errors/response bodies/IDs/tokens are not echoed into the UI.

## Production safety state

LOCAL implementation and mock-only tests. No production access, SQL/RPC execution,
credential changes, lifecycle/server/sender/fanout/service-worker changes,
active iPhone subscription changes, push/deploy or real Web Push are authorized
or performed by this task. Contract closure does not authorize deployment.
