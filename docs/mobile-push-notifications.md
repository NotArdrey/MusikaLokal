# Mobile heads-up notifications

MusikaLokal uses system push notifications to show temporary banners while the user is in another app. Android notifications use the `musika-lokal-alerts-v2` channel with maximum importance, default sound, and vibration. The server sends a visible title/body with `priority: high`, `sound: default`, and the same channel ID. Foreground notifications keep the existing deduplicated in-app toast.

The native notification library is bundled through a literal `require`. The app creates the alerts channel and waits for it before requesting permission or registering a device. The Expo notification plugin also sets this channel as the native FCM default. Existing user changes to this channel are preserved.

## Configuration required before the next APK

The 2026-10-07 checkout has no Expo project ID or Firebase Android configuration file. Read-only backend inspection found zero active push devices. The live dispatch function already uses the correct channel, priority, and sound; this source change requires no Supabase migration or function deployment.

1. Use the app's Expo/EAS project ID. Add it to the repository root `.env` or build environment as `EXPO_PUBLIC_EAS_PROJECT_ID`. Existing `extra.eas.projectId` configuration remains supported.
2. Register the Android app `com.anonymous.musikalokal` in the matching Firebase project and obtain its `google-services.json`. Set `GOOGLE_SERVICES_JSON` to the file's path. A relative path is resolved from `mobile/`; for a file at `mobile/google-services.json`, use `./google-services.json`. Existing `android.googleServicesFile` configuration remains supported.
3. Configure the matching Firebase FCM V1 service-account credential in the Expo project's push credentials. This private credential belongs in EAS, separate from the Android `google-services.json`; it must not be bundled into the app. Follow [Expo's FCM credential setup](https://docs.expo.dev/push-notifications/fcm-credentials/).
4. Build/install a new native APK with this configuration. Sign in and grant notification permission so `register_push_device` can save the installation's Expo push token. Expo Go cannot verify this remote-push flow.
5. Enable Push Notifications in the app's Notification Settings. In Android's settings for MusikaLokal > Notifications > MusikaLokal Alerts, allow notifications and pop-up banners/sound. Names vary by device. Android controls presentation, including channel preferences and Do Not Disturb; the app cannot override those choices. See [Android notification channels](https://developer.android.com/develop/ui/compose/notifications/channels).

## Verification

`npm run test:heads-up-notifications` passes 10 tests covering channel readiness and retry, unmount cancellation, permission denial, missing project configuration, platform guards, notification navigation, native build configuration, and actual SQL trigger payloads against an isolated database. The trigger checks opt-out, read notifications, inactive/other-user devices, and token deduplication without sending any real pushes.

Mobile TypeScript and targeted ESLint pass with zero errors. Expo Android manifest introspection confirms the channel ID. Android export succeeds, and its source map confirms that the notification library, Android channel implementation, and push-token implementation are bundled. The verification export is at `mobile/build/heads-up-verification`; it is not an installed APK.

Evidence: [heads-up-notifications-2026-10-07.json](testing/heads-up-notifications-2026-10-07.json).

Physical-device acceptance remains pending: send a notification to an isolated signed-in test installation while a different app is open, confirm the temporary top banner and notification-shade entry, and tap it to verify the destination. Also verify foreground delivery, normal app closure, notification opt-out, and disabled device banners. No real-user notification was sent in this session.
