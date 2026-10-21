# Browser Web Push lifecycle (local implementation)

This implements the closed API V1 contract in
`docs/push-subscription-lifecycle-api-contract-v1.md`; it does not change the
installed V4, server lifecycle API, sender, credentials or deployment settings.
No production execution, deployment or real notification is authorized here.

## Public entry points and startup

`assets/push-lifecycle.js` provides `NcaPushLifecycle.create`. The existing app
creates the `pushLifecycle` instance using its existing `sb` and `authUser`.
After an account update, `applyAuthUser` synchronously invalidates old push work,
then schedules read-only initialization outside the Supabase subscriber lock.
`signOut` awaits bounded best-effort push cleanup before its existing Supabase
sign-out. Push cleanup errors cannot prevent that sign-out.

The future settings UI may call `pushLifecycle.initialize()`, `enable()`,
`repair()`, `disable({disable:true})`, and `getState()`. Enable/repair/disable
require a live `navigator.userActivation.isActive`. Permission is requested only
by explicit enable/repair, synchronously before asynchronous setup. No settings UI
is added. Startup never requests permission, registers a service worker, creates
an installation or subscribes/binds an account. No metadata means setup is needed;
first creation happens only on explicit authenticated setup. Existing metadata
allows status. Active self plus existing browser subscription with the configured
application server key is mutation-free. DB endpoint/key equality is not exposed
by the redacted API; ordinary reload cannot prove those hidden fields equivalent.
Changed/missing subscription repair is an explicit action, never a startup write.

`GET /api/push-config` returns exactly `{ok:true,vapid_public_key:...}` from the
existing public VAPID env variable, after canonical base64url and P-256 point
validation. No other env variable is accessed. Errors are sanitized, methods
other than GET return 405, all responses are no-store. No new env variable or
Vercel route change is needed: the existing filesystem routing handles the file.
The existing key must remain unchanged; generation/rotation is outside this task.

## Coordination, state and errors

All lifecycle work is serialized across origin contexts with Web Lock
`nca-push-subscription-lifecycle-v1`. Missing Web Locks disables lifecycle work
with `UNSUPPORTED_COORDINATION`; there is no local-only lock fallback. A second
Web Lock, `nca-push-subscription-browser-v1`, serializes actual PushManager
subscribe/unsubscribe operations, including mandatory logout mitigation when the
main lock is still held by an uncertain HTTP response. Browser mutation locks
remain held until the underlying operation settles, even after a reported timeout.
Ordinary release, unsubscribe and final safety-state updates stay inside the main
lock; epoch checks prevent stale cleanup from touching a new account's subscription.
This adds coordination only, no API/database authority. Account
and storage epochs invalidate old continuations after every awaited boundary
before further lifecycle authority is used. Sessions come only from
`sb.auth.getSession()`, must match the current account, and tokens are used only
in Authorization. The server independently verifies tokens. Optional anonymous
status/release never treat an invalid supplied session as valid authentication.
Cleanup intentionally omits Authorization so an expired session cannot obstruct
capability-authorized revocation.

LocalStorage key `nca.push.lifecycle.v1` contains only exact validated
installation_id, binding_id, binding_version and state. Versions remain decimal
strings/BigInt. `nca.push.lifecycle.safety.v1` is a nonsecret fail-closed barrier
(`blocked`, `repair`, `unknown`) shared across tabs and reloads. It is written
before mutation dispatch so crashes cannot silently clear uncertain work. No
capability, token, endpoint or subscription key is read from cookies or persisted
by this module. Local state is never server authority and cannot bypass capability,
account verification, ownership or CAS. As with V1, arbitrary same-origin script
compromise/storage tampering is not solved by this client module.

