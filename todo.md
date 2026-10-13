# WatchNow — TODO

- [x] **App update feature** — GitHub-release version check in Settings → About (`src/lib/update.ts`); token-authed (private repo), "Update app" downloads the release APK with progress and opens the Android installer (share-sheet fallback).
- [x] **Share app feature** — "Share app" row downloads the release APK and sends the file itself via the share sheet (link fallback).
- [ ] **Test update + share on device** — needs a *newer* release than the installed version: publish a release with an APK, bump `app.json` version below the tag, rebuild the dev APK (native deps: `expo-intent-launcher`, `expo-sharing`), then verify NEW badge → download % → installer, and share sheet sends the APK.
