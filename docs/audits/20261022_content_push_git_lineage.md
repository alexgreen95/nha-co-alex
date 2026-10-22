# Content Push Schema Lineage Audit

Audit date: 2026-10-22
Starting HEAD: `429c5da1135d0cd794001500ef5e0d8354ff45fd`
Starting working tree: clean

## Scope and method

Read-only search of locally available Git refs and objects. Used targeted
`git log --all --full-history`, `--find-renames`, `-S`, and `-G` searches for
table creation, identity/sequence changes, preference CHECKs, publication
metadata, event expiry, and FK targets; inspected matching historical blobs
with `git show <commit>:<path>`. No remotes were contacted. No unreachable-object
or reflog recovery was attempted.

## Historical artifacts

| Commit | Subject / date | Historical path | At current HEAD? | Finding and authority |
| --- | --- | --- | --- | --- |
| `327d7f003f6f9409d897906cab29d2481dbda2e0` | `preserve reviewed personal push fanout v2`, 2026-10-20 | `database/migrations/20261020_personal_push_fanout_v2.sql` | No; file exists only in local Git history, reachable from `work` and several local refs, not an ancestor of this HEAD | Freezes expected catalog records for all `push_preferences` columns and CHECK fingerprints, `push_subscriptions`, `push_deliveries`, and FK names/targets. Header says it uses accepted current-snapshot evidence and is not a recovered/lost-source-equivalent migration. High confidence as a historical reviewed catalog contract; not original table-creation DDL. |
| `702b09f6b8d93e51deddaf1cb5abfec5f6c7f65c` | `preserve reviewed foundation contract collector`, 2026-10-20 | `database/verification/20261020_web_push_foundation_contract_collector.sql` | No; local historical blob only | Read-only catalog collector, not a schema installer or captured output. Its own header disclaims restoration of a lost migration. It cannot prove the result of an execution from source alone. |
| `5c6ebfe63cd90f1006c30bddde327ee672b3794b` | `preserve push category preferences contract`, 2026-10-22 | `docs/push-category-preferences-contract-v1.md` | No; local historical blob only | Records a bounded history search and says the fanout artifact proves storage expectations, not missing preference RPC semantics. It identifies the historical `20261013_push_preferences_pt409_corrective.sql` as absent from that evidence. |
| `364bbab2c3facfd358fb6645dad8e606e3ef9ae0` | `feat: add rich personal push copy`, 2026-10-22 | `database/migrations/20261022_personal_push_rich_content.sql` | Yes | Guard checks `stories.id` type and primary key, but makes no identity-state assertion. It consumes the existing table; it does not create it. |
| `c8ae63962fd0a79f13b6d9d1670b360e7edf8e21` | `feat: add content web push delivery`, 2026-10-22 | `database/migrations/20261022_content_push_delivery.sql`; `tests/helpers/content-push-foundation.sql` | Yes | Migration manifest and test fixture supply the no-identity and CHECK expectations under review. Migration calls the manifest a local candidate, not a recovered production fingerprint; fixture labels itself a local model. Neither is historical production DDL. |

The historical fanout migration stores CHECK fingerprints and FK target names,
not the source `CREATE TABLE` statements or deparsed CHECK expressions. The ten
conflicting legacy entries are `push_preferences_revision_check`,
`push_preferences_check` through `push_preferences_check3`,
`push_preferences_updated_at_check`, and the four legacy `*_enabled_since`
finite-timestamp checks for comment, reply, mention, and comment-like. The local
fixture models these as `revision >= 0`, switch/timestamp consistency, finite
`updated_at`, and null-or-finite timestamps; the fingerprint artifact itself
does not prove that SQL text. This is a conflicting historical contract versus
local candidate manifest, not proof of which source DDL originally created
those constraints. The historical preference audit explicitly limits what
those fingerprints prove.

The frozen FK records mean `push_subscriptions.user_id` and
`push_preferences.user_id` reference `auth.users(id)` with `ON DELETE CASCADE`;
the latter is also the preference primary key. The nullable
`push_deliveries.personal_notification_id` references
`public.push_personal_events(notification_id)` with `ON DELETE CASCADE`. These
are recorded historical catalog expectations, not recovered FK-creation DDL.

## Lineage status by unresolved item

