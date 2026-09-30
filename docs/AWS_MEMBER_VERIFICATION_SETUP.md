# AWS Registered Member Verification

## Current status

The gig-application implementation and the connection-application extension for group-member and production-team applications are deployed. Migrations `20260928170000_add_gig_member_verification.sql`, `20260930130000_add_connection_member_verification.sql`, and `20260930150000_add_connection_application_members.sql` are recorded remotely. No duplicate S3 bucket or Rekognition collection was needed.

The AWS project's selected Region is Asia Pacific (Sydney), `ap-southeast-2`. The repository configuration, AWS CLI profile, S3 bucket, and Rekognition collection now agree on that Region. Do not create duplicates in another Region or attempt to bypass the AWS-managed service control policy.

The `musikalokal-dev` profile authenticates successfully. Read-only verification confirms:

- Rekognition collection `musikalokal-members-dev` exists in `ap-southeast-2` and uses FaceModelVersion `7.0`.
- S3 bucket `musikalokal-rekognition-dev-92826` exists in `ap-southeast-2`.
- All four S3 Block Public Access settings are enabled.
- Default bucket encryption is SSE-S3 (`AES256`).
- S3 Object Ownership is `BucketOwnerEnforced`, so ACLs are disabled.
- Enabled lifecycle rule `DeleteTemporaryRekognitionVideos` expires objects under `rekognition-input/` after one day.

The AWS project reports an active Free plan. S3 and Rekognition are supported by that plan.

The linked Supabase project is active and healthy. Deployment verification confirms:

- the required AWS member-verification secret names exist;
- migrations `20260928170000_add_gig_member_verification.sql`, `20260930130000_add_connection_member_verification.sql`, and `20260930150000_add_connection_application_members.sql` are applied and recorded remotely;
- the three verification tables, the connection roster table, and all three consent-normalization triggers exist;
- `gig-applications`, `delete-account`, `connection-member-verification`, `manage-production`, and `group-members` are active with the member-verification implementation;
- the internal connection worker returns the expected unauthenticated `403`, confirming successful startup and service-role enforcement without changing application data.

A dedicated non-console runtime IAM identity named `musikalokal-member-verification-dev` has an inline policy limited to the verified Rekognition collection operations and temporary S3 object prefix. The selected-Region IAM simulation allows all eight required SDK actions.

Do not run `supabase db push --include-all`. The remote migration history currently omits multiple older local migration files. A normal dry run stops with `DbPushMissingRemoteError`; using `--include-all` would attempt to apply those unrelated historical migrations. Reconcile or mark the historical migrations accurately first, then require a dry run that lists only `20260928170000_add_gig_member_verification.sql` before pushing.

The Supabase runtime uses its own dedicated credential. It does not use the human `musikalokal-dev` CLI credential.

## Runtime design

- A member grants separate, optional consent. General terms and Gemini review consent do not grant face verification consent.
- Every member in a gig group application's frozen roster must consent through that workflow. For a production-team group application, the checked group attestation records that every represented registered member is included in the verification roster.
- A solo or join-a-group connection application verifies the submitting applicant. A production-team application submitted as a group freezes every registered group member into a connection roster and verifies each member against the submitted performance video.
- A registered profile/reference image is validated as JPEG or PNG and must contain exactly one detectable face before `IndexFaces` runs.
- The application video is copied to a private temporary S3 object and checked for an MPEG-4/MOV-style ISO base media container carrying H.264 before `StartFaceSearch` runs.
- The asynchronous job is resumed with bounded polling through `GetFaceSearch`; all result pages are collected.
- A tracked `Person.Index` can verify only one roster member, preventing one person from satisfying multiple members.
- Ambiguous near-ties, missing references, partial matches, unavailable processing, and extra people are routed to manual review.
- Results can change recommendation presentation to `needs_review`, but never modify the deterministic 30/25/10/15 score or make the organizer's decision.
- Temporary videos are deleted after completion/failure, with an S3 Lifecycle expiration rule as a fallback.
- Indexed reference faces are reused by source-image hash, replaced when the photo changes, and deleted before account deletion.

AWS documents that stored-video face search uses the asynchronous `StartFaceSearch`/`GetFaceSearch` workflow and requires faces to be indexed first:

- https://docs.aws.amazon.com/rekognition/latest/dg/procedure-person-search-videos.html
- https://docs.aws.amazon.com/rekognition/latest/dg/video.html
- https://docs.aws.amazon.com/rekognition/latest/dg/guidance-index-faces.html

## Canonical AWS resources

Use only these existing resources in `ap-southeast-2`:

1. Rekognition collection `musikalokal-members-dev`, dedicated to registered MusikaLokal members.
2. S3 general-purpose bucket `musikalokal-rekognition-dev-92826`, dedicated to temporary Rekognition input videos.

The bucket must have:

- all four Block Public Access settings enabled;
- Bucket owner enforced object ownership / ACLs disabled;
- default SSE-S3 encryption (the runtime also requests `AES256`);
- a Lifecycle expiration rule limited to the `rekognition-input/` prefix, expiring current objects after one day and aborting incomplete multipart uploads;
- no website hosting or public bucket policy;
- CloudTrail S3 data events, relevant CloudWatch metrics/alarms, and an encrypted audit destination before production use.

S3 encrypts new uploads with SSE-S3 by default, but the explicit configuration is retained as a guardrail. The S3 bucket must be in the same Region used for Rekognition operations.

- https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-bucket-encryption.html
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html
- https://docs.aws.amazon.com/rekognition/latest/APIReference/API_S3Object.html

## Supabase server environment

Store these only as Edge Function secrets. Never use `EXPO_PUBLIC_` or `VITE_` names for them:

