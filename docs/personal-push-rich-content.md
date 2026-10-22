# Rich personal Web Push copy (local candidate)

Base imported from the user-supplied bundle:
`d60f0c6476d0a046738c4d255c5b33ace232ae96`, originally
`refs/heads/personal-push-disabled-deploy`. Development branch: `rich-personal-push`.
The existing `work` branch is preserved. No remote/production access is needed.

## Source evidence

The imported deployment history contains runtime sender code but omits the
reviewed sender migration/test sources. The exact consumed sender SQL remains
locally reachable at `640436fa8234ba30ac1466aae298e06742878a06`:
`database/migrations/20261020_personal_push_sender.sql`, SHA256
`918d9f61e34437c909ff0f1b0f322855bb4192ef43f9df437e90eacf6ab86168`.
It was inspected through the preserved local Git history; it was not restored
as a new production installer, changed, or run. The baseline prepare body MD5
is `8901ee381de45fe1e4af73f219e33207` (LF-normalized).

`tests/helpers/personal-push-sender-baseline.sql` copies only its three exact
routine definitions for local comparison/testing, not installation in production.
The scratch foundation/capture fixture derives from the prefix of
`tests/personal-push-fanout-v2-contract.test.cjs` at
`327d7f003f6f9409d897906cab29d2481dbda2e0`; presentation fixture columns are
explicitly added for this feature. These fixtures do not reconstruct lost source.
The reviewed offline sender tests/public test CA are carried forward from
`work` to cover the imported runtime; the historical consumed-installer source
assertion is replaced by checks for this new migration/current runtime boundary.

Current `tests/helpers/notifications-schema.sql` establishes notification FKs:
actor_id -> auth.users.id, story_id -> stories.id, chapter_id -> chapters.id,
comment_id -> comments.id. profiles.id is a primary key linked to auth.users.id;
profiles.display_name is the authoritative public label. Current bell rendering
joins notifications.actor_id to profiles.id and uses siteDisplayName(), whose
unknown/email-looking name fallback is `Thành viên`. Story title is the existing
stories.title field used by the frontend and the committed story baseline SQL.
Comment/mention/like triggers populate notification references; enrichment does
not follow comment content or infer a different story from a chapter/comment.
A null/missing notification story link therefore uses the story-less fallback.

## New migration and authority

`database/migrations/20261022_personal_push_rich_content.sql` replaces only
`public.nca_prepare_personal_push_delivery(uuid,uuid)` in a bounded transaction.
The baseline body/security/argument/config/ACL guard rejects drift before
replacement; null security config also fails closed. It verifies the two new
relations' relevant column identities and single-column primary keys.
Apply once only, in a controlled migration window without concurrent routine DDL.
If a guard fails, stop for source review; do not bypass or rerun older installers.

The routine remains postgres-owned, VOLATILE, SECURITY DEFINER, empty search_path,
with its original 2s lock timeout and 5s statement timeout. CREATE OR REPLACE keeps
the function OID, owner and existing ACL. No grants, table/schema/role changes,
new runtime calls, dynamic SQL or business 40001/40P01 are added.
The sender continues to call only its three RPCs; direct SELECT on profiles,
stories, notifications or any other application table is neither added nor
required. No sender DB/TLS/CA configuration changes.

After existing source/lease/recipient/category/expiry/preference/binding checks,
prepare adds exactly two optional fields inside `ready.notification`:

- `actor_display_name`: profiles.display_name where profiles.id = notification.actor_id;
- `story_title`: stories.title where stories.id = notification.story_id.

Both may be null. There are no caller-provided labels, extra routing identifiers,
chapter titles, email lookups, comment text or excerpts. Core id/category/story_id/
chapter_id/comment_id retain their existing values and decimal-string encoding.

The original notification -> event -> preference -> subscription -> delivery lock
order and all cancellation/error branches are unchanged. Metadata SELECTs add no
row locks and run only after those checks. Their latency remains subject to
existing SQL timeouts, worker preparation-age and lease/expiry checks. As before,
a delete after prepare commits and before the external send is not atomically
coupled to transport; this change adds no stronger delivery guarantee.

Claim/finish definitions, attempts/backoff, maxItems/budget, auth-before-DB gate,
transport, no-blind-retry and ambiguous-finalize accounting are unchanged.

## Presentation

Every personal title: `Alex hiện lên và nói`.

| Category | With a story | Without a story |
| --- | --- | --- |
| comment | `<actor> đã bình luận trong “<story title>”.` | `<actor> đã bình luận về truyện của bạn.` |
| reply | `<actor> đã trả lời bình luận của bạn trong “<story title>”.` | `<actor> đã trả lời bình luận của bạn.` |
| mention | `<actor> đã nhắc đến bạn trong một bình luận của “<story title>”.` | `<actor> đã nhắc đến bạn trong một bình luận.` |
| comment_like | `<actor> đã thích bình luận của bạn trong “<story title>”.` | `<actor> đã thích bình luận của bạn.` |

Actor fallback is `Thành viên`, never an ID or invented name. Unicode is NFC
normalized; controls (C0/DEL/C1/bidi overrides/isolates) become spaces; whitespace
is collapsed and trimmed. Malformed optional strings, strings over 8192 UTF-16
units, URL-looking labels, and actor labels containing @ use conservative
fallbacks. Actor labels are bounded to 60 and story labels to 120 UTF-16 units at
grapheme boundaries, with an ellipsis when truncated. Thus every body is <=240
units and fits the unchanged SW schema; title remains <=100. Quotes, apostrophes,
emoji and Vietnamese accents remain plain text, safely JSON-serialized.
Malformed core routing still throws INVALID_NOTIFICATION_SHAPE.

Tag remains `nca-notification-<notification_id>`; payload data still contains only
notification_id/category/story_id/chapter_id/comment_id. push-sw.js is unchanged:
clicks focus an existing same-origin window or open the app root, never a payload
URL. Manifest/app name, icons, grouping, lifecycle, permissions and registration
are untouched. iOS may display `from Nhà có Alex`; no payload reproduces or tries
to remove that OS-owned attribution. new_story/new_chapter are not implemented.

## Local validation and later production boundary

Targeted suites cover offline worker/auth/TLS/transport/DB adapter behavior,
rich/fallback/Unicode/control/length copy, strict core routing, existing SW schema
and navigation, and native PostgreSQL 17.11 prepare/ACL/cancellation/lease/expiry/
unlike concurrency with baseline claim/finish preservation. Native tests pin the
existing network-none container, one absolute Unix socket, explicit scratch DB,
version and identity; no application/production credentials are inherited.
Only local fixture functions/data are created; scratch roles/objects are cleaned.

Later steps, NOT performed/authorized here: review/apply the new migration once,
deploy the worker commit through the established workflow, then separately
approve controlled runtime verification. Do not use local scratch fixtures or the
historical consumed migration as a production installation procedure.

No production SQL/RPC, real Web Push, GitHub push, deployment, credential access,
secret output or production mutation was performed by this task.