Requests use fixed relative URLs, credentials/mode same-origin, redirect:error,
and no-store. The browser supplies Origin and the HttpOnly cookie. Exact envelopes,
IDs, states, ownership, binding changes and +1 versions are validated before
acceptance. Browser subscription JSON is projected to endpoint/keys only, with
canonical endpoint allowlist and exact canonical base64url/P-256/key validation.
No mutator is retried. A 409 is returned for reconsidered user intent, not rebased.
Transport, invalid-success or timeout ambiguity freezes mutation via `unknown`.
The Web Lock remains held through the underlying HTTP response/body settlement,
even if timeout is reported first; abort is not a rollback/Set-Cookie guarantee.
An indefinitely unresponsive transport therefore fails closed and can hold the
lock; logout still uses a bounded local mitigation path. Status or explicit
repair may reconcile after the lock is available, never replay the old action.

Explicit repair confirms local unsubscription/no subscription first. Missing local
metadata also requires that confirmation before any fresh create, including when
a browser subscription survived lost metadata/capability. Failure reports old-account
push risk and prevents creation, rather than leaving an orphan endpoint deliverable. It then
uses status, or authenticated create on missing/unverifiable metadata/capability,
to rediscover/create the cookie-selected row. A malformed cookie cannot be fixed
by JS: the server rejects it, and the module stops. Old rows are not adopted by
account/endpoint; uniqueness conflict is surfaced. Another owner's binding must
be released before reserve. Self active/reserved repair uses recover and the old
cookie; unbound/disabled uses reserve then activate. Subscription acquisition
failure after reserve attempts release(false) with that confirmed reserved pair.

Disable uses release(true) before local unsubscribe. A terminal row skips release
only when its state already equals the requested disabled/unbound target; the
two states are never reported as interchangeable. A successful server disable
and failed local unsubscribe is reported distinctly. `disable({disable:false})`
unbinds without disabling and retains the browser subscription on confirmed
server success, matching logout semantics. Logout/account switch invalidates old
work and tries serialized anonymous status/release(false). Failed/unknown server
cleanup mandates local unsubscribe; confirmation requires true or a later null
getSubscription. Neither confirmed means `OLD_ACCOUNT_PUSH_RISK` plus risk=true,
blocking activation pending explicit repair and browser/OS mitigation. A future
settings UI must display that state prominently and offer browser/OS notification
disabling; there is no temporary settings UI in this slice. Local success alone
never claims DB revocation. Already displayed/queued/in-flight notifications
cannot be retracted by this code. Another account is never automatically bound.

## Service worker and platform behavior

`/push-sw.js` registers only on explicit setup with root scope `/` and
updateViaCache:none. An unrelated root worker is a conflict, not overwritten.
There is no fetch cache/offline shell or pushsubscriptionchange mutation handler.
Push payload must match the exact version=1/type=personal sender shape with bounded
strings, tag and decimal IDs/categories. Notification API strings are plain text;
no HTML is injected. Only notification_id is kept in notification data. A click
focuses a same-origin app client or opens the fixed same-origin root, ignoring
all payload URLs. Malformed payloads, client focus errors and OS notification
rejection settle safely. No push handler DB/API mutation is present.

iPhone/iPad require a supporting installed Home Screen PWA (iOS/iPadOS 16.4+),
user gesture, permission and the feature/coordination checks. iPad desktop UA is
also detected. Android installed PWAs and supporting Android browsers, and
compatible desktop browsers, share the same API/cookie/CAS architecture without
requiring installation. Unsupported platforms leave normal site auth/UI usable.
One account may keep independent subscriptions on multiple devices; there is no
account-level subscription deduplication. Browser/PWA storage sharing remains
platform-dependent, as the V1 contract states.

## Verification limits

Focused Node tests use synthetic subscriptions/session fixtures and fake HTTP,
PushManager, Notification, ServiceWorker, storage and Web Locks. Service worker
handlers run in an isolated VM with fake clients/notifications. Existing auth/UI
regressions use the repository's intercepted local browser harness. These do not
establish actual OS delivery, user-gesture quirks, Safari Home Screen behavior,
Vercel runtime configuration or production API reachability. Production smoke,
settings UI, deployment and real Web Push remain separate authorization gates.
