# Standalone testing release verification

Verified on October 5, 2026, on branch `fix/android-testing-apk`, created from
`modern-ui`. The pre-existing local deletion of `SYSTEM_ARCHITECTURE.md` was
preserved and remains unstaged.

This report records the initial standalone build. Subsequent corrections are
documented in [Light logo spacing](LIGHT_LOGO_SPACING.md) and
[Brand asset audit](BRAND_ASSET_AUDIT.md); the live website's release manifest
identifies the latest APK.

## Published release

- Website: https://musika-lokal.vercel.app
- Administrator sign-in: https://musika-lokal.vercel.app/admin/login
- APK: https://yr5chc4fi5tszotq.public.blob.vercel-storage.com/android/testing/534e8662845257c99e97ee49b2c6d1f3ceb7defeb909e24864b4742ce0fb7ef7/musikalokal-testing.apk?download=1
- Package: `com.anonymous.musikalokal`
- Version: `1.0.0`, version code `1`
- Size: 103,239,289 bytes (98.5 MiB)
- Minimum Android: 7.0 / API 24; ARM64 devices and x86-64 emulators
- Build time: `2026-10-05T03:52:46.7454146Z`
- APK SHA-256: `534e8662845257c99e97ee49b2c6d1f3ceb7defeb909e24864b4742ce0fb7ef7`
- Signing certificate SHA-256: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`

The release-mode APK uses the retained Android debug key for testing. APK
Signature Scheme v2 verification passed; the app is not debuggable. The
generated project and saved testing keystore have identical hashes.

## Deployment records

Vercel project: `musika-lokal`, project ID
`prj_2MlGLkZy6EAF6bEeqBgMvOYvqb7f`, scope `notardreys-projects`.
Public Blob store: `musika-lokal-apk`, ID `store_YR5chC4FI5tSZOtq`, Singapore.

- Verified release preview: `dpl_3VQiuz1tPdvoeYmvu9RMygsvbGxA`,
  https://musika-lokal-l70fer52d-notardreys-projects.vercel.app
- Production: `dpl_Hf3azMcxDeHVehcNZnQwKyiQnLFK`,
  https://musika-lokal-onrmxh62n-notardreys-projects.vercel.app
- Public production alias: https://musika-lokal.vercel.app
- Earlier website preview retained: `dpl_5iuzVxt8BZs2FQmUHMfFP47eDFyN`

Vercel rebuilt the promoted preview with production settings before switching
the public alias. The production deployment reached `READY`, and the public
alias was tested without Vercel authentication or browser cookies. APK Blob
objects are immutable. The release manifest is retained in `web/releases/`
for rollback; local deployment records are also retained under ignored
`tmp/vercel-apk/`.

## Completed checks

| Check | Result |
| --- | --- |
| Expo SDK 57 dependency compatibility, mobile and web | Passed `expo install --check` |
| Mobile and web TypeScript | Passed |
| Android Java, SDK platform 36, Build Tools 36.0.0, NDK 27.1.12297006, licenses | Passed prerequisite check and native build |
| Android bundle/assets and release APK | Passed; 2,744 modules and 99 copied assets |
| Web export locally and on Vercel | Passed |
| Audio, upload URI, authorization, release-metadata regression tests | 29 passed |
| Website browser regression | Passed public routes, unavailable/invalid/valid metadata, themes, narrow layouts, keyboard focus, and mocked admin workflows |
| Preview and production browser checks | Passed public homepage, both themes, loaded logos, download button, `/download`, protected admin route, login-page refresh |
| APK signature, package/version, embedded bundle, release mode | Passed |
| Configured private credentials in APK JS/config, website export, and delivered production JavaScript | None found |
| Public Blob delivery | HTTP 200, Android package content type, attachment filename, matching file size |
| Downloaded APK checksum through preview and production homepages | Matches local artifact |
| Emulator installation and reinstall | Passed on Android API 36 with the same signing key |
| Emulator cold launch without Metro | Passed repeatedly; login UI rendered, no app fatal errors found |
| Native deep link | `musikalokal://signup` opened registration |

Browser admin login/logout, dashboard navigation and direct refresh, rejection
of non-admin users, and preservation of a non-admin session on the public
homepage were verified with isolated Supabase responses. No live backend data
was changed by those tests.

Mobile and desktop screenshots in both themes were inspected against the
existing logo assets, mobile palette, and fonts. Screenshots and a copy of the
downloaded APK are retained under ignored `output/android-testing/`.

The first native build exposed a JPEG avatar mislabeled as PNG; its extension
and references were corrected without changing its pixels. A subsequent C++
build exhausted Windows memory. The tracked Expo plugin now limits compiler
jobs, and the build helper limits Gradle concurrency. The successful release
build took 13 minutes 37 seconds. The emulator initially showed a System UI
ANR during startup; it recovered after waiting, and subsequent app cold
launches passed.

## Remaining checks and known limitation

Expo Doctor passed 20 of 21 checks. Its remaining React Native Directory
warning marks `react-native-track-player` unsupported on the New Architecture.
The existing Track Player patch was preserved, and the module compiled into
this APK. Actual playback remains to be verified.

No physical Android device or live test-account credentials were available.
The following checks remain untested against the live app/backend:

- Successful mobile login and authenticated session restoration after restart.
- Authenticated administrator dashboard/CRUD workflows with real credentials.
- Uploads, camera/gallery/document/location/notification permissions, and
  permission-denial recovery.
- Audio/video playback, station playback, background media controls, and
  headset/Bluetooth behavior.
- Physical-device installation through a browser and Android installer.
- Email/authentication callback and payment deep links; the signup route was
  tested in the emulator.

See [rebuild, upload, deployment, and rollback instructions](ANDROID_TESTING_AND_VERCEL.md).
