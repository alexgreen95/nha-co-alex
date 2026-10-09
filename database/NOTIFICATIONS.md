# Comment notifications

Apply `migrations/20261009_comment_notifications.sql` in the Supabase SQL Editor as the database owner. This is required for like/reply notifications; deploying JavaScript alone does not install database triggers.

The migration uses the actual columns, constraints and policies exported from this project on 2026-10-09. It keeps existing data, notification types, and recipient SELECT/UPDATE/DELETE policies. It installs triggers on comments, comment_likes and comment_mentions, and tightens their client INSERT permissions. No service-role key is used in the browser.

- Like: one notification per actor/recipient/comment for the lifetime of that notification, including unlike/re-like; existing read status is retained.
- Reply: notify the replied-to user, validated against the entire thread by first finding its root and then traversing descendants, or the parent owner when no valid explicit reply target exists. The notification points to the new reply.
- Mention: keep mention rows; skip self notifications and dedupe against the reply notification for the same recipient, actor and comment.
- Inserts and notification creation run in the same transaction. Existing notifications are not backfilled or deleted.
- Functions use a fixed empty search path. Only trigger functions can call the notification writer. Client-side reply/like/mention notification inserts are blocked after migration; existing other notification types keep their INSERT policy.
- The frontend checks a read-only readiness RPC before using the previous mention notification fallback, so deployment can safely precede SQL installation.

The SQL is idempotent. Re-run `notifications-inspection.sql` afterward to verify the three `nca_comment_*_notification` triggers and recipient-only read policy. Then test with two real accounts on the live site; production writes were not performed by the automated tests.

## Local checks

```sh
npm install --prefix /tmp/nha-db-tests --cache /tmp/nha-npm-cache @electric-sql/pglite --no-audit --no-fund
NODE_PATH="/tmp/nha-db-tests/node_modules:$NODE_PATH" node --test tests/notification-triggers.test.cjs tests/notifications.test.cjs tests/chapter-admin.test.cjs tests/chapter-images.test.cjs tests/home-feeds.test.cjs tests/performance.test.cjs
```

The database test runs real PostgreSQL trigger/RLS logic in PGlite using `tests/helpers/notifications-schema.sql`, derived from the supplied database export. Browser tests use synthetic API rows and check recipient filters, unread counts, mark-read, reply navigation and migration compatibility.

## Admin comments and moderation

After the first migration, apply `migrations/20261009_admin_comment_notifications.sql` separately in Supabase SQL Editor. No existing notification function/trigger is replaced. The existing `comment` type notifies every profile with `role='admin'` for a non-admin top-level comment. Story/chapter/comment references are retained; paragraph context remains on the referenced comment. A redundant mention to the same admin for the same new comment is suppressed; other mentions and all reply/like notifications keep their behavior.

Comment DELETE is allowed for the owner or a profile-role admin. A restrictive policy also prevents older permissive policies from granting deletion to other users. The existing parent foreign key cascades replies; likes, mentions and related notifications also cascade through their existing foreign keys. No data is deleted by the migration itself.

Profile role changes are blocked for browser clients, and new client-created profiles start as readers. This closes the existing permissive profile policies' self-promotion loophole; display-name/avatar/bio edits remain allowed. Assign admin roles through trusted database administration, not through frontend profile fields.

Additional tests: `tests/admin-comments-db.test.cjs` and `tests/admin-comments.test.cjs`.
