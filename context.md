# WatchNow — Session Context (for AI assistants)

Everything needed to pick this project up cold. Project overview in `project.md`; requirements in `srs.md`.

## Environment

- Dev machine: **WSL Linux**, Node 24.13.1, npm 11.8.0, Java 17, Android SDK `/usr/lib/android-sdk`, adb on PATH.
- **No emulator** (KVM permission denied, sudo needs password). The user tests on **their own Android phone** via USB + Metro. Never claim runtime verification — all "it works" statements come from the user.
- Git repo on `main`. **User rule: never commit without asking first; the user verifies on-device before commits are approved.**

## How the user runs the app

- Debug APK installed on phone (`com.ermanojsharma.WatchNow`) + Metro on WSL: APK has **no embedded JS**, loads from Metro.
- JS-only change → user just reloads (`r` in Metro / shake menu).
- New native module → `cd android && ./gradlew assembleDebug` (~15 min) → user reinstalls APK. Always tell the user when a reinstall is required.
- `.env` changes → `npx expo start -c` (env inlined at bundle time).

## Architecture decisions (and why)

- **Player uses 100% custom controls** (`nativeControls={false}` in every orientation). Reasons discovered the hard way:
  - expo-video's Android native controls never expose an **audio-track button** — `VideoView.kt` computes `showsAudioTracksButton` but nothing reads it (dead code in 57.0.5).
  - The **native fullscreen activity pauses the JS runtime** on Android — no RN overlay, gestures, or pickers can exist there. Native fullscreen is therefore disabled (`fullscreenOptions={{enable:false}}`); ⛶ is an in-app immersive mode (orientation lock + hidden system bars) instead.
  - Once an RN overlay sits over the `VideoView`, it intercepts all touches — the native bar can't be re-summoned by tap.
