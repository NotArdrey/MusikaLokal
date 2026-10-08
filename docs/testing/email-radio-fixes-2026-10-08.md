# Email buttons and radio artist follow-up

Date: 2026-10-08 (Asia/Manila)

The email screenshot matched the old shared template in the deployed Supabase functions: a custom-scheme `musikalokal://notifications` URL. The previously implemented HTTPS builder had not reached those senders. The HTTPS gateway itself was already published.

| Email family | Button destination after this fix | Verification |
| --- | --- | --- |
| Removed/fired contracts and cancelled applications | HTTPS action gateway → Activity History | Actual shared email HTML, supplied status, and public gateway |
| Group member CV requests and leader readiness | Gateway → that application's CV task | Sent/queued HTML, cold/warm handoff, sign-in gate |
| Booking/application updates | Gateway → the appropriate Activity tab, including Applicants and Active Musicians | All allowed tabs and parameters |
| Production applications | Gateway → production team's Applications tab | Destination preserved across sign-in |
| Outstanding studio balance and Wallet updates | Gateway → Wallet, retaining the outstanding section/booking when supplied | Sent/queued HTML and URL validation |
| Orders and content notifications | Gateway → Orders or the corresponding feed/profile/group/product/playlist/station route | All supported destination constructors and allowlist |
| Identity-success Gmail/queued fallback | Gateway → feed after required sign-in/verification | Actual template function with stub delivery |
| Password reset | HTTPS recovery page → isolated verified browser or app reset | Existing native/browser recovery regressions |
| Current-address and new-address email-change approval | HTTPS email-change page → explicit confirmation → Account Details | Actual sender, browser behavior, live Auth fixture |
| Standard Auth magic-link and invitation templates | Existing HTTPS Supabase ConfirmationURL and login redirect | Inventory; existing confirmation handling preserved |
| Identity retry and manual-review notices | No action button in their templates | Inventory; no custom-scheme button to repair |
| Registration confirmation | Existing working HTTPS confirmation flow | Sender unchanged; live template hash and deployed version unchanged |

The shared senders updated were `paymongo`, `gig-applications`, `group-members`, `listings-crud`, `manage-bookings`, `manage-listings`, `permit-management`, `admin-reports-management`, `manage-marketplace`, `manage-production`, and `admin-listings-management`. `didit-webhook` and `account-email` received their specific template fixes. Each deployment was prepared from an isolated copy of its live source, with only the relevant email dependencies changed. All other deployed dependencies were preserved. Downloaded deployed files match the prepared payload, and every function retained its JWT verification setting.

Email-change generation uses the token from Supabase's generated `action_link`. On this project's live Auth service, the new-address response's `hashed_token` fails verification; the action-link token succeeds. This matches [Supabase Auth's reported token discrepancy](https://github.com/supabase/auth/issues/2538) and its [link generation implementation](https://github.com/supabase/auth/blob/master/internal/api/mail.go). Both confirmations completed against a disposable Auth user, the reused hash was rejected, its session was revoked, and the Auth/profile fixture was deleted. No real mailbox message was sent.

The browser holds email-change hashes in memory after clearing the URL fragment from history. It sends no verification request until the confirmation button is pressed, rejects malformed callbacks, supports network retries, and stores no browser session or credential. Supabase continues to enforce confirmation of both addresses. The sender pins its HTTPS callback instead of using arbitrary client redirects. The live registration template and site URL were unchanged.

Radio preparation previously copied readiness flags from an unmatched prepared station. It could therefore label one artist while playing another station's native audio. The preparation cache now retains those flags only for a matching queue, and prepared playback checks the native track ID, station ID, and source URL before publishing metadata. Other-station/stale track events cannot overwrite current metadata. Session restoration excludes ready/stopped preloads and preparation that finishes during restoration. The feed prioritizes the current matching player's title/artist/artwork.

Validation:

- `npm run test:email-links`: 48 passing checks, including sent/queued templates and executable browser/native handlers.
- `npm run test:radio`: 71 passing checks, including cross-station preparation, native-track mismatch, restoration races, immediate feed artist labels, and existing background/queue behavior.
- Mobile and web TypeScript and email Deno checks passed. Website build and public gateway/source checks passed.
- Three unauthenticated application/email actions returned 401. The temporary Auth/profile fixture count is zero.
- Feed lint diagnostics match the existing baseline: 12 errors and four warnings; radio context has zero errors/warnings.
- Email-change pages were visually checked at 320px in both themes. Public confirmation requests were stubbed for browser UI checks; the separate live Auth fixture verified real token consumption.

The email gateway was first promoted in `dpl_5jodFmYL6PcfE9g21VqKndMvVV8A`. The final APK release deployment is **`dpl_432gcy315eHwEFWYmKqgZoCjPdbX`**, promoted to [musika-lokal.vercel.app](https://musika-lokal.vercel.app). APK **1.0.4/build 5** contains the verified radio and email destination source. Its compiled bundle matches the APK bundle exactly, signing matches 1.0.3, and the configured private-credential scan passed. The complete public APK download and real browser download match **102,456,843 bytes** and SHA-256 `5485f0131bf7b9ee9bb5b0bf8d119705a61f272d012a5f7533f4395b514b1157`. The production website was checked using that same downloaded artifact. The prior website deployment, APK 1.0.3, and isolated function baselines remain available for rollback. Sanitized evidence: [email-radio-fixes-2026-10-08.json](email-radio-fixes-2026-10-08.json).

Physical Android Gmail clicks, app installation, and radio acceptance are pending; no Android device was connected. Install APK 1.0.4 over the prior version to receive the client fixes. Already-delivered emails cannot be rewritten; newly generated messages use these fixes. No queued pending email had a custom-scheme button, and no real signup, payment, application, or contract action was submitted as a test. The additional 97 application/CV checks, four release-metadata checks, and exported website regression also passed.
