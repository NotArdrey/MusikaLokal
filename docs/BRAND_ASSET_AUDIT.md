# Brand consistency and public download page

October 5, 2026, on `fix/android-testing-apk`.

## Logo coverage

The approved light logo and its dark counterpart are the only active brand
artwork. Each package exposes `BRAND_LOGOS` from `src/constants/Images.ts`.

| Location | Logo source |
| --- | --- |
| Mobile sign-in | Shared light/dark pair |
| Mobile splash | Light logo on white; dark logo on navy, at 180px image width |
| Android launcher | Light legacy icon; dark adaptive foreground on navy |
| Public homepage header and hero | Shared light/dark pair |
| Admin sign-in | Shared light/dark pair |
| Admin dashboard sidebar | Shared light/dark pair, in a square 96px frame |
| Website favicon | Approved light logo |

The mobile and web PNG copies have identical checksums for each theme:

- Light: `9c821697c80fd7078589e318ce71a5ff8987e7eb8867c44a02011296c045b070`.
- Dark: `abf5fd15e5453b3a6e1e58de87f941900b880ebe22754b2a4adc1da9586a4d2e`.

Both canvases are 1254 x 1254 with transparent backgrounds. A read-only pixel
scan (alpha over 220, at least 31 pixels per occupied row) found these bands:

| Theme | Emblem | MUSIKA | LOKAL | Clear emblem-to-text rows |
| --- | --- | --- | --- | --- |
| Light | 85–848 | 889–983 | 1022–1133 | 40 |
| Dark | 83–851 | 888–984 | 1021–1135 | 36 |

The typography has clear spacing in both themes. The raster outlines differ
slightly; the gap difference is 0.8px at a 250px display size, rather than
pixel-identical geometry. Homepage and administrator screenshots were inspected.

