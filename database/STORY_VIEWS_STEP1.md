# Optimization Step 1: story views

Local implementation only. No production SQL or deployment has been performed.

## Verified production metadata

The user supplied a read-only catalog export from PostgreSQL 17.11. `story_views`
has `id`, `story_id`, nullable `user_id`, and `created_at`. Each row is a view
event. `story_id` references `stories.id` with ON DELETE CASCADE. There is no
view counter column, view trigger, or story_id index; only the primary-key
index exists. SELECT allows public reads. INSERT allows a null user_id or
auth.uid(). Both anon and authenticated have SELECT/INSERT privileges.

## Manual SQL, then deployment

Run `migrations/20261010_story_view_counts.sql` in Supabase SQL Editor and report
success before authorizing frontend deployment. Do not deploy frontend first:
it requires the new RPC. The migration is compatible with PostgreSQL 17 and
was executed twice successfully on local PostgreSQL 18.3 via PGlite.

The migration creates a story_id index and a bounded, SECURITY INVOKER RPC.
It changes no policies, triggers, event data, or existing INSERT behavior.
It does not use a service-role key. A normal CREATE INDEX briefly takes a
write-blocking table lock; the supplied catalog estimates 86 view rows.

`nca_story_view_counts(bigint[])` returns one count per existing, visible
requested story, including zero for a story without views. The limit is 100
IDs per call. Only aggregates cross the network. Repeated views by the same
user still count separately; this is not a unique-view counter.

After each successful view INSERT, the frontend updates the local count and
requests the authoritative count for that story. Counting committed rows
avoids read/modify/write counter races. Request sequence and local write
revision guards reject stale responses. Counts reflect the query snapshot;
other readers' later inserts are visible on the next count refresh.

If INSERT fails, the count is unchanged. If the RPC fails after INSERT, the
confirmed event remains recorded and the local +1 is retained until a later
successful count refresh. There is no fallback that downloads history.

## Changes

- `index.html`: new aggregate/count display helpers; existing stats hydration
  calls RPC instead of paginating views; recordStoryView refreshes one story;
  read/moveChapter/goChapter remove their former extra local increment.
- `migrations/20261010_story_view_counts.sql`: manual index/RPC migration.
- `story-views-inspection.sql`: read-only diagnostic previously supplied.
- `../tests/story-views.test.cjs`: browser/API mock scenarios and request budgets.
- `../tests/story-views-db.test.cjs`: local database semantics and RLS tests.

## Request budget

REST requests only; excludes preflight, auth token calls, binary assets and
gate API. Baseline is the previous committed frontend. Comparisons use local
Chromium and mocked Supabase, not a production load test.

| Flow | Before | After |
| --- | ---: | ---: |
| Stats hydration, 100,000 historical events and <=100 stories | 103 | 3 |
| View-history GETs within that hydration | 101 | 0 |
| Open uncached chapter after bootstrap | 3 | 4 |
| Open cached chapter after bootstrap | 1 | 2 |
| Cold anonymous reader, small history | 14 | 15 |

The extra reader request retrieves the authoritative count after INSERT.
At 100,000 historical events the cold anonymous budget becomes 114 -> 15
(derived by replacing the 101 history GETs with one aggregate request).
Counts need ceil(story IDs / 100) RPCs per hydration; history length no longer
controls the number of frontend requests or downloaded view rows.

The database still performs indexed exact aggregation. This step removes
history transfer; it is not a throughput benchmark or a guarantee for any
number of simultaneous readers. Counter/materialized designs are outside
this step and would require separately reviewed semantics/security work.

## Validation

New tests cover anon/authenticated views, uncached/cached opens, next/TOC
navigation, refresh, no writes on render/hydration, count/UI update, failed
INSERT/RPC, stale responses, concurrent requests, bounded batches, 10,000
existing database events, 50 queued concurrent INSERTs, repeat views, RLS
forged-user rejection, SECURITY INVOKER visibility, and idempotent migration.

Existing browser suites cover chapter images, home feeds/reply ordering,
notifications, mention autocomplete, and settled layout. One layout timing
test failed during the parallel suite run and passed on standalone rerun;
the unchanged baseline also passed standalone. No unrelated code was changed.

Reading progress, auth, comment/reply/review/like behavior, notifications,
mentions, images, navigation, theme and fonts retain their implementations.
