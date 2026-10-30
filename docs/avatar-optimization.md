# Avatar upload and existing-object remediation

The profile editor accepts static JPEG, PNG and WebP files up to 5 MiB. Before
Storage upload, `assets/avatar-upload.js` validates the container, rejects
animated APNG/WebP and unsupported formats, applies image orientation and resizes
without upscaling to at most 512 px on the long edge. Output is at most 200 KiB.
Small compliant images are retained without unnecessary re-encoding.

WebP is preferred. If the browser cannot encode WebP, opaque images use JPEG;
transparent images use PNG to preserve their appearance. Unsupported animation
is rejected with a message instead of silently keeping only its first frame.

The upload uses a new unique path and never overwrites the previous active
object. The profile URL changes only after successful optimization and upload.
Account/selection guards prevent a late optimization from applying to a new
account or a different image selection. Concurrent Save clicks share one task.
Failed upload/profile updates retain the previous profile URL. An upload whose
profile update fails may leave a staged object; it is not blindly deleted because
a lost response could hide a committed profile update.

## Existing Storage objects

The client change does not rewrite or delete existing avatars. A separate
authorized inventory is required before remediation:

1. Enumerate all `profiles.avatar_url` references and Storage `avatars` objects,
   with pagination. Include references in auth metadata and any additional
   consumers before calling an object orphaned. All current app avatar surfaces
   resolve through profiles, including comments/reviews and notification actors.
2. Record byte sizes, content types, dimensions, modification/ETag metadata and
   reference counts. Do not infer orphan status from a filename or age alone.
3. Download referenced oversized objects once, preserve backups and original
   metadata, optimize static images without changing their visual content, then
   validate decoding, aspect ratio, orientation and size. Keep unsupported
   animated formats unchanged unless a separate animation-preserving conversion
   has been validated.
4. Upload a new unique optimized object, verify its public URL and decoded image,
   and update only references still pointing to the audited original. A
   conditional update prevents overwriting a concurrent user avatar change.
5. Verify account/profile, comment/review and notification avatar rendering.
   Retain replaced originals for rollback and existing cached clients.
6. Re-read references and object metadata immediately before deleting an old
   orphan candidate. Delete only the exact verified manifest paths; retain
   anything ambiguous, recently staged, or still referenced. Record exact paths
   and sizes of every removal. Never delete a newly active optimized object.

No schema, RLS or authentication-model change is required. Live inventory and
cross-account remediation require appropriately scoped administrative access;
public reads alone cannot prove orphan status for all users.