`mobile/plugins/withBrandLauncher.js` adds native insets around the approved
adaptive foreground so Android's mask does not cut off the wordmark. It uses
[Android's InsetDrawable](https://developer.android.com/reference/android/graphics/drawable/InsetDrawable),
with no second raster artwork for the launcher. Old icon, adaptive icon, and web
splash PNGs were removed after checking their references. Profile avatars and
user-uploaded team logos are unrelated to the app brand and retain their sources.

An emulator cold-launch check exposed clipping with the previous 260px splash
image width. The tracked Expo splash configuration now uses 180px to fit the
complete wordmark inside Android's splash mask.

Saved assets:

- `mobile/assets/images/musika-lokal-logo-modern-wordmark.png`
- `mobile/assets/images/musika-lokal-logo-modern-wordmark-dark.png`
- `web/assets/images/musika-lokal-logo-modern-wordmark.png`
- `web/assets/images/musika-lokal-logo-modern-wordmark-dark.png`

The dark counterpart was edited with the built-in imagegen tool, using the
approved light PNG as its reference. Prompt:

> Edit the provided corrected MusikaLokal logo into its dark-theme version.
> Change ONLY the black/navy MUSIKA word to off-white #F8FAFC for legibility on
> a dark surface. The source is the approved spaced light logo: retain exactly
> its canvas size 1254x1254, transparent background, circular emblem, musical
> note, waveform, house and pin, all positions, outlines, purple/blue gradients,
> dimensions, and the violet LOKAL line. Preserve EXACTLY the emblem-to-MUSIKA
> gap, the MUSIKA-to-LOKAL gap, letter shapes, sizes, centering and all transparent
> margins. No repositioning, redrawing, cropping, scaling, shadows, extra elements
> or background. The light and dark logos must overlay with identical geometry.
> Text remains exactly MUSIKA and LOKAL. Output a transparent PNG dark-theme
> counterpart of this existing brand logo.

## Download page

The public header and footer contain no administrator links. The protected
administrator portal remains at `/admin/login`. Public copy uses Android app
and installation wording, with no testing/build/Expo/Metro/development wording.
Missing or invalid metadata shows a disabled “Download unavailable” button.
Version, Android requirements, size, update date, and checksum remain available.
The artifact continues to be the same release-mode testing APK with debug
signing; changing the homepage copy does not change its signing or maturity.

A preview download returned only the first 12,401,456 bytes of the 103,621,815
byte APK. The public Blob's complete contents were independently retrieved in
bounded ranges and matched the local APK checksum. The website now downloads
bounded ranges with retries, checks every range's length, and checks the full
SHA-256 before saving `MusikaLokal.apk`. Progress and cancellation are available;
failed or mismatched transfers never save an incomplete installer.

HTTP/2 requests for 1MiB ranges timed out on this machine. Four real 256KiB
ranges completed with default Chromium networking, so the downloader now uses
256KiB ranges. A separate HTTP/1.1 probe completed four real 1MiB ranges.
The full deployed-file browser checks use `APK_VERIFY_HTTP1=1` to select
[Chromium's HTTP/1.1 test mode](https://chromium.googlesource.com/chromium/src/+/4833795e0690343a536c0a26838d2d675f0ee968/components/network_session_configurator/common/network_switch_list.h).
The website uses the browser's normal transport selection. Test results record
the selected protocol; physical Android browser networking remains untested.

## Vercel branch audit

The Vercel API confirmed the deployed project's root directory is `web` and
its Git connection (`link`) is null. The previous production deployment
`dpl_9YisULnKQKLwc836ZZ2GKSy6Kgkp` has `source: cli`, no `gitSource`, and:

- `githubCommitRef: fix/android-testing-apk`
- `githubCommitSha: 328f712249a7484493dfb6f63e7371c12c93088c`
- `gitDirty: 1`

The final preview `dpl_DCCM88KrteLsYuHLi6wN6hoSmd3C` reports the same
branch, commit, dirty state, and CLI source, also with no `gitSource`.

Deployment uses the local branch's working files, including uncommitted edits.
It is not an automatic deployment from a pushed Git branch. No repository
connection or automatic production branch setting was changed.

## Verification

- Mobile and web TypeScript passed.
- Web export and public release metadata tests passed.
- Browser checks passed for missing/invalid release metadata, both public
  themes, installation navigation, mobile overflow, mocked administrator
  login/logout, rejected member access, direct-route refresh, both dashboard
  themes, and preservation of sessions on the public homepage.
- Download browser fixtures passed: a truncated range was retried, the saved
  complete file matched its checksum, a mismatch saved no file, and cancellation
  saved no file.
- The exported website scan found no configured private credentials.
- The pre-existing local deletion of `SYSTEM_ARCHITECTURE.md` is preserved.

The final APK has SHA-256
`a26a08c6969ee415263802ca3c07e78b794579b1f2c4eb621f5ccd30da642078`,
size 103,621,815 bytes, and the original certificate fingerprint
`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
Package/version remain `com.anonymous.musikalokal`, `1.0.0`, code `1`.
APK signature, standalone bundle, private-credential scan, and both bundled
logo checks passed. Installation over the previous APK and cold launches
without Metro passed in the Android API 36 emulator. Both sign-in themes,
the launcher mask, and both native splash themes were visually checked.
Physical-device checks and live authenticated media flows remain untested.

Screenshots are in `output/android-testing/`, including `brand-login-light.png`,
`brand-login-dark.png`, `brand-launcher.png`, `brand-splash-light.png`, and
`brand-splash-dark.png`, plus the public and admin browser screenshots.

## Published deployment

- Public website: https://musika-lokal.vercel.app
- Verified preview: `dpl_DCCM88KrteLsYuHLi6wN6hoSmd3C`, at
  https://musika-lokal-dxl7iedlv-notardreys-projects.vercel.app
- Production: `dpl_8gboLFiP8Xrz6yvH4LJTqpMXVdaZ`, ready and assigned to
  `musika-lokal.vercel.app` after promotion of the verified preview.
- Production source: CLI, `fix/android-testing-apk`, commit
  `328f712249a7484493dfb6f63e7371c12c93088c`, `gitDirty: 1`; no `gitSource`.
- Project root: `web`; install `npm ci`; build `npm run build`; output `dist`;
  Git connection remains null.
- APK download:
  https://yr5chc4fi5tszotq.public.blob.vercel-storage.com/android/testing/a26a08c6969ee415263802ca3c07e78b794579b1f2c4eb621f5ccd30da642078/musikalokal-testing.apk?download=1

The complete APK was downloaded through the final preview's button in Chromium
HTTP/1.1 mode. Its saved filename was `MusikaLokal.apk`; its size and checksum
matched the local artifact. Earlier failed transfers were rejected.

Production browser checks passed with default Chromium networking and no
session: both desktop/mobile themes, exact hosted logo checksums, absence of
administrator links and development copy, valid metadata and download button,
`/download` redirect, protected administrator routing, and login refresh.
The production manifest and button reference the identical immutable Blob URL,
size, and checksum verified on the preview. Production reused that full download
report and rehashed the downloaded file; it did not repeat the complete transfer.
HTTP/1.1 production page loading timed out on this machine, while default
networking loaded successfully. A complete Android-browser transfer remains a
physical-device check.

The published JavaScript was fetched and scanned; no configured private
credentials were found. Previous deployments, APK blobs, and release manifests
remain available for rollback. No source commit or push was made.

Local evidence: `tmp/logo-fix/final-preview-verification.json`,
`tmp/logo-fix/final-production-verification.json`,
`tmp/logo-fix/final-production-api.json`, and
`output/android-testing/deployed-musikalokal-testing.apk`.

## Responsive download page follow-up

The Android app badge was removed. The public page now uses a full-width main
download button on phones, readable device-specific guidance, native download
progress bars, expandable installation steps, and a fixed quick-download control
that appears when the main download action is outside the viewport. The control
supports cancellation and accounts for device safe areas. Page spacing prevents
it from covering the footer. Theme changes retain the approved logo pair.
Small color and disclosure transitions respect reduced-motion preferences.

Browser checks passed at 320px, 390px, and 768px widths: no horizontal overflow,
download targets at least 44px high, quick controls in the phone viewport,
keyboard-operated installation disclosures, and download cancellation from the
quick control. Android and iPhone emulation checked device-width viewports,
platform guidance, both themes, and absence of the removed badge. Existing
download integrity and administrator-session regression checks also passed.
These are browser emulation checks; physical-device verification remains open.

This website-only update reuses the APK and release manifest documented above.

The responsive preview `dpl_FG4N7LsVGYr5fnAKfdxSSRPXtTeM` passed deployed
browser checks with default networking at
https://musika-lokal-9rvkqh510-notardreys-projects.vercel.app. Checks included
the phone quick-download control, expandable permissions guidance, no badge,
exact light/dark logo assets, release metadata, and administrator redirects.
The report reused the complete download of the identical immutable APK and
rehashes that file; it does not claim a new full transfer for this page update.

The preview was promoted to production deployment
`dpl_9jpLGCfxLPMWe3kf4oLMckWzPJrK`, now ready at
https://musika-lokal.vercel.app. Production browser checks passed with default
networking, including both themes, no badge, mobile quick-download placement,
expandable installation steps, logo hashes, metadata, and administrator routing.
The published JavaScript was fetched and passed the private-credential scan.
Source remains CLI deployment from the local `fix/android-testing-apk` branch
with uncommitted edits; no automatic Git connection was added.
Reports are `tmp/logo-fix/responsive-preview-verification.json` and
`tmp/logo-fix/responsive-production-verification.json`.
