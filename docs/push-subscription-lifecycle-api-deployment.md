# Fresh subscription lifecycle API — future deployment gates

This local server implementation follows
`docs/push-subscription-lifecycle-api-contract-v1.md`. It does not restore historical
source. Installed V4 SHA256 remains
`6b6a4ae9336651f8f45c025e8884db9f657c14ffa470284b2bde7f9ab8b1fa7f`;
do not reinstall it or rerun consumed provisioning/migration operations.

No deployment, push, credentials, production DB/SQL/RPC, frontend integration or
real Web Push is authorized by this document. Tests use synthetic values and fake
Auth/pg/network boundaries. Sender/fanout/preferences and existing auth are unchanged.

## Only three new server configuration variables

The tracked `.env.push-subscriptions.example` is placeholders only. Future operator
configuration must be server-only, private and separately authorized. Never print
values, copy them into tracked files, use NEXT_PUBLIC/VITE prefixes or send them
to browsers. Existing `.env*` local files remain gitignored. No helper generates
or provisions an API DB password here.

| Name | Required profile |
| --- | --- |
| NCA_PUSH_API_DATABASE_URL | Exact postgresql: Session Pooler URI, wire user nca_push_api.cwwulyrutdvuekydydew, host aws-0-ap-northeast-2.pooler.supabase.com, explicit port 5432, database postgres, existing role password encoded in password component, no query/fragment |
| NCA_PUSH_API_CA_CERT_B64 | Canonical standard base64 of one independently trusted Supabase PEM CA; same strict validator as reviewed sender CA, decoded into explicit ssl.ca, verification true and minimum TLS1.2 |
| NCA_PUSH_API_AUTH_PUBLISHABLE_KEY | This project's public Supabase publishable key (sb_publishable_ form), never sb_secret_, service-role JWT, admin password or worker credential |

API DB role/backend identity must be nca_push_api for BOTH current_user and
session_user. No direct/admin route, Transaction Pooler port 6543, sender identity,
privileged key or relaxed TLS fallback is supported. This is a runtime profile,
not authorization to provision it through any administrative route.

## Gates before any later release

- Record the exact reviewed local implementation commit, targeted test results and
  independent review. A local commit does not authorize deployment.
- Obtain separately approved nca_push_api credential/configuration evidence without
  exposing secrets. No credential existence or route reachability is claimed here.
- The future Vercel configuration must allow at least 30 seconds for this function;
  no vercel.json change is made now. Handler budget is 25s, Auth verification <=2s,
  DB connection <=2s, each query <=7s and remaining budget. Mutations require >=7s
  remaining; server statement/lock timeouts are 5s/2s.
- Confirm the deployed runtime supplies the original IncomingMessage raw body stream
  and rawHeaders, enforcing a 16KiB raw-byte input cap. The implementation deliberately
  does not trust a pre-parsed req.body or reserialize it to claim a raw-byte bound;
  unavailable/consumed raw data fails closed. Platform compatibility is a future gate,
  not a claim derived from local mocks. No new diagnostic endpoint is created.
- Keep the exact allowed Origin https://nha-co-alex.vercel.app. Preview/custom/localhost
  aliases are not authorized API origins. All six operations are POST JSON only;
  no direct lifecycle PostgREST browser bridge or CORS relaxation exists.
- Browser service worker/permission/subscription UI/Web Lock sequencing is a future
  separate task. This API creates no browser integration or test data.
- A future production runtime smoke must have explicit authorization and a bounded
  approved plan. Some operations mutate rows; do not label them read-only or invoke
  them merely because deployment succeeded. Real push remains independently gated.

Errors expose only allowlisted public codes. No raw cookies, capabilities, auth
tokens, CA, credentials, DB messages, user UUIDs or subscription material are logged
or returned as JSON. A successful creation/recovery alone sends its required secret
in the HttpOnly cookie. Error responses never issue/delete/rotate it. Ambiguous
mutations are OUTCOME_UNKNOWN, not permission to retry or reset a binding.