- **All player gestures live on one responder chain** on a single full-screen `View` (grant/move/release): hold=2x, vertical swipe=brightness/volume, double-tap=±10s, single tap (300ms grace)=chrome toggle. Do not add a child `Pressable` over the video — it steals the responder and silently kills the other gestures (this exact bug happened once).
- **Save-position never touches the native player during teardown**: `saveNow()` reads `lastPosRef`/`lastDurRef` updated by `timeUpdate` — the shared object is already released when the focus-cleanup runs on back-navigation (this caused a native crash once).
- **Brightness is app-local** (`Brightness.setBrightnessAsync`) — no WRITE_SETTINGS permission friction; overrides system brightness only while the app is foregrounded. Volume is **system** volume (music stream) via `react-native-volume-manager`.
- **Navigation bar** hidden during playback via `expo-navigation-bar` `setVisibilityAsync`, restored on screen unmount. `setBehaviorAsync` does NOT exist in the installed version.
- **Expo installs only**: always `npx expo install <pkg>` (SDK-compatible versions). `react-native-volume-manager` is the one plain-npm dep (not an Expo module; legacy Java module, works via RN interop layer on new arch).
- **No `ios/`/`android/` hand-editing** — generated (CNG); native config goes in `app.json`.
- Poster matching is **strict** (exact/containment ≥5 chars, year ±1) — deliberately never guesses; unmatched titles get local frame fallback and are retried only when `metadata_attempted` is unset.
- All entry deletes go through `deleteEntryDeep()` (children-first) because `PRAGMA foreign_keys = ON` — raw deletes crash with FK errors.
- **YouTube is a separate subsystem, not part of the local library** (`src/features/youtube/`). New tables `youtube_playlist`/`youtube_video` (migration V4) — do NOT fold YouTube into `library_entry`/`media_item`/`scan_root`: those assume SAF document URIs, filesystem dedupe, and "change root = wipe everything" (`setRoot`), none of which apply to remote playlists. Resume progress (`position_ms`/`completed`/`last_played_at`) lives on the `youtube_video` row rather than a mirror of `playback_progress` (keyed by `media_item_id`, meaningless for remote videos).
- **`react-native-youtube-iframe` is pinned to 2.3.0** — 2.4.0/2.4.1 are broken on Android (play/pause commands over `postMessage` never reach the player; upstream issues #376/#378, fix PR #380 unmerged). 2.3.0 works natively and re-exports the modern `react-native-webview`, so pinning beats carrying a patch-package diff. The "outdated JSX transform" Metro warning comes from its prebuilt `dist/` — harmless, ignore it.
- **YouTube playback is a second player screen** (`youtube-player.tsx`), not a reuse of `player.tsx` — `expo-video` plays local `document_uri`s only. Chrome is deliberately minimal (top bar + up-next/error overlays); play/pause/seek/quality/captions are YouTube's own in-iframe controls. One WebView remount per episode (`key={videoId}`) — the iframe HTML bakes the video id in, so remounting is the reliable switch+resume path. Playlist metadata comes from the free YouTube Data API v3 (key in `.env`; `playlistItems.list` = 1 quota unit/page of 50, durations need a second `videos.list?part=contentDetails` pass; deleted/private items are filtered by their placeholder titles).

## Known environment quirks

- **TMDB is ISP-blocked in India** (user's Jio/Airtel). Fetcher marks TMDB unreachable for the batch after the first timeout; TVmaze (shows, keyless) and OMDb (user's key) do the real work. Keep the TMDB probe logic.
- **OMDb `t=` is exact-match**: query with year/quality stripped (`queryTitleOf`), else "Premalu 2024" finds nothing.
- 2-day-old releases (e.g. "Matchbox The Movie 2026") are often not indexed by any provider — correct behavior, not a bug.
- Many downloaded rips use **EAC3/Dolby audio** the phone can't decode (`Decoder init failed [-49999]`). Device limitation; the player shows a friendly "try an AAC rip / re-encode" message. In-app transcoding was considered and rejected (ffmpeg-kit is EOL; a transcoder module + queue UI is a whole feature). Workaround shared with user: `ffmpeg -i in.mkv -c:v copy -c:a aac out.mkv`.
- expo-video: use **`replaceAsync`** (sync `replace` warns/freezes on iOS); `SubtitleTrack`/`AudioTrack` identify tracks by **`id`** (not `identifier`); `playbackRate` property + `preservesPitch=true` for 2x (pinned explicitly).
- **Thumbnails/duration: player pipeline only** (`src/features/library/thumbnails.ts`). `expo-video-thumbnails` (MediaMetadataRetriever) "succeeds" with **all-black frames** on the user's MKV/HEVC rips (verified on device) — never use it. `ensureThumbnail` = queued throwaway `createVideoPlayer`: wait readyToPlay → persist `duration_ms` → `generateThumbnailsAsync` at ~20% in (capped 45s, mid-file retry) → native image ref used directly as expo-image `source`. Refs can't be persisted → session-only, lazy per visible card, one decoder at a time. Migration v3 wiped old black JPEGs.
- Metro **reload races expo-sqlite** ("shared object that was already released" on prepareAsync) — transient DB errors right after reload are expected; key DB writes retry once after 400ms. Verify thumbnail/DB behavior on a cold start, not after reload.
- **SQLite UNION arms must have identical column counts** and produce identical rows for the same entity — older SQLite tolerated mismatches, SDK 57's bundled one throws `SELECTs to the left and right of UNION do not have the same number of result columns`. The search query broke twice this way (missing `poster_url` columns; title-match vs file-match rows not deduping).
- **expo-blur Android needs an explicit blur target**: `blurMethod="dimezisBlurViewSdk31Plus"` (the old `experimentalBlurMethod` prop is deprecated) plus a `blurTarget` ref — without it, Android silently falls back to a flat tint (no backdrop blur). Tab screens wrap their root in `BlurTargetView` and register via `src/lib/blur.ts` on focus; the tab-bar `BlurView` subscribes to that registry. Android's Material 3 native tabs have a fixed ~80dp height with no height prop — that's why the app uses JS tabs.
- React Compiler (eslint `react-hooks/refs`) forbids reading refs during render — `useRef(PanResponder.create(...)).current`, `useRef(new Animated.Value(0)).current`, and passing refs into `useMemo` factories all fail lint. Use responder props + `useCallback`; for scroll-driven Animated values use `const [scrollY] = useState(() => new Animated.Value(0))`; refs only inside handlers.
- Status bar overlap on Android: `contentInsetAdjustmentBehavior` is a no-op — screens pad with `useSafeAreaInsets().top`.

## User preferences observed

- Tests on device after every change; reports symptoms in plain words (e.g. "cartnish" = harsh audio at 2x; "control options" = the audio-track list).
- Wants player UX to behave like YouTube/MX Player: tap chrome, double-tap seek, hold 2x, swipe brightness/volume, auto-hide bars, hidden system nav.
- Rejects clunky UI (no boxes around seek-flash; icons + label only, not too close to edges).
- Reverted the HH:MM:SS time format — prefers compact `1h 47m / 2h 35m`; tapping it toggles `- 2H 34M 00S` remaining.
- Hand-edits files sometimes (e.g. Title-case helper on the Audio label) — preserve their edits.
- Wanted `project.md` + this file so future sessions need no re-explanation.

## Commit history (feature arc)

| Commit | What |
|---|---|
| `de21017` | bootstrap Expo SDK 57 project |
| `f8085dd` | core: SAF scanner, classification, SQLite, UI, player |
| `c1555af` | status-bar padding fix |
| `afac065` | thumbnail fixes (race, series covers) |
| `ca0f8e2` | online posters (TMDB/TVmaze/OMDb) |
| `dcb573f` | player back-crash fix + first portrait custom bar |
| `d3052cc` | landscape audio-track picker + codec error message |
| `26e19c2` | player UX polish: hold-2x, tap chrome, hidden nav, immersive lock, unified controls |
| `057bae8` | pin preservesPitch |
| `625ba91` | double-tap ±10s, centered play/pause, Ionicons UI |
| `969574a` | tap time → remaining countdown |
| `b0615d5` | swipe brightness/volume + project.md/context.md docs |
| `ac51703` | settings UI redesign (eyebrow sections, stat strip, status dot) |
| `6850c4b` | settings row-pattern redesign + modals, GitHub-release update check, share app, animated scan indicator |
| `be0cfaf` | rescan purges deleted files (no more "missing" ghost rows; Missing stat removed) |
| `989c7f5` | Customization section with SQLite-backed home-screen toggles |
| `9d52cd1` | docs sync (context.md + todo.md) |
| `e8adec6` | docs: add customization commits to context history |
| `2e87d98` | player-based thumbnails + duration probe, migration v3 |
| `635c5fc` | docs: thumbnail/sqlite-race lessons |
| `a7da460` | Show My List toggle (favorites above Movies) |
| `b4bf9cd` | docs: show_favorites |
| `f4cb030` | "My Favorites" button rename (user edit) |
| `af0ff46` | JS tab bar — icon-only, 56px, glassmorphism (expo-blur backdrop) |
| `755d9b2` | sticky tab headers |
| `ea3ff28` | search: UNION dedupe/column fix, S/E info, result count, tap episode → player |
| `179e1dd` | sectioned search results (Movies/Shows/Episodes) |
| `156c43d` | movie detail redesign (gradient hero, back button, progress sliver) |
| `119785f` | series detail UI (poster hero, parallax, season pills) + Animated ref lint fix |

## Backlog (`todo.md`)

- [x] App update feature — GitHub-releases check in Settings About section (`src/lib/update.ts`); update row opens the release page
- [x] Share app feature — RN Share sheet with the releases link

## Conventions

- Settings screen pattern: `Section` (red uppercase eyebrow + card) + shared `Row` with optional `divider` prop; sub-options open via the local `InfoModal` shell (Customization, Index, Artwork). Action rows are `SettingRow`, toggle rows `ToggleRow` (RN Switch, accent track).
- Home-section toggles live in `src/lib/prefs.ts` (KV in `app_setting` table: `show_recently_added`, `show_continue_watching`, `show_youtube_shows`, `show_favorites`; defaults ON). Home (`index.tsx`) re-reads prefs on each focus; section order: Continue watching → Recently Added → My List → Movies → Web Series → YouTube Shows.
- Update/share: `src/lib/update.ts` — GitHub-releases API check (public, no backend), `Share.share` with the releases link.
- Scanner: deleted files are purged on rescan (deep-delete entries + progress + media row); same-scan moves recovered by name+size, cross-scan moves count as delete+re-add (progress lost).
- Player gestures all live in the single responder chain in `src/app/player.tsx` — read the architecture note above before touching it.
- Tabs use **JS `Tabs`** (not `NativeTabs`) — Android Material native tabs ignore icon-only/height styling; bar is `height: 56 + insets.bottom`, absolute, glass via `expo-blur` (real Android backdrop blur needs `blurTarget` from `src/lib/blur.ts`); the Android nav-button strip below stays solid, not glass. Tab screen headers are sticky views above the ScrollView (content scrolls beneath), not part of scroll content.
- Search: `SectionList` grouped Movies/Shows/Episodes; episodes show `S{n} E{n} · Show` and tap-to-play. `searchLibrary` UNION arms must emit identical rows per entity (see quirks).
- Detail screens (movie/series): full-width gradient hero (`expo-linear-gradient`), floating back button, poster preferred over frame for series; parallax via Animated scrollY (`useState(() => new Animated.Value(0))`). YouTube playlist detail mirrors this pattern with remote `i.ytimg.com` thumbnails (passed as `posterUrl`; `mediaId` stays null so the local thumbnail pipeline is skipped).
- YouTube management is a dedicated pushed screen `src/app/youtube/index.tsx` (reached from Settings → YouTube): key status, add-playlist URL field, playlist list with per-row delete. Adds go through `fetchPlaylistWithItems` → `savePlaylist` (one transaction; existing per-episode progress survives a re-sync, videos YouTube removed are dropped). Playlist detail is `youtube/[id].tsx` — so `/youtube` and `/youtube/[id]` share the directory.

## Where things live

- Player (all gestures/chrome): `src/app/player.tsx`
- Home-screen prefs: `src/lib/prefs.ts` · update check + share: `src/lib/update.ts`
- DB schema + migrations: `src/db/schema.ts` · all queries: `src/db/repositories.ts`
- Poster pipeline: `src/features/metadata/{match,providers,fetcher}.ts` (+ tests)
- Scan + classify: `src/features/scanner/`
- Thumbnails + duration probe (player-based): `src/features/library/thumbnails.ts`
- Android blur-target registry (tab-bar glass): `src/lib/blur.ts`
- Poster display chain: `src/components/thumb.tsx`
- YouTube: `src/features/youtube/{parse,api,store}.ts` (+ tests) · detail `src/app/youtube/[id].tsx` · player `src/app/youtube-player.tsx`
- Theme tokens: `src/theme/colors.ts`

## Verification checklist before any "done"

1. `npx tsc --noEmit`
2. `npx expo lint`
3. `npm test` (46 passing: metadata, classification, youtube, schema)
4. If native deps changed: gradle rebuild + tell user to reinstall
5. Ask for commit approval — never auto-commit
