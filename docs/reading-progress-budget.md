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
