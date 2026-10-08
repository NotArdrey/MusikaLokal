# Android testing APK and Vercel website

The website shares one Vercel deployment: `/` is the public Android download
page, `/download` redirects there, `/admin/login` is administrator sign-in, and
`/admin` contains the protected dashboard. The download page uses the existing
MusikaLokal logos and the mobile application's violet/mango palette, Space
Grotesk headings, and Manrope body text.

The download page adapts its layout and installation guidance to phones and
computers. It shows download progress, supports cancellation, and keeps a quick
download control visible on small screens when the main button scrolls away.
Installation steps expand independently by touch or keyboard. Android users
receive a reminder to keep the page open; iPhone/iPad users receive Android-only
installation guidance. The previous Android app badge has been removed.

Version 1.0.5 is the primary download. A separate **Download version 1.0.2**
link below its release information offers the retained earlier APK directly
from Supabase Storage.

The 1.0.5 rebuild uses the existing Vercel Blob store because the available
Supabase publishing credential returned HTTP 403. The APK checksum and signing
certificate were verified before updating the release manifest.

## Build the standalone testing APK

From the repository root on Windows:

```powershell
npm --prefix mobile ci
npm --prefix mobile run android:check
npm --prefix mobile run android:apk:test
```

The helper requires Java 17 or newer, Android platform 36, Build Tools 36.0.0,
NDK 27.1.12297006, and accepted SDK licenses. It selects a complete SDK from
`ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `%LOCALAPPDATA%\Android\Sdk`, setting
variables only for its process. To specify a different SDK:

```powershell
npm --prefix mobile run android:check -- -SdkPath C:\Android\Sdk
```

The script regenerates the ignored Android project and builds a release-mode
APK for ARM64 Android devices and x86-64 emulators. JavaScript and assets are
embedded, so Metro and Expo Go are unnecessary. It verifies signing, embedded
JavaScript, package/version metadata, and configured private credentials.
The tracked Expo plugin limits native compiler concurrency to two jobs, and
the helper limits Gradle concurrency to avoid Windows memory exhaustion.

Output:

- `mobile/build/testing/musikalokal-testing.apk`
- `mobile/build/testing/musikalokal-testing.apk.sha256`
- `mobile/build/testing/musikalokal-testing.apk.json`

The testing key and certificate fingerprint are retained in ignored
`mobile/.testing-signing/`. Preserve that directory to keep updates compatible
with installed testing copies. This is a debug-signed testing artifact, not a
production signing setup. The package is `com.anonymous.musikalokal`, version
`1.0.0`, version code `1`.

## Shared links on Android

All APK share buttons send HTTPS links under `https://musikalokal.app/feed`.
Post links carry `postId`; other shared content carries `listingId` and
`listingType`. The app opens the corresponding post, listing, profile, team,
product, or playlist. Older custom-scheme group/profile/home links are normalized
to the same entry. Signed-out recipients sign in first; the saved destination
survives sign-in, identity verification and app restarts.

The APK declares verified Android App Links for the share paths. The website
serves `/.well-known/assetlinks.json` using the testing APK's SHA-256 signing
certificate. `apk:publish` updates this association alongside the release
manifest. Keep the testing keystore when rebuilding. Browsers reaching any share
path redirect to the public download landing page.

Both the updated APK and website must be published. Existing installed APKs
need the update before Android can recognize the HTTPS links. The domain
`musikalokal.app` must resolve to this Vercel website and serve the association
as JSON over HTTPS without a redirect. During the October 5, 2026 local check,
that domain returned DNS `ENOTFOUND`; publishing source alone cannot fix DNS.

Validation:

```powershell
npm run test:share-links
npm run test:apk-website
adb shell pm verify-app-links --re-verify com.anonymous.musikalokal
adb shell pm get-app-links com.anonymous.musikalokal
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d 'https://musikalokal.app/feed?postId=9d28c58a-7f1e-4fcb-8091-b8f1b65f79cc'
```

Check links with the app closed and already open, including opening a second
post after the first. Verify the website landing page on a device without the
APK. Facebook and other apps may keep links inside their own browser; Android
App Links require those apps to hand the URL to Android.

## Upload and publish

Vercel project `musika-lokal` uses repository root directory `web`, installation
command `npm ci`, build command `npm run build`, output `dist`, and the Other
framework preset. The project contains public Supabase URL/anon-key settings
for its existing admin portal; provider credentials stay server-side.

Authenticate and link from the repository root:

```powershell
npx vercel login
npx vercel link --yes --project musika-lokal --scope notardreys-projects
```

APKs are hosted in the public `android-releases` Supabase Storage bucket in the
existing MusikaLokal project. The website itself remains on Vercel. Upload the
verified APK from the repository root:

```powershell
npm --prefix web run apk:publish
```

