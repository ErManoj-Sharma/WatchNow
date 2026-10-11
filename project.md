# WatchNow — Project Details

## What it is

A Netflix-style **offline local-media player for Android**. It scans the phone's storage (via the Storage Access Framework) for video files, classifies them as movies or TV episodes, stores them in SQLite, and plays them with resume-progress, online posters, and gesture-rich playback. Also plays **YouTube playlists** added by URL (streamed via an in-app WebView player). No accounts — local files plus public YouTube playlists. Full requirements: `srs.md`.

## Stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK **57.0.27**, React Native **0.86.3**, React **19.2.3** |
| Language | TypeScript (strict), `@/*` → `./src/*` |
| Routing | **Expo Router** (file-based, `src/app/`), typed routes, React Compiler on |
| Storage | `expo-sqlite` (library DB, `PRAGMA foreign_keys = ON`) + `expo-file-system` SAF access |
| Playback | `expo-video` (Media3/ExoPlayer on Android) + `expo-video-thumbnails`; YouTube via `react-native-youtube-iframe@2.3.0` + `react-native-webview` |
| Native UX | `expo-screen-orientation`, `expo-navigation-bar`, `expo-brightness`, `react-native-volume-manager`, `@expo/vector-icons` (Ionicons) |
| UI | `expo-image`, theme tokens in `src/theme/colors.ts` |
| Dev tooling | `tsx` (tests via node test runner), `eslint-config-expo`, `npx expo lint`, `npx tsc --noEmit` |

## Feature set (implemented)

- **Scanner**: SAF folder pick → recursive scan → filename classification (quality/year/extension; `S01E03`, `1x03`, `Season 1 Episode 3`, `E3` patterns) → SQLite import with stale-entry cleanup.
- **Library UI**: Home (rows: continue-watching, recently added, movies, shows), Movies list, Series detail (season/episode), Search, Settings — all in `src/app/(tabs)/`.
- **Player** (`src/app/player.tsx`, the most iterated file):
  - Custom chrome in both orientations (native Media3 controls disabled — see context.md for why)
  - Tap = show/hide chrome (300ms grace for double-tap detection); auto-hides after 3s while playing
  - Hold = 2× speed with badge (pitch preserved)
  - Double-tap left/right = ∓10s with floating icon+`10s` indicator
  - Vertical swipe: **left half = brightness** (app-local via expo-brightness), **right half = system volume** (react-native-volume-manager, music stream), with % indicator
  - CC chip cycles subtitle tracks (off → track1 → … → off); Audio chip opens a track list
  - ⛶ = in-app immersive: locks landscape (expo-screen-orientation), hides status/nav bars (expo-navigation-bar); native fullscreen activity deliberately disabled
  - Time display tap toggles remaining countdown (`- 2H 34M 00S`)
  - Progress save on 10s interval / pause / back; resume on reopen; codec-error friendly messages; play-next for episodes
- **Online posters**: background fetch of TMDB/TVmaze/OMDb posters with strict title/year matching, local frame fallback, Settings UI for API keys + "refresh missing".
- **YouTube playlists** (`src/features/youtube/`, screens `src/app/youtube/[id].tsx` + `youtube-player.tsx`): paste a playlist URL in Settings → YouTube; name/thumbnail/episodes (+ thumbs, durations) fetched via the YouTube Data API v3 (key from `EXPO_PUBLIC_YOUTUBE_API_KEY` in `.env`) and stored in dedicated `youtube_playlist`/`youtube_video` tables (migration V4 — deliberately separate from the local-library tables). Home "YouTube Shows" row (gated by the `show_youtube_shows` pref); playback via `react-native-youtube-iframe@2.3.0` in a WebView with resume, watched state, and auto-advance.
- **Thumb component**: poster → local thumbnail → letter fallback chain used by all lists.

## Layout

```
src/
  app/            # Expo Router screens (player.tsx = local playback, youtube-player.tsx = YouTube playback)
  app/(tabs)/     # home, movies, series, search, settings
  app/youtube/    # index.tsx = manage playlists, [id].tsx = playlist detail
  components/     # thumb, section-row, continue-card, button, …
  db/             # schema.ts (migrations), repositories.ts (local queries)
  features/
    scanner/      # SAF scan + classification engine
    metadata/     # match.ts, providers.ts, fetcher.ts (+ tests)
    youtube/      # parse.ts, api.ts, store.ts (+ tests)
  theme/          # colors.ts (colors, spacing, font, radius)
  utils/          # format.ts (bytes, duration, timestamps)
```

## Commands

```bash
npx expo start              # Metro dev server (JS reloads over the air)
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npm test                    # tsx --test src/**/*.test.ts (46 tests: metadata, classification, youtube, schema)
npx expo install <pkg>      # always use this to add deps (SDK-version resolution)
cd android && ./gradlew assembleDebug   # rebuild debug APK (needed after adding native modules)
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk` (package `com.ermanojsharma.WatchNow`).

**The debug APK has no embedded JS** — it loads the bundle from Metro. JS-only fixes need a Metro reload; native-module changes need a rebuild + reinstall.

## Env

`.env` (gitignored): `EXPO_PUBLIC_OMDB_API_KEY`, `EXPO_PUBLIC_YOUTUBE_API_KEY` — Expo only exposes `EXPO_PUBLIC_*` vars; run `npx expo start -c` after changes (inlined at bundle time). The YouTube key needs the **YouTube Data API v3** enabled in a Google Cloud project (API-key credentials, no OAuth).
