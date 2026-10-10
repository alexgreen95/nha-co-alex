# Step 5B — LOCAL draft read contracts

Base: `f481aa0737c6209e040a9d32d65502b7f644130e`.
Migration: `migrations/20261010_comment_counts_step5b_draft.sql`.
**Not applied to production. Frontend is not wired to these RPCs yet.**
The global comment content loader remains unchanged. These contracts are the
independently reviewable SQL foundation for later frontend wiring/pagination.

## Signatures and response contracts

| Function | Input limit | Scalar response | EXECUTE |
|---|---|---|---|
| `nca_story_comment_counts(bigint[])` | 100 supplied story IDs | `[{story_id,comment_count}]` | anon/authenticated |
| `nca_chapter_comment_counts(bigint,integer,integer[])` | one story/chapter-index context; 1000 supplied paragraph indices | `{story_id,chapter_index,chapter_comment_count,paragraph_counts:[{paragraph_index,comment_count}]}` | anon/authenticated |
| `nca_profile_comment_count(uuid)` | one public comment-author ID | bigint | anon/authenticated |
| `nca_comment_like_counts(bigint[])` | 1000 supplied comment IDs | `[{comment_id,like_count}]` | anon/authenticated |
| `nca_my_comment_likes(bigint[])` | 1000 supplied comment IDs | `[comment_id,...]` | authenticated only |

Counts include roots and all descendant replies, not just loaded roots. Story
counts include every scope. Profile count includes all visible comments by that
author. Chapter general count includes `scope='chapter'`; paragraph markers
include `scope='paragraph'` and legacy NULL scope, matching `cloudCommentKey()`.
Chapter/paragraph indices are existing stored **zero-based indices**, not chapter
IDs or paragraph numbers. The RPC does not invent a chapter-ID foreign key.
No baseline is added. No `parent_id` filtering or recursive traversal is needed
for these aggregates; legacy deeply nested parents still contribute exactly once.

Array limits apply before deduplication. Duplicate IDs/indices return one result.
NULL arrays/elements, multidimensional or oversized arrays raise SQLSTATE 22023.
Chapter/paragraph indices must be nonnegative. Empty arrays return `[]`; an empty
paragraph array still returns the general chapter count and empty markers.
Visible existing stories/comments with no activity return zero; missing or
RLS-invisible IDs are omitted. Unknown/invisible chapter-context story returns
SQL NULL. An unknown profile author ID returns zero. A role authenticated with
no `auth.uid()` returns empty membership. Membership takes no arbitrary UUID.
Objects/IDs are ordered ascending by requested identifier/index.

All functions are STABLE SECURITY INVOKER with `search_path=''`. PUBLIC EXECUTE
is revoked, then only the table above is granted. Existing SELECT grants/RLS
remain authoritative: exact means exact over the caller's visible rows. No
liker UUID, comment body, profile or mention rows appear in results.

Scalar JSONB avoids truncating aggregate output by PostgREST's row cap; it does
not bypass query timeouts, bandwidth quotas or RLS. Maximum output is bounded
by the input: 100 story objects, 1000 marker/count objects or membership IDs.
Scalar profile count always returns one value. Aggregate scan work can still
grow with matching history even though response size does not.

## Why five RPCs

General chapter count and paragraph markers share one context RPC. Story batch
and profile count serve different contexts. Public like counts and private
membership remain separate so anonymous never invokes private membership.
No all-purpose RPC or persistent profile cache is introduced.

## Database compatibility and indexes

Existing comments `(story_id,created_at)` supports story filtering; comments PK
supports bounded requested-comment joins; comment_likes unique
`(comment_id,user_id)` supports aggregate/membership lookups by supplied IDs.
Production has no verified comment-author index, nor a chapter/paragraph compound
index. Profile/chapter aggregate execution may scan more rows. No index is added
without a separately reviewed actual execution-plan finding. No production
EXPLAIN/SQL was run in this phase.

Migration creates only five functions and their grants in one transaction.
No table, row, policy, index, trigger or existing function is altered. CREATE
FUNCTION deliberately fails on an existing same-signature function rather than
silently replacing it. Do not rerun blindly. Existing notification migrations
are installed alongside this draft in local DB tests; real local like/unlike
and cascade deletion still update counts and preserve notification behavior.

## Budgets — projected contract use, not deployed behavior

| Page content awaiting enrichment | Anonymous like RPCs | Signed-in like RPCs | Output maximum |
|---|---:|---:|---|
| 20 roots | 1 | 2 | 20 counts + up to 20 own membership IDs |
| 6 replies | 1 | 2 | 6 counts + up to 6 own membership IDs |
| Combined 26 comments, if loaded together | 1 | 2 | 26 counts + up to 26 own membership IDs |

This remains constant regardless of total historical like rows. A story-count
batch adds one request per <=100 stories; one chapter-marker context adds one
per <=1000 requested paragraph indices; one profile count adds one scalar RPC.
Future root/reply content, mention and profile requests are additional; mention
cardinality needs its own bounded pagination and is not solved here.

Current runtime remains unchanged: controlled uncapped history mocks for
100/1000/10000 comments used 4/13/103 requests, including all comment/like rows.
No runtime request reduction is claimed before SQL approval and frontend wiring.
Frontend compatibility test uses a test-only bridge, not actual deployed RPC
calling/account-race coordination. It checks count semantics and A/B/A/logout
heart rendering. Async enrichment guards belong to later frontend integration.

## API Max Rows verification without test data

Read the project's Supabase Dashboard **Settings → Data API / API → Max Rows**
(label/location may vary with dashboard version). Record the configured numeric
value; do not change it. For self-hosted PostgREST, inspect effective `db-max-rows`
configuration (`PGRST_DB_MAX_ROWS`/configuration file) read-only. Catalog hints
being NULL or receiving a small result set do not establish that the cap is
unlimited. Do not create test rows or infer the cap from production row count.
These RPC response bounds remain enforced even while that setting is unknown.

## Local validation

Run with PGlite and Playwright installed outside the repository:

```
NODE_PATH=/tmp/nha-db-tests/node_modules node --test tests/comment-count-contract.test.cjs
NODE_PATH=/tmp/nha-db-tests/node_modules node --require /tmp/nca-test-offline-sdk.cjs --test tests/comment-count-compatibility.test.cjs
```

No production database or network mutation is used. `index.html` remains
byte-identical to HEAD; Steps 1–4, navigation, mobile CSS and writers are untouched.
