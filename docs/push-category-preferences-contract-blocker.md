# Account push category preferences — CONTRACT BLOCKED

This is a local source-inventory result and non-mutating UI preparation, not a
preference transport implementation or production verification. No production
connection, preference/lifecycle RPC, SQL, push delivery, credential change,
deployment or push was performed. The user's active iPhone subscription was not
read, reset, disabled, unsubscribed or replaced by this work.

## Evidence available

At starting commit `5691c7c6cb6c0341653972c7335e49151faf57a4`:

- `assets/push-settings.js` and `index.html` implement device lifecycle controls
  through the reviewed `pushLifecycle` methods only. They have no account
  preference reader/setter or preference request/response contract.
- `server/push-api.cjs`, `server/push-validation.cjs`, `server/push-db.cjs` and
  `api/push-subscriptions.js` expose only the six subscription lifecycle operations.
  They are not an account-preference bridge and are unchanged here.
- `database/migrations/20261020_personal_push_fanout_v2.sql` preserves a frozen
  catalog expectation for `public.push_preferences`: six NOT NULL boolean
  columns (type OID 16) named `comment_enabled`, `reply_enabled`,
  `mention_enabled`, `comment_like_enabled`, `new_story_enabled`,
  `new_chapter_enabled`; NOT NULL `revision` has type OID 20 (`bigint`/`int8`).
  Each enabled column has an associated nullable timestamptz enabled_since column.
  This artifact also records an authenticated SELECT policy fingerprint.
  A catalog expectation is not the getter/setter implementation, current live
  catalog proof, an RPC grant, or an HTTP/JSON contract.
- Current repository source has no definition, caller or complete contract for
  `nca_get_push_preferences` / `nca_set_push_preferences`. No exact preference
  argument names, response envelope or CAS transport can be derived from the
  subscription API or the fanout catalog snapshot.
- The user's supplied production history says application CAS conflicts were
  corrected to PT409. This bounded prior fact is preserved. It does not establish
  the missing callable signature, JSON representation or caller authority.

The SQL storage type is known; the getter/setter JSON revision representation is
not. It would be unsafe to choose a Number, decimal string, invented field name,
implicit default or missing-row revision behavior based only on that column.
The six product keys are independently known from the current request; mapping
those UI names to writable RPC parameters remains unimplemented.

## Minimum missing contract evidence

Supply already-reviewed authoritative getter and corrected setter source, or an
exact reviewed contract equivalent to those definitions, establishing:

1. Exact callable identities/signatures and named arguments, including authenticated
   caller/ownership/grant requirements and how current-account authority is derived.
2. Exact getter and setter result cardinality/envelope/types, six boolean mappings,
   revision encoding, missing-row/default behavior and fail-closed validation rules.
3. Exact CAS input and comparison, revision advancement, full-versus-partial update
   semantics, enable/disable timestamp semantics, PT409 conflict behavior, and
   definite-error versus unknown-outcome handling needed to prevent blind replay.

Only then can a browser RPC or minimal server transport be selected and reviewed.
No production query/diagnostic or source-recovery campaign is proposed or performed
here. Do not rerun consumed migrations or introduce business 40001/40P01 signaling.

## Non-speculative preparation saved

- Existing device lifecycle controls and logout/account-switch cleanup are retained.
- The signed-in modal has the six separately named category rows. They are disabled
  and explicitly indeterminate/unknown, not loaded/off/default values. The save
  button is disabled and has no save handler. No category fetch, RPC, data adapter,
  revision value, authentication mechanism, retry or mutation is invented.
- Opening/closing or changing accounts clears the unknown UI projection and hides
  it for signed-out visitors. No preference draft or private material is persisted.
- The close control is text-only × with transparent background, zero border/shadow
  and a 44px tap target; existing close/Escape/focus behavior remains unchanged.

Functional category editing, malformed-RPC-result handling, PT409 re-read/retry UI,
and preference account-isolation runtime tests remain NOT_IMPLEMENTED / BLOCKED
by the evidence above. Static absence of a speculative transport is not a claimed
runtime PASS for those behaviors. Deployment is not authorized by this preparation.