| Item | Historical evidence | Classification | Conclusion |
| --- | --- | --- | --- |
| `stories.id` / `chapters.id` identity | No table-creation or identity-conversion DDL found. The rich-content guard only checks `stories.id` type/PK. `20261010_story_baselines.sql` alters existing `stories` without defining its ID. | `NO_LOCAL_LINEAGE_FOUND` | Git history does not establish the intended identity state for either ID. The content migration's empty-identity manifest is only a local candidate expectation. |
| Ten legacy `push_preferences` CHECKs | The reviewed fanout-v2 contract freezes named CHECK fingerprints and legacy preference storage; its SQL consumer maps the four personal switches to their `*_since` values and suppresses delivery when disabled, missing, or later than the event. The synthetic fixture gives readable examples of revision/timestamp validity checks but is not lineage. | `CONFLICTING_LINEAGE_FOUND` | A prior reviewed catalog contract conflicts with the content candidate's ten legacy CHECK hashes. No original CHECK DDL was recovered; hashes alone cannot establish exact expression text or explain the difference. |
| New-story/new-chapter preference CHECKs | The same historical contract has fingerprints, but it predates the current candidate branch and does not supply original DDL. Current content migration and fixture encode the current local expectations. | `CONFLICTING_LINEAGE_FOUND` | Historical fingerprint expectations and current local candidate expectations differ; local history does not establish when or why the catalog definition changed. |
| `content_publications` genuine/legacy/import CHECK | Only the 2026-10-22 content candidate and its explicitly synthetic fixture define the expected shape. No earlier creation/ALTER DDL found. | `NO_LOCAL_LINEAGE_FOUND` | Repository history does not establish the original production constraint or whether the stricter legacy/import form supersedes the local model. |
| `push_content_events` expiry CHECK | Only the 2026-10-22 content candidate and synthetic fixture define the finite timestamps, positive lifetime, and 24-hour maximum. No earlier creation/ALTER DDL found. | `NO_LOCAL_LINEAGE_FOUND` | Repository history does not establish the original production constraint. |
| `push_subscriptions.user_id` FK | Fanout-v2 reviewed catalog contract names `auth.users(id)`; no original table-creation DDL found. | `AUTHORITATIVE_LINEAGE_FOUND` | Historical reviewed contract establishes the expected referenced schema/relation/column for that snapshot, but not the DDL provenance or current catalog state. |
| `push_preferences.user_id` FK | Fanout-v2 reviewed catalog contract names `auth.users(id)`; no original table-creation DDL found. | `AUTHORITATIVE_LINEAGE_FOUND` | Same bounded conclusion: target mapping is frozen in a reviewed historical contract, not in recovered creation DDL. |
| `push_deliveries.personal_notification_id` FK | Fanout-v2 reviewed catalog contract names `public.push_personal_events(notification_id)`; no original table-creation DDL found. | `AUTHORITATIVE_LINEAGE_FOUND` | Same bounded conclusion: target mapping is frozen in a reviewed historical contract, not in recovered creation DDL. |
| `push_subscriptions`, `push_deliveries`, `push_personal_events` remaining shape | Fanout-v2 migration contains expected column, CHECK, key, and index records and says it relies on accepted current-snapshot evidence. No historical base `CREATE TABLE` source found. | `AUTHORITATIVE_LINEAGE_FOUND` | Historical contract evidence exists for the reviewed snapshot; it is not original schema DDL and does not independently prove present-day catalog state. |

## CHECK meaning and implications

The candidate fixture describes `push_content_events` expiry checks as finite
timestamps, `expires_at > created_at`, and `expires_at <= created_at + 24 hours`.
It describes the publication CHECK as valid metadata for genuine publications
and a constrained shape for publication origins. The historical personal-push
consumer checks each legacy preference switch against its timestamp and event
time; the fixture models `revision >= 0`, finite `updated_at`, finite-or-null
preference timestamps, and switch/timestamp consistency. These are meanings in
the local model/consumer contract, not recovered SQL text for production.

The content lane captures and references story/chapter IDs; it does not insert
into `stories` or `chapters`, so it has no semantic requirement that their IDs
lack identity. The lane inserts genuine publication records with positive
publication metadata and short-lived events, but Git history does not prove the
exact pre-existing CHECK trees. Existing personal-push delivery consumes the
legacy preference columns, so the historical fingerprints are relevant to
shared-schema compatibility even though the content lane selects only the new
category fields.

## Remaining unknowns and next action

No authoritative original DDL was found for the story/chapter ID definitions,
the content publication/event tables, or the exact production CHECK expression
text. The local history cannot establish whether the historical contracts were
installed or superseded in the current catalog. Current approved catalog
evidence is still required for an installation preflight; it cannot be
substituted with historical expected fingerprints.

Safest next operator action: preserve and review the authoritative source DDL
or migration archive for the shared content schema and CHECK constraints before
changing the candidate manifest or attempting another installation preflight.

No application or migration code changed. No production access, Supabase,
fetch/pull/push, deploy, or SQL installation occurred.