The script reads the root `.env` without exposing credentials to the client.
Provide a server-only `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`, or
use `SUPABASE_ACCESS_TOKEN` with permission to retrieve the project's service
key. Explicit process environment credentials take precedence over the file.
Never give these variables an `EXPO_PUBLIC_` prefix.

The project global upload limit and APK bucket limit are 128 MiB; the existing
app buckets retain their previous effective upload caps. The APK bucket accepts
only `application/vnd.android.package-archive`. A restrictive storage policy
blocks ordinary client roles from listing, uploading, replacing, or deleting
releases. Public download URLs require no sign-in.

The upload script validates the APK against its build metadata, uploads to a
checksum-specific immutable path, verifies the complete public file's SHA-256
and size, and updates `web/public/android-release.json` only after verification
succeeds. The manifest contains the download URL, version,
size, checksum, minimum Android API, build time, and certificate fingerprint.
The website reads this manifest and disables downloading when it is missing or
invalid. Each uploaded manifest is retained in `web/releases/`; keep these
records and the previous APK for rollback. Versions 1.0.3 and 1.0.2 were copied
to Supabase on October 8, 2026. Their existing Blob copies remain available for
older website deployments; six earlier Blob APKs have been removed.
If this exact APK is already uploaded, the script verifies the existing public
object and reuses it without overwriting it. Old release objects need explicit
cleanup as new versions accumulate; publishing does not delete rollback files.

Build and test before deploying:

```powershell
npm --prefix web ci
npm --prefix web run typecheck
npm --prefix web run build
npm run test:android-release
npm run test:apk-website
npx vercel deploy --yes --scope notardreys-projects
```

Verify the preview, then publish the same source:

```powershell
npx vercel deploy --prod --yes --scope notardreys-projects
```

You can also promote the exact preview that you verified:

```powershell
npx vercel promote <preview-url> --yes --scope notardreys-projects
node scripts/verify-apk-deployment.mjs https://musika-lokal.vercel.app
```

The deployment verifier visits the public website, downloads the APK through
its button, checks its checksum, and verifies direct admin-route refreshes.
It writes screenshots and the downloaded APK under `output/android-testing/`.

The browser downloads the APK in bounded ranges, retries interrupted ranges,
and checks the complete SHA-256 before saving `MusikaLokal.apk`. The page shows
progress and allows cancellation. A failed or mismatched transfer displays a
retry message instead of saving a partial installer. Large APK transfers can
take several minutes; keep the page open until the download is ready.

The verifier normally uses Chromium's default networking. If HTTP/2 transfers
stall on your local connection, an optional HTTP/1.1 check is available:

```powershell
$env:APK_VERIFY_HTTP1 = '1'
node scripts/verify-apk-deployment.mjs https://musika-lokal.vercel.app
Remove-Item Env:APK_VERIFY_HTTP1
```

This option changes the test browser's networking, and the report records it.
The published website continues to use the visitor's normal browser networking.

After promoting a verified preview, you can reuse its completed download report
when checking the identical APK on production:

```powershell
$env:APK_VERIFY_REUSE_REPORT = 'tmp/logo-fix/final-preview-verification.json'
node scripts/verify-apk-deployment.mjs https://musika-lokal.vercel.app
Remove-Item Env:APK_VERIFY_REUSE_REPORT
```

This checks production pages and logo assets, requires identical URL/size/hash
metadata, and rehashes the previously downloaded APK. It records the original
download location and transport instead of claiming a new production transfer.
The APK must still exist at `output/android-testing/deployed-musikalokal-testing.apk`.

CLI credentials, local environment files, APK binaries, build output, and
screenshots are ignored. The web typecheck starts at application routes and
checks their imported dependency graph; unused copies of mobile-only screens
are outside this application's entrypoints.

## Device and release checks

Install the APK using Android's installer or `adb install -r`. Stop Metro,
force-stop the app, and launch it again. Confirm session restoration,
navigation, uploads, permission denial, location, deep links, media playback,
and background controls on a physical device. Reinstall the same signed APK
without clearing app data to check update compatibility.

The browser regression test checks both themes, mobile/desktop layouts,
missing/invalid/valid manifests, the public redirect, and unauthenticated admin
route protection. Isolated Supabase responses also verify admin login/logout,
dashboard navigation and refresh, rejection of non-admin sessions, and
preservation of sessions on the public homepage. These fixtures do not verify
live authenticated backend workflows; those require real test credentials.
Download fixtures also cover retrying a truncated range, refusing a checksum
mismatch, and cancellation without saving a file.
Screenshots are written to `output/android-testing/`.

For each deployed release, download the APK from the public website and compare
its SHA-256 hash with the build metadata. Record any physical-device or
authenticated workflow checks that remain untested. To roll back, deploy the
previous website version with its previous manifest; retained immutable release
objects continue serving that APK. The parser accepts the project's exact
Supabase APK bucket and legacy public Vercel Blob URLs.
