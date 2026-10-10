# Baseline View + Tim frontend — LOCAL ONLY

The user has already run/verified the baseline DB migration. This frontend work has not been committed/deployed and runs no production SQL. The existing untracked database/migrations/20261010_story_baselines.sql is unchanged from the previously reviewed migration.

## Implementation

index.html:
- mapStoryBaselines maps baseline_views/baseline_likes to baselineViews/baselineLikes, defaults missing fields to zero, and provides a view floor without adding baseline to an existing count.
- loadCloudStories maps baseline fields through the existing story fetch. Before the aggregate RPC finishes, story.views is at least the baseline.
- refreshPublicStoryCloudFields maps baseline fields during existing hydration, preserving an already returned authoritative view total. No new query is added.
- storyLikeTotal adds baselineLikes exactly once to the existing real published/loaded chapter-like sum. Existing storyLikeTotal wrapper still delegates to it.
- refreshStoryHeartStats updates the story-heart cells in home/saved cards, story detail and profile shelves after a successful chapter like/unlike. No query, layout or number-format change.
- toggleChapterLike retains its original INSERT/DELETE, user membership, per-chapter +/-1 and real-only chapter button; it invokes the story-heart DOM update afterward.
- saveManagedStory maps verified server baseline fields back into its story object. Its explicit metadata PATCH payloads remain unchanged and exclude baseline/views/likes.

applyStoryViewCount, refreshStoryViewCounts and recordStoryView are unchanged: RPC view_count already includes baseline, so the frontend assigns it directly. Successful INSERT's local +1 and authoritative post-INSERT refresh remain intact. Views sorting still uses story.views; all story-level heart displays still use storyLikeTotal. No story_likes query, fake event or user rows, comment/review heart/count modifications, auth changes or Step 2 progress changes.

## Before / after

After the DB migration, the old frontend already displayed total views after the RPC, but initialized views at zero and ignored baseline hearts. This patch shows a baseline view floor while waiting, then the same authoritative RPC total; story-level hearts now include baseline. Reader chapter heart counters/user state remain real-only. Existing hidden-chapter semantics are preserved.

## Local verification

Run node --test tests/story-baselines.test.cjs

Six browser/API-mock tests cover:
1. zero activity and consistent home/detail/saved/profile totals, real-only chapter heart, anonymous state, unchanged homepage request budget;
2. existing activity, ignored hidden chapter likes per current semantics, repeated hydration/RPC refresh/reload, exact signed-in membership, unchanged comments/reviews/progress;
3. delayed RPC showing the baseline floor, followed by authoritative replacement;
4. real view +1, temporary count RPC failure fallback, reconciliation without double baseline, uncached/cached opens and reader refresh;
5. real chapter like/unlike, user-scoped INSERT/DELETE, +/-1 across all story stats, unchanged baseline and zero chapter-heart baseline;
6. sorting by total views, missing-field defaults, actual admin metadata save and readback preserving baseline with no baseline field in PATCH requests.

33 existing regression tests pass: story-views, reading-progress, chapter-images, chapter-admin, home-feeds (including reviews/reply ordering), notifications, mention-autocomplete and admin-comments. All 11 nonempty inline scripts pass node --check; git diff --check passes. Tests mock Supabase REST, not production authenticated sessions.

## Request budget

Non-OPTIONS Supabase REST requests measured with local mocks (not latency/throughput benchmarks):

| Flow | Before baseline frontend | After |
| --- | ---: | ---: |
| Anonymous homepage bootstrap | 11 | 11 |
| Story detail using loaded data | 0 | 0 |
| Uncached chapter | 4 | 4 |
| Cached chapter | 2 | 2 |
| Cold reader refresh | 15 | 15 |
| Chapter like | 1 INSERT | 1 INSERT |
| Chapter unlike | 1 DELETE | 1 DELETE |

Baseline fields arrive in existing stories queries: zero additional baseline requests/writes. View RPC batches remain <=100; there is no view-history download. Existing chapter_likes pagination is unchanged, not optimized in this task. Progress queue costs remain those of approved Step 2.

Stop here for local review. No SQL, commit or deployment is needed until separately authorized.
