# Optimization Step 2 — local implementation, not deployed

Scope: reading-progress synchronization and the saved-story synchronization formerly sharing its write path. No production SQL or deployment. Production catalog confirms reading_progress PK (story_id,user_id), owner SELECT/INSERT/UPDATE policies; saved_stories has owner SELECT/INSERT/DELETE and no UPDATE policy. No schema change is needed.

## Queue and lifecycle

index.html: activateMemberSync, setReadingProgress, queueCloudMemberState, loadCloudMemberState, saveCloudMemberState, queueSavedStoryState, saveCloudSavedStories; reader chapter changes, delayed scroll callback and toggleSave callers.

Each account has a story-keyed dirty map, generation counter, acknowledged baseline, epoch and AbortController. One progress promise per account serializes writes. Each request snapshots at most 100 dirty stories. A successful response clears only matching generations; changes made during the request remain for the next batch. Identical chapter/rounded-pixel values do not write. Scroll captures its story/chapter/account before the debounce and validates them afterward. General save()/admin persistence cannot dirty progress.

Switching accounts cancels timers, aborts pending requests, invalidates response epochs and clears pending old-account intents. Payloads and filters capture their account ID. A request already accepted by the server may finish for its original account; it cannot be retargeted to the new account. Late loads preserve edits acknowledged or pending since the load began. The chapter-ID map is fully paginated; actual loaded chapter IDs take precedence over chapter-number fallback.

Progress uses a batched owner-scoped upsert with onConflict story_id,user_id. Saved stories have a separate queue/promise and explicit INSERT/DELETE for touched IDs. A duplicate INSERT triggers a bounded lookup of only touched IDs, then INSERT of missing IDs; never DO UPDATE. Saved toggles do not reconcile or remove unrelated remote saved stories.

## Request/write budget

Measured with local browser REST mocks, excluding bootstrap reads and other independent reader requests. Writes below mean rows written, not HTTP calls. Baseline is the Step 2 audit's old sync path: one saved-story GET plus existence GET/write for every progress story.

| Scenario | Before requests / progress rows written | After requests / progress rows written |
| --- | --- | --- |
| 1 history story, 1 changed | 3 / 1 | 1 / 1 |
| 10 history stories, 1 changed | 21 / 10 | 1 / 1 |
| 50 history stories, 1 changed | 101 / 50 | 1 / 1 |
| 50 history stories, 3 changed | 101 / 50 | 1 / 3 |
| unchanged/admin save, 50 history stories | 101 / 50 | 0 / 0 |
| saved add only, 50 history stories | 102 / 50 (+1 saved row) | 1 / 0 (+1 saved row) |
| one progress change plus saved add | 102 / 50 (+1 saved row) | 2 / 1 (+1 saved row) |

For stable known chapter IDs, K changed stories require ceil(K/100) progress POSTs and K row writes, independent of history N. Edits during flight may require subsequent batches. Failures retry retained work; saved duplicate resolution may add a bounded GET and INSERT. Initial cloud hydration still reads the member's progress/saved history and chapter map; this change optimizes writes, not startup queries.

## Validation

Run: node --test tests/reading-progress.test.cjs

Browser mocks cover history 1/10/50, multiple dirty stories, no-op/admin saves, single-flight, edits during flight, retained failed writes, rapid scroll, stale/null reader callback, logout/account switch, late hydration, saved/progress independence, saved reversal during flight, duplicate INSERT, remote unrelated saves/progress, chapter/pixel resume, explicit chapter reset, slow and fast chapter navigation, refresh and anonymous RAM-only state. Tests intercept REST; they do not load-test production.

Regression suites: story-views, chapter-images, chapter-admin, mention-autocomplete, admin-comments, notifications and home-feeds. Inline script syntax and git diff --check also pass. Local PGlite reconstruction of supplied production catalog verifies owner progress upsert, saved UPDATE rejection, cross-user isolation, anonymous RLS and chapter-delete cascade.

## Remaining limits

Different-story edits no longer rewrite each other's history. Same-story writes from two tabs/devices remain last server-accepted write; there is no revision/CAS mechanism. Client updated_at remains descriptive metadata and is not compared to choose a winner. Tests explicitly demonstrate a stale same-story write can overwrite a newer remote position.

Dirty queues are memory-only, as before. Abrupt tab closure/refresh before acknowledgement, network failure followed by closure, or logout can discard pending work. Abort cannot undo a server-committed request. No reliable unload delivery or offline persistence is claimed. Existing 120ms scroll debounce plus 450ms progress debounce remains; sustained activity has a 3-second scheduling ceiling. Future durability/conflict changes need separate review.
