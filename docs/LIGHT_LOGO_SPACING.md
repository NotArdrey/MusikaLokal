# Light-theme logo spacing correction

This records the first spacing correction. The later dark-logo, launcher,
footer, and public-copy changes are recorded in [Brand asset audit](BRAND_ASSET_AUDIT.md).

The light-theme wordmark was moved below the circular emblem to eliminate
the overlap with the black `MUSIKA` lettering. Both app copies use the same
1254 × 1254 transparent PNG:

- `mobile/assets/images/musika-lokal-logo-modern-wordmark.png`
- `web/assets/images/musika-lokal-logo-modern-wordmark.png`

The built-in imagegen tool edited the original raster asset. The result was
inspected at full size and in the homepage layout. The dark-theme asset is
unchanged. The homepage header's Admin Sign In link was removed; administrator
sign-in remains available at `/admin/login` and through the footer.

The rebuilt release retains version `1.0.0`, version code `1`, and the original
testing signing identity. It installed over the previous APK and cold-launched
without Metro. The light login screen was visually inspected in the Android
API 36 emulator. Its SHA-256 is
`2dfb57671802f6a87e888a30388777ff331091c1d26629e48b8d05b3552285f5`.
The previous APK and its manifest remain in Blob storage and `web/releases/`
for rollback.

Verification for this correction:

- Web TypeScript and static export passed.
- Local browser checks passed for public routes, light/dark themes, mobile
  layout, unavailable metadata, and mocked administrator access flows.
- The verified preview passed browser checks for the missing header link,
  logo loading, public download, route redirects, and direct login refresh.
  The APK downloaded through its button matched the local SHA-256.
- APK signature and bundled logo were checked; installation over the previous
  version and a cold launch passed in the Android API 36 emulator. Physical
  device checks and live authenticated media flows remain untested.

Published October 5, 2026:

- Preview: `dpl_6WfjaApDncdVuCaTKBv2TA1ryp35`,
  <https://musika-lokal-ltj4xv06c-notardreys-projects.vercel.app>.
- Production: `dpl_9YisULnKQKLwc836ZZ2GKSy6Kgkp`,
  <https://musika-lokal.vercel.app>.
- Public APK: <https://yr5chc4fi5tszotq.public.blob.vercel-storage.com/android/testing/2dfb57671802f6a87e888a30388777ff331091c1d26629e48b8d05b3552285f5/musikalokal-testing.apk?download=1>.
- File size: 103,310,613 bytes (98.5 MiB).
- Production browser checks passed without authentication, including the
  actual APK download and checksum comparison. The delivered website bundle
  contained no configured private credentials.

Existing installations can install the new download over the previous testing
APK because the package and signing certificate are unchanged.

Edit prompt:

> Edit target: the provided existing MusikaLokal light-theme transparent PNG
> logo. Make a very small typography placement correction only. The black/dark
> navy MUSIKA text currently overlaps the bottom edge of the circular music
> emblem. Move the complete two-line wordmark (black MUSIKA and violet LOKAL)
> downward by approximately 50 pixels on the original 1254x1254 canvas so there
> is a clear transparent gap of about 20 pixels between the bottom of the
> emblem and the top of MUSIKA. Keep the two text lines' existing relative
> spacing, original exact letter shapes, size, weight, colors, center
> alignment. Preserve the entire circular emblem, note, pin, house, waveform,
> gradients, shapes, and their positions exactly unchanged. Preserve original
> canvas proportions and transparent background, no background panel, no
> shadows added, no redesign, no new elements. Text must remain exactly MUSIKA
> and LOKAL. This is a surgical spacing fix to the existing brand asset.
