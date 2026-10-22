# Account Web Push category preferences contract v1

**Verdict: CONTRACT STILL BLOCKED.**

This freezes the useful LOCAL evidence and its limits; it does not invent a
getter/setter contract or reconstruct lost source. No preference transport is
authorized by this document. Historical production reports are not substitutes
for locally available authoritative routine definitions.

## Evidence and bounded search

Inspected starting HEAD: `1cd68bfdc8737aad98177f9f18ce47d7381eed18`.
The working tree was clean. There were 204 reachable commits across local
`work`, `release/mobile-reading-account-ui`, and existing `origin/main` refs.
No fetch, reflog search, unreachable-object search, temporary-file search or
broader recovery was performed.

The tracked tree was searched for `push_preferences`,
`nca_get_push_preferences`, `nca_set_push_preferences`, and
`NCA_PUSH_PREFERENCES_REVISION_CONFLICT`. Reachable history was searched with
`git log --all --name-only -G` for preference symbols and `REVISION_CONFLICT`,
and path history for `*push_preferences*` / `*push-preferences*` was inspected.
No getter/setter definition or exact reviewed preference RPC contract was
recovered. The historical `20261013_push_preferences_pt409_corrective.sql`
is not present in this searched evidence. This is a bounded local inventory,
not a claim about production's current catalog or unavailable external history.

Sources used (paths are relative to repository root):

| ID | Artifact | Exact source commit | SHA256 |
| --- | --- | --- | --- |
| S1 | `database/migrations/20261020_personal_push_fanout_v2.sql` | `327d7f003f6f9409d897906cab29d2481dbda2e0` | `b8920de69f066243d7f22059720d4c6c413519166ab2dbccc80d867ee19bf7dd` |
| S2 | `database/verification/20261020_web_push_foundation_contract_collector.sql` | `702b09f6b8d93e51deddaf1cb5abfec5f6c7f65c` | `7550c12f2065a3191838d916fa7f64b4248c6b7ceb32750d76b86450c3fdd760` |
| S3 | `docs/push-category-preferences-contract-blocker.md` | `1cd68bfdc8737aad98177f9f18ce47d7381eed18` | `4f66570c404767850f266d6f32a12f84752cce1c5fb70602a14ce75d16410fba` |
| S4 | `server/push-validation.cjs` | `7cbff43c2bc182e82f1fd9d185e8f8442f4cfd7e` | `cb7d9e8dd1328b1f5118e2bfdaba4d62db6ef969a246a76cc2f035f654102330` |

S1–S4 working-tree bytes were verified against the cited committed blobs.

## PROVEN: storage expectations, not RPC semantics

S1 line 37 contains a frozen expected catalog record for
`public.push_preferences`; lines 49–51 show how its column records are compared.
The record establishes these expected SQL columns:

| Product category | Boolean column | Associated timestamp column |
| --- | --- | --- |
| comment | `comment_enabled` | `comment_enabled_since` |
| reply | `reply_enabled` | `reply_enabled_since` |
| mention | `mention_enabled` | `mention_enabled_since` |
| comment_like | `comment_like_enabled` | `comment_like_enabled_since` |
| new_story | `new_story_enabled` | `new_story_enabled_since` |
| new_chapter | `new_chapter_enabled` | `new_chapter_enabled_since` |

All six enabled columns are NOT NULL SQL boolean (type OID 16). Their since
columns are nullable timestamptz (OID 1184). The same expected record has
`user_id` as NOT NULL UUID (OID 2950), `revision` as NOT NULL bigint/int8
(OID 20), and `updated_at` as NOT NULL timestamptz. These are storage
expectations, not proof of six RPC parameter names or result keys, defaults,
revision range, initial revision, or JSON encoding.

S1 lines 254–259 explicitly map the four personal event categories to their
enabled/since columns. Its consumer suppresses expansion unless enabled is true
and since is non-NULL and not later than the event. This does not define getter
missing-row behavior, setter timestamp transitions or new-story/chapter sending.

S1 line 37 also records an authenticated SELECT policy name/fingerprint;
lines 125–129 reject private-table DML authority while exempting preferences
from that guard's SELECT prohibition. Neither is an EXECUTE grant, an exact
policy predicate, a preference API authorization contract, or a current
production privilege result. CHECK/default fingerprints in the expected record
cannot be decoded into missing setter behavior.

S2 lines 70–92 discover routines only through recorded dependencies. Lines
346–367 would emit discovered routine metadata, but intentionally exclude bodies;
lines 440–443 explicitly mark discovery non-exhaustive. Collector source is not
its execution output and establishes no actual getter/setter metadata here.
Even a discovery-completeness flag could not substitute for missing routine bodies.

## Getter: NOT PROVEN / MISSING