```text
AWS_REGION=ap-southeast-2
AWS_REKOGNITION_COLLECTION_ID=musikalokal-members-dev
AWS_REKOGNITION_VIDEO_BUCKET=musikalokal-rekognition-dev-92826
AWS_ACCESS_KEY_ID=<rotated-dedicated-runtime-key>
AWS_SECRET_ACCESS_KEY=<rotated-dedicated-runtime-secret>
AWS_SESSION_TOKEN=<only-when-using-temporary-credentials>
AWS_FACE_MATCH_THRESHOLD=<optional-0-to-100>
AWS_FACE_MATCH_AMBIGUITY_DELTA=1
AWS_REKOGNITION_MAX_VIDEO_BYTES=262144000
AWS_REKOGNITION_POLL_ATTEMPTS=5
MEMBER_VERIFICATION_ALLOWED_MEDIA_HOSTS=<comma-separated-extra-hosts-if-needed>
```

`SUPABASE_URL` is automatically added to the server-side media-host allowlist. Extra hosts are required only when approved reference photos or videos are served from another HTTPS host.

For local management, the repository root `.env` supplies `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. Those values must not be copied into client code or committed.

Copy `.env.member-verification.example` to the ignored `.env.member-verification.local` file and add the dedicated runtime credentials. Do not pass the repository's complete root `.env` to `supabase secrets set`, because that would upload unrelated local and client configuration as server secrets.

## IAM policy generation

The runtime identity policy must be generated from the source with IAM Policy Autopilot:

```powershell
uvx iam-policy-autopilot@latest generate-policies `
  E:\Codes\MusikaLokal\web\supabase\functions\_shared\gigMemberVerificationService.ts `
  --language typescript `
  --region ap-southeast-2 `
  --account <AWS_ACCOUNT_ID> `
  --service-hints s3 rekognition `
  --pretty
```

Do not use `--upload-policies` without reviewing the generated result. Autopilot 0.3.0 produces broad optional permissions for these SDK operations, including KMS, PassRole, S3 ACL/Object Lock, versioned deletion, and S3 Object Lambda operations that this runtime does not use. The deployed inline policy was narrowed to the actual SDK calls, collection, and bucket prefix, validated with Access Analyzer, and tested with IAM simulation. The reproducible policy template is `infra/aws/musikalokal-member-verification-runtime-policy.json`; replace `<AWS_ACCOUNT_ID>` before attaching it.

## Deployment order

1. Rotate the exposed AWS key.
2. Confirm the selected Region remains `ap-southeast-2` in AWS Settings > View all projects > Overview > Additional Info > Region.
3. Confirm `aws sts get-caller-identity --profile musikalokal-dev`, then reverify the existing Sydney bucket and collection read-only. Do not create replacements.
4. Generate, review, simulate, and explicitly approve the dedicated runtime IAM policy.
5. Create the ignored deployment-secret file and add newly rotated, dedicated non-human runtime credentials:

   ```powershell
   Copy-Item -LiteralPath '.env.member-verification.example' `
     -Destination '.env.member-verification.local'
   ```
6. Load only `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` from the repository root `.env` into the current shell without printing their values:

   ```powershell
   $managementNames = @('SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF')
   foreach ($line in Get-Content -LiteralPath '.env') {
     $parts = $line -split '=', 2
     if ($parts.Count -eq 2 -and $managementNames -contains $parts[0].Trim()) {
       [Environment]::SetEnvironmentVariable(
         $parts[0].Trim(),
         $parts[1].Trim().Trim('"'),
         [EnvironmentVariableTarget]::Process
       )
     }
   }
   ```
7. Upload only the dedicated secret file:

   ```powershell
   npx supabase secrets set `
     --project-ref $env:SUPABASE_PROJECT_REF `
     --env-file .env.member-verification.local
   ```

8. Reconcile the existing Supabase migration-history gaps. A normal push remains unsafe until that separate repository-history issue is resolved:

   ```powershell
   npx supabase db push --linked --dry-run --workdir web
   ```

   Continue only when the dry run lists solely the intended verification migration. Because this repository still has historical migration gaps, the deployed verification migrations were applied directly and transactionally through `supabase db query`, then only their exact versions were recorded; no unrelated migration was applied or marked.

   ```powershell
   npx supabase db push --linked --workdir web
   ```

9. Deploy the connection worker and the functions that create or review connection applications, while preserving their current function-level JWT setting. Redeploy `gig-applications` and `delete-account` only when their bundles also changed:

   ```powershell
   npx supabase functions deploy connection-member-verification manage-production group-members `
     --project-ref $env:SUPABASE_PROJECT_REF `
     --workdir web `
     --no-verify-jwt `
     --use-api `
     --import-map web/supabase/functions/deno.json
   ```

10. Verify secret names and deployed function versions without printing secret values:

    ```powershell
    npx supabase secrets list --project-ref $env:SUPABASE_PROJECT_REF
    npx supabase functions list --project-ref $env:SUPABASE_PROJECT_REF
    npx supabase migration list --linked --workdir web
    ```

11. Run a consented solo, duo, and band test using authorized people and H.264 test videos.
12. Confirm temporary S3 deletion, reference-face cleanup, pagination, idempotent retry behavior, organizer-only sanitized results, and unchanged deterministic match scores.

## Cost notes

Rekognition Stored Video Analysis charges by video analysis usage, and stored face metadata has a monthly storage charge. S3 adds object storage and request charges. The current Rekognition pricing page also describes its time-limited free-tier allowance; verify eligibility and current regional pricing before enabling production traffic:

- https://aws.amazon.com/rekognition/pricing/
- https://aws.amazon.com/s3/pricing/
