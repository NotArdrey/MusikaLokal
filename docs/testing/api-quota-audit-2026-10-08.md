# API quota audit — Musika Lokal

Checked 8 October 2026 (Asia/Manila). Production log window: Oct 7, 2026, 8:04:32 PM through Oct 8, 2026, 8:04:32 PM. AWS metrics use a separate 24-hour window ending Oct 8, 2026, 8:09:44 PM.

**Confirmed: Groq is hitting token limits, and Supabase Realtime hit its per-client presence limit twice.** The findings below distinguish recorded throttling from remaining allowances that could not be retrieved. Application settings and source code were not changed.

| API/service | Result | Verified evidence |
| --- | --- | --- |
| Groq | Daily and minute token limits reached | 976 provider rate-limit errors: 816 daily-token errors and 160 minute-token errors. Home feed: 672; playlists/radio: 250; upload screening: 54. |
| Supabase Data API / functions | No HTTP 429 in the inspected window | Healthy Pro project, 49 active functions. Gateway logs: 25,038 requests; function gateway: 2,687 requests. One function HTTP 500 was recorded. |
| Supabase Realtime | Two presence-limit events | `ClientPresenceRateLimitReached: :client_rate_limit_exceeded` occurred twice. This is separate from monthly database/storage quotas. |
| Supabase database / Storage | Ample current disk/storage capacity | Database: 229,362,835 bytes (229 MB). Database data filesystem: 7,653,994,496 bytes available out of 8,350,298,112 bytes; 8.34% unavailable, including reserved space. Object storage: 2,250,061,731 bytes (2.25 GB), 844 objects. |
| Gemini | No quota failures found; availability errors occurred | Logged provider HTTP responses: 60 successful requests and four HTTP 503 responses. Exact remaining Gemini project quota unavailable. |
| AWS Rekognition | No recorded throttling for checked operations | Selected Region `ap-southeast-2`: seven successful StartFaceSearch calls and 28 successful GetFaceSearch calls. No throttle datapoints for DetectFaces, CompareFaces, IndexFaces, StartFaceSearch, GetFaceSearch. AWS Free plan active; $99.55 credits remain. |
| ACRCloud | No recorded primary recognition errors | Accessible primary project matches deployed recognition credentials. October 1–8: 24 requests, 3 matches, 21 no matches, zero errors. Subscription allowance and separate custom recognition project unverified. |
| Vercel / Blob | Public site available; current Blob storage modest | Site HEAD returned HTTP 200. Hobby team. Three APKs total 307,370,197 bytes (307 MB). Monthly transfer and operations usage unavailable from the billing CLI. |
| Face++ | Credentials accepted; quota balance unavailable | Read-only FaceSet list returned HTTP 200. Detection/comparison monthly allowance was not measured. |
| PayMongo | No quota error found in available logs | PayMongo function logged six HTTP 200, four HTTP 302, and two HTTP 401 responses. Provider allowance cannot be fetched with local credentials. |
| Didit / Smile | Remaining allowance unverified | Deployed secrets exist, but their usable values are absent locally. No recent provider traffic/quota failure was established. |
| Gmail / Resend | Email balance unverified | Supabase Auth uses Gmail SMTP and is configured for 50 auth emails/hour. No email quota error found in inspected logs. Resend key exists in deployed secrets; the current shared mail helper uses Gmail. No email was sent for this audit. |
| Nominatim geocoding | One read succeeded; aggregate usage unknown | Public Manila search returned HTTP 200. Official maximum is one request/second across application traffic. |
| Expo Push | Project usage unverified | Push API integration exists in database migrations. Official limit: 600 notifications/second/project. No push notification was sent. |
| OpenAI | Not configured | No OpenAI API key in local environment or deployed Supabase secret names. OpenAI-owned models hosted by Groq use Groq quotas. |

**Groq evidence.** Among the latest 100 quota events, the highest daily usage snapshot for `openai/gpt-oss-120b` was 199,944 / 200,000 tokens (99.972%); `openai/gpt-oss-20b` was 199,839 / 200,000 (99.9195%); `qwen/qwen3.8-27b` was 199,873 / 200,000 (99.9365%). These snapshots are from rejected production requests, not a current billing balance. Typical rejected requests needed roughly 1,400–3,600 additional tokens.

The local Groq key matches the deployed primary key. Deployed settings matched `openai/gpt-oss-120b` for text/review and `qwen/qwen3.8-27b` for vision. A tiny 90-token audit request subsequently returned HTTP 200. Its response reported 7,910 of 8,000 minute tokens remaining and 999 of 1,000 daily requests remaining; those headers do not reveal remaining daily tokens. A small request succeeding therefore does not establish enough capacity for a normal app request. [Groq explains rate-limit dimensions and response headers](https://console.groq.com/docs/rate-limits).

Three older model probes (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, and `meta-llama/llama-4-scout-17b-16e-instruct`) returned `model_not_found`. The matched deployed text/review and vision settings use supported names; these old-model failures do not explain the confirmed production 429 errors.

**Limits of the audit.** Supabase deployed secrets are returned as hashes, so provider keys absent from the local environment cannot be recovered through that API. Supabase monthly organization billing usage rejects personal access tokens; billing-cycle egress, monthly Edge Function usage and Realtime message consumption are unverified. Current object bytes and filesystem metrics are direct measurements, not monthly billed averages or organization-wide totals.

Vercel `usage` reported billing cost data unavailable for the Hobby team. This is not evidence of zero bandwidth usage. Its [Blob allowance](https://vercel.com/docs/vercel-blob/usage-and-pricing) includes 1 GB-month storage and 10 GB transfer; current stored bytes are below 1 GB, while transfer headroom remains unknown. The local Vercel OIDC token is expired, but the existing CLI credential successfully read the team/project and Blob metadata.

The accessible ACRCloud project has `day_limit=0` and `qps_limit=0`; those fields do not measure remaining subscription credits. Its console token differs from the deployed console-token hash, but its recognition key and secret match the deployed primary recognition credentials. Custom recognition credentials do not match the accessible project.

Face++ [publishes free trial limits](https://www.faceplusplus.com/blog/face-overseas-free-policy-adjustment-notice/) of 500 detection calls/month and 500 comparison calls/month; the key tier and consumed counts were not obtained. A successful FaceSet listing does not prove detection/comparison quota remains.

Dashboards for unverified usage: [Supabase organization usage](https://supabase.com/dashboard/org/ovcrdnvelafibcivyclx/usage), [Vercel team usage](https://vercel.com/notardreys-projects/usage), [Face++ console](https://console.faceplusplus.com/), and each provider console associated with the deployed keys.

Other references: [Supabase pricing](https://supabase.com/pricing), [database disk sizing](https://supabase.com/docs/guides/platform/database-size), [AWS Rekognition metrics](https://docs.aws.amazon.com/rekognition/latest/dg/rekognition-monitoring.html), [ACRCloud project statistics](https://docs.acrcloud.com/reference/console-api/base-projects), [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/), [Expo Push limits](https://docs.expo.dev/push-notifications/faq/).

Sanitized machine-readable evidence: [api-quota-audit-2026-10-08.json](api-quota-audit-2026-10-08.json). No credential values, user identities, or raw request bodies are included.