`nca_get_push_preferences` appears as a candidate name in S3 lines 28–31;
that inventory statement is not authoritative function DDL.

| Required contract item | Evidence status |
| --- | --- |
| Exact schema-qualified function identity, overload and named arguments/types/order | NOT PROVEN / MISSING |
| SECURITY INVOKER/DEFINER, owner, search_path | NOT PROVEN / MISSING |
| Exact EXECUTE grants/revokes and permitted browser/server callers | NOT PROVEN / MISSING |
| Account identity source and account isolation | NOT PROVEN / MISSING |
| SQL return type, result cardinality, exact response envelope and six boolean keys | NOT PROVEN / MISSING |
| Missing-row behavior and any synthetic defaults | NOT PROVEN / MISSING |
| Returned revision field/type/encoding | NOT PROVEN / MISSING; only SQL table storage is evidenced |

## Setter: NOT PROVEN / MISSING

`nca_set_push_preferences` appears as a candidate name in S3, not as a recovered
routine definition. No exact callable signature is frozen by this document.

| Required contract item | Evidence status |
| --- | --- |
| Exact schema-qualified function, argument names/types/order, presence or absence of user UUID | NOT PROVEN / MISSING |
| Authenticated identity source and caller authorization | NOT PROVEN / MISSING |
| SECURITY posture, owner, search_path, exact EXECUTE grants/revokes | NOT PROVEN / MISSING |
| Exact return type/cardinality/JSON shape and revision encoding | NOT PROVEN / MISSING |
| CAS input, comparison, NULL/invalid/stale handling | NOT PROVEN / MISSING |
| Revision advancement, unchanged-value behavior, overflow handling | NOT PROVEN / MISSING |
| Missing-row/create semantics, initial revision, concurrent first-create behavior | NOT PROVEN / MISSING |
| Six boolean write parameters/mapping, full-vs-partial update semantics, enabled_since/updated_at transitions | NOT PROVEN / MISSING |
| Exact PT409 conflict branches and message | NOT PROVEN / MISSING |
| Absence of explicit application business-conflict 40001/40P01 branches | NOT PROVEN / MISSING |
| Ambiguous transport outcome, safe re-read/reconciliation and replay rules | NOT PROVEN / MISSING |

S3 lines 32–34 preserve a user-reported historical correction to PT409. That is
proven to be a recorded report, not proof of installed function bytes, exact
message or the absence of 40001/40P01 branches. S1's PT409 exceptions (for example,
line 247 `NCA_FANOUT_LEASE_CONFLICT`) belong to fanout, not preference CAS.
They must not be repurposed as preference conflict evidence.

## Browser transport implications

**NOT PROVEN:** whether authenticated browsers may directly invoke preference
RPCs, or a trusted server API is required. Storage columns, SELECT policy
fingerprints and the separate subscription-lifecycle transport cannot decide it.
S4 `validateBody()` accepts only create/status/reserve/activate/release/recover;
it is not a preference endpoint. Its capability-cookie and identity rules must
not be copied into a preference contract by analogy.

No exact writable transport can be implemented from this evidence without
guessing. RPC method/argument serialization, six response fields, lossless
revision encoding, account identity, error mapping and outcome reconciliation
remain unclosed. This document authorizes no browser RPC, direct table write,
server bridge, automatic retry or inferred default preferences. The existing
unknown/disabled category UI is left unchanged.

## Exact evidence still required to close implementation

1. Authoritative getter and corrected setter definitions, or an exact reviewed
   contract equivalent: schema-qualified signatures, named arguments, return
   definitions, owner, security configuration, identity source and EXECUTE ACLs.
2. Exact read/write response and input contract: six boolean mappings, lossless
   revision representation, missing-row/default/create behavior and complete
   CAS/revision/timestamp transitions (including concurrent creation).
3. Corrected business-conflict contract: exact PT409 messages/branches, evidence
   that explicit business conflicts do not use 40001/40P01, and safe behavior for
   ambiguous outcomes sufficient to choose transport/error/reconciliation rules.

These are evidence gaps, not a request to rerun a production collector,
migration or stale setter. No further recovery campaign or new diagnostic is
created. Runtime tests cannot validate an invented contract.

## Review and safety

Evidence/documentation only. Claims above are bounded to cited local artifacts;
unknown routine behavior is explicitly unproven. One independent focused review
completed: PASS, no concrete factual/evidence blocker or unsupported assumption
found. No implementation tests were required or run.

NO PRODUCTION ACCESS / NO SETTER CALL / NO UI IMPLEMENTATION / NO PUSH /
NO DEPLOY / NO REAL WEB PUSH. No database connection, SQL execution, credential
inspection or application source modification is part of this task.
