# Reading progress cloud budget

Routine progress writes have a five-second minimum interval per account and story,
measured from the last acknowledged successful request. Local progress and the
reader's immediate tab snapshot still update independently of that budget.

The dirty map keeps the latest value. Both the queue timer and the in-flight
writer drain check eligibility. A valid explicit chapter open keeps its existing
recency semantics and may bypass the routine interval. An open-generation marker
ensures ordinary edits arriving during that request do not inherit the exception
after the open has been acknowledged.

Same-origin tabs serialize the writer with Web Locks. Successful-write clocks
are shared through CacheStorage and awaited before releasing the lock; these
records contain timestamps only, never reading positions or tokens. Synchronous
localStorage reads can lag a lock handoff in another renderer, so they are not
used as an authoritative shared clock. No service worker is involved. Browsers
without these storage/locking capabilities retain the per-runtime memory budget;
cross-tab enforcement cannot be guaranteed in that fallback.

Account/epoch, dirty-generation, and server-accepted last-write semantics remain
unchanged. No additional cloud row or conflict-resolution mechanism is added.
An abrupt process termination can still lose unacknowledged work if the browser
also discards its local/session snapshot; no synchronous unload delivery or new
durable signed-progress queue is claimed.

Validation: `tests/reading-progress-rate.test.cjs` exercises real 60-second idle,
continuous-scroll, paced-scroll and shared-tab scenarios, latest-value coalescing,
delayed responses, explicit opens, per-story/account isolation and guest state.

Failed writes use `assets/progress-retry.js`: invalid/auth/forbidden requests stop
until auth recovery or a new session. Transient failures use 3/6/12/30/60-second
delays with up to 10% positive jitter, at most six attempts in a 120-second window.
After exhaustion there is no idle timer loop; a later meaningful activity or
online/visible wake can start a new budget after a 60-second cooldown. Changes
arriving during backoff keep the existing deadline and replace only the dirty
payload. Offline attempts and retries while hidden are paused. Success resets
the retry state; logout/account changes invalidate the old work as before.
