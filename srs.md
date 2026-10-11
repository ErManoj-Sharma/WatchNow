# AI CODING AGENT MASTER PROMPT — WatchNow

## 1. Your Role

Act as a senior React Native engineer, Expo specialist, Android developer, TypeScript architect, and UI/UX designer.

Your task is to build a production-quality Android application called **WatchNow**.

The application should look and feel similar to Netflix, but with one fundamental difference:

**All movies and web-series video files are stored locally on the user's Android device. The app indexes, organizes, displays, and plays those local files without uploading or streaming them from a server.**

You have access to my development environment through the terminal. Do not stop after providing instructions or code snippets. Inspect the environment, implement the application, run available checks, build it on the connected Android phone, and fix errors where possible.

Work incrementally, preserve existing configuration where appropriate, and verify each major milestone before proceeding.

---

## 2. My Development Environment

My environment is:

- Operating system: Windows with WSL/Linux
- Shell: Zsh with Oh My Zsh
- Node.js: previously installed, version 24.13.1
- npm: previously installed, version 11.8.0
- Android SDK: previously located at `/usr/lib/android-sdk`
- ADB: previously located at `~/Android/platform-tools`
- Physical Android device: connected through ADB
- Development approach: React Native + Expo + TypeScript
- Android build method: Expo development build using Gradle
- Preferred workflow: develop in WSL and run the app on my real Android phone

These values are historical. Verify the actual current environment before making changes.

Do not assume that all SDK components, Java versions, environment variables, Android licenses, or Expo dependencies are correctly configured.

### Environment inspection

Start by checking:

```bash
pwd
node -v
npm -v
java -version
echo "$ANDROID_HOME"
echo "$ANDROID_SDK_ROOT"
which adb
adb devices
ls -la /usr/lib/android-sdk
```

Inspect existing project files if the current directory already contains a project.

If there is no existing project, create it in:

```text
~/Projects/watchnow
```

If a project already exists, inspect and reuse it rather than overwriting it.

### Environment safety rules

1. Never delete or overwrite unrelated projects.
2. Never uninstall Android SDK components that other projects may need.
3. Do not run destructive cleanup commands without explaining their scope.
4. Do not repeatedly delete `node_modules`, lockfiles, or Gradle caches as a first response to errors.
5. Preserve the existing package manager and lockfile when working in an existing project.
6. Do not expose environment variables containing secrets.
7. Ask for assistance only when genuinely blocked by an interactive prompt, missing permission, unavailable hardware, or a decision that cannot safely be inferred.
8. Do not claim that a build or installation succeeded without verifying the result.

---

## 3. Technology Stack

Use the following stack unless a verified compatibility issue requires an alternative.

### Core

- React Native
- Expo
- TypeScript with strict typing
- Expo Router
- Expo development client
- tailwindcss or a well-supported styling system
- Functional components and React hooks

### Local media

- `expo-file-system` for filesystem integration and supported Android directory-selection APIs
- Android Storage Access Framework for selecting the root media directory
- A small native Android module only if Expo APIs cannot reliably implement a required operation
- `expo-video` for local video playback, after validating compatibility with the selected Expo SDK

### Persistence

- `expo-sqlite` for the media library, relationships, playback progress, favorites, and scan state
- AsyncStorage only for lightweight preferences if needed

### Background operations

- React Native background processing where appropriate
- WorkManager through native Android integration if durable background scanning is genuinely required

### UI

- React Native StyleSheet or a well-supported styling system
- Expo Vector Icons or an existing compatible icon package
- Reusable TypeScript components
- Responsive portrait and landscape layouts
- Dark theme as the default

Before installing packages, inspect the installed Expo SDK and run Expo compatibility checks.

Use `npx expo install` for compatible Expo packages. Do not blindly upgrade the entire project or install deprecated libraries.

---

## 4. Product Requirements

The app must provide a personal offline media library.

The user selects one root folder named `Movie`. This directory may contain movie files, series directories, season directories, technical grouping directories, subtitle files, and arbitrary nested structures.

Example:

```text
Movie/
├── Interstellar.mkv
├── Avengers Endgame.mp4
├── Action/
│   └── John Wick/
│       └── John Wick.mkv
├── Panchayat/
│   ├── Season 1/
│   │   ├── S01E01.mkv
│   │   └── S01E02.mkv
│   └── Season 2/
│       ├── S02E01.mkv
│       └── S02E02.mkv
├── Mirzapur/
│   └── 1080p/
│       └── Season 1/
│           └── Episode 01.mkv
└── Another Series/
    ├── Disc 1/
    │   ├── Episode 01.mp4
    │   └── Episode 02.mp4
    └── Disc 2/
        └── Episode 03.mp4
```

This is an illustrative structure, not a requirement that the user reorganize existing files.

The scanner must handle:

- Movies directly in the root
- Movies inside subfolders
- Series with episodes directly inside a folder
- Series with season folders
- Arbitrarily nested episode directories
- Filenames with episode numbers
- Inconsistent folder naming
- Technical directories such as `1080p`, `720p`, `WEB-DL`, `BluRay`, `x264`, and `x265`
- Duplicate episodes in different resolutions
- Missing season and episode numbers
- External subtitle files
- Missing or inaccessible media
- Renamed and moved files
- Rescanning without duplicate database records

Never require the user to rename or move their files.

---

## 5. Android Storage Access

Implement folder selection using Android's Storage Access Framework.

### Requirements

1. Provide a button labeled `Select Movie Folder`.
2. Open the Android directory picker.
3. Allow the user to select the existing `Movie` directory.
4. Persist the granted directory permission where supported.
5. Remember the selected folder across application restarts.
6. Recursively enumerate accessible subdirectories.
7. Read file metadata without copying or moving video files.
8. Use content/document URIs where required by Android.
9. Handle permission revocation and unavailable storage gracefully.
10. Provide a way to change the root folder.

Do not assume that a `content://` URI is a normal filesystem path.

Do not use unrestricted all-files access unless a specific, verified requirement justifies it.

Do not depend exclusively on Android's shared-storage filesystem paths. The user may select a directory through the document picker.

Do not copy large movie files into the application sandbox.

### Important implementation requirement

Verify which Expo filesystem APIs are available in the installed SDK. Do not mix incompatible current and legacy filesystem APIs.

If recursive directory enumeration through the selected tree cannot be implemented reliably in JavaScript, implement a small Kotlin native module that:

- Launches or integrates with the Android directory picker
- Persists the tree URI permission
- Traverses the selected directory recursively
- Returns relative paths, document URIs, filenames, sizes, and modification times
- Supports cancellation and progress reporting
- Reports inaccessible files without crashing the scan

Keep the main UI and business logic in TypeScript.

---

## 6. Recursive Media Scanner

Implement a robust scanner with the following responsibilities.

### Discovery

- Start at the selected root.
- Recursively traverse accessible directories.
- Use a configurable maximum depth or another safe mechanism to avoid pathological directory trees.
- Detect directory cycles where applicable.
- Ignore inaccessible entries and report errors.
- Skip known irrelevant folders such as thumbnail caches or application-generated cache directories when appropriate.
- Recognize common video extensions, including `.mp4`, `.mkv`, `.avi`, `.mov`, `.m4v`, `.webm`, `.ts`, and `.3gp`.
- Treat extension matching as case-insensitive.
- Do not assume every file with a video extension is playable.
- Let the player handle actual codec support.

### File identity

For each discovered video, record:

- Stable database ID
- Root-relative path
- Display filename
- Document URI
- File size
- Last-modified timestamp, when available
- Detected MIME type, when available
- Last-scanned timestamp
- Duration when successfully extracted
- Thumbnail cache location, if generated
- Optional content fingerprint

Avoid hashing every large video on every scan.

### Incremental scanning

Compare discovered entries with existing database records.

- Insert newly discovered files.
- Update changed metadata.
- Preserve playback history when a file's identity can be matched reliably.
- Detect files that have disappeared.
- Mark missing files instead of immediately destroying their history.
- Remove stale records only after a successful reconciliation.
- Never interpret an interrupted scan as proof that every missing file was deleted.

Make the scan cancellation-safe and avoid loading the entire directory tree into memory unnecessarily.

### User interface

Show:

- Scan progress
- Number of directories visited
- Number of video files discovered
- Number of items indexed
- Any permission or access errors
- A retry action

Large libraries must not freeze the UI.

---

## 7. Media Classification Engine

Build a separate classification module. Do not mix parsing and classification logic into UI components.

The system should distinguish:

- Movie
- Series
- Season
- Episode
- Unclassified video
- Optional alternate version of an existing episode

### Filename parsing

Support patterns including:

```text
S01E02.mkv
Show.Name.S02E05.1080p.mkv
1x03.mp4
Season 2 Episode 4.mkv
Episode 03.mkv
E03.mp4
```

Also recognize season information from ancestor directory names such as:

```text
Season 1/
Season_02/
S03/
Series Name - Season 4/
```

Avoid interpreting a movie release year as an episode number.

Strip technical tokens such as resolution, codec, release quality, and common release metadata from inferred display titles when safe.

Do not discard the original filename.

### Confidence-based classification

Use a weighted rule-based classifier that considers:

- Filename episode patterns
- Season directory names
- Ancestor folder names
- Sibling episode files
- Numbering consistency
- Video count within directories
- Technical grouping directory names
- Directory depth
- Movie-like and series-like naming patterns

Return a classification result containing:

```ts
type ClassificationResult = {
  kind: "movie" | "series" | "season" | "episode" | "unknown";
  confidence: number;
  evidence: string[];
  suggestedTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  parentRelativePath?: string;
  needsReview: boolean;
};
```

Use a confidence score between `0` and `1`.

These confidence values must reflect the classifier's rules, not pretend to be machine-learning probabilities.

### Classification rules

1. An explicit `S01E02` filename is strong evidence of an episode.
2. An explicit season folder is strong evidence of a season.
3. Multiple numbered sibling episodes strengthen the series hypothesis.
4. A folder containing one full-length video is not automatically a series.
5. A folder named `1080p` is not a series title or season.
6. A movie stored inside its own directory must still be recognized as a movie where the evidence supports that.
7. Episode-only filenames must be interpreted using their parent directories and sibling files.
8. Ambiguous content should remain reviewable instead of being assigned a confidently incorrect classification.

### Manual correction

Provide a future-compatible mechanism for the user to:

- Change a movie into a series or vice versa
- Correct a series title
- Assign a season number
- Correct an episode number
- Group duplicate quality copies
- Exclude unwanted files

Persist corrections separately from inferred classifications so rescanning does not erase them.

---

## 8. Database Design

Use SQLite through `expo-sqlite`.

Design normalized tables with migrations, indexes, foreign keys where appropriate, and transactional updates.

### ScanRoot

Fields:

- `id`
- `displayName`
- `documentUri`
- `permissionPersisted`
- `lastSuccessfulScanAt`
- `createdAt`
- `updatedAt`

### MediaItem

Represents a physical playable file.

Fields:

- `id`
- `rootId`
- `documentUri`
- `relativePath`
- `fileName`
- `sizeBytes`
- `modifiedAt`
- `mimeType`
- `durationMs`
- `thumbnailPath`
- `contentFingerprint`
- `availabilityStatus`
- `lastScannedAt`
- `createdAt`
- `updatedAt`

Create indexes for root ID, relative path, and frequently queried metadata.

### LibraryEntry

Represents logical content displayed in the app.

Fields:

- `id`
- `title`
- `sortTitle`
- `kind`
- `parentId`
- `mediaItemId`, nullable
- `seasonNumber`, nullable
- `episodeNumber`, nullable
- `classificationSource`
- `confidence`
- `needsReview`
- `createdAt`
- `updatedAt`

Support the following hierarchy:

```text
Movie
  └── Media file

Series
  └── Season
      └── Episode
          └── One or more physical media versions
```

Do not force movies and series into the same simplistic parent-child assumptions if that makes the relationships ambiguous.

For episodes with duplicate quality versions, introduce an explicit episode-to-media association table if needed rather than relying on one `mediaItemId` field.

### PlaybackProgress

Fields:

- `mediaItemId`
- `positionMs`
- `durationMs`
- `completed`
- `lastPlayedAt`
- `updatedAt`

### Favorite

Fields:

- `libraryEntryId`
- `createdAt`

### SubtitleTrack

Fields:

- `id`
- `mediaItemId`
- `documentUri`, nullable
- `displayName`
- `languageCode`, nullable
- `isExternal`

### ClassificationOverride

Fields:

- `id`
- `targetRelativePath`
- `overrideKind`
- `overrideTitle`
- `parentOverridePath`, nullable
- `seasonNumber`, nullable
- `episodeNumber`, nullable
- `createdAt`
- `updatedAt`

### ScanState

Track:

- Scan ID
- Root ID
- Status
- Started and completed timestamps
- Directories visited
- Files discovered
- Files indexed
- Error count
- Last processed location
- Cancellation state

Add other tables only when justified.

### Database rules

- Use parameterized SQL statements.
- Use migrations.
- Use transactions for related updates.
- Never store entire movie files as SQLite blobs.
- Preserve watch history through normal rescans.
- Avoid duplicate records on repeated scans.
- Test database behavior on a real device.

---

## 9. Netflix-Style UI

Design a premium dark streaming interface.

### Design direction

- Black or near-black background
- Large cinematic artwork
- High-contrast white typography
- Subtle gray secondary text
- Consistent spacing and rounded cards
- Minimal but useful controls
- Smooth scrolling and responsive layouts
- Android status/navigation bar handling
- Proper loading, empty, and error states

Do not copy Netflix branding, logos, or proprietary assets. Create an original identity named WatchNow.

### Screens

#### A. First Launch

- App logo and title
- Short offline-library explanation
- `Select Movie Folder` button
- Permission status
- Empty-state illustration or icon

#### B. Home

Include:

- Featured movie or series
- Continue Watching
- Recently Added
- Movies
- Web Series
- My List
- Scan Library action

Only display sections that contain content.

#### C. Movie Details

Include:

- Poster or thumbnail
- Title
- Duration, if known
- File quality when known
- Play
- Resume
- Add to My List
- File information

#### D. Series Details

Include:

- Series artwork
- Series title
- Season selector
- Episode list
- Episode thumbnails when available
- Watched indicators
- Playback progress
- Resume or Play Next

#### E. Search

Search:

- Movies
- Series
- Episode titles
- Relevant filenames

Use debounced search and indexed database queries where appropriate.

#### F. Library Settings

Include:

- Selected root folder
- Rescan library
- Scan progress
- Change root folder
- Thumbnail-cache controls
- Classification review
- Storage and indexing statistics

### Reusable components

Implement reusable components such as:

```text
MovieCard
PosterCard
FeaturedHero
MediaCarousel
ContinueWatchingCard
SeasonSelector
EpisodeRow
PlaybackProgressBar
EmptyLibraryState
LibraryScanIndicator
SearchBar
```

Use TypeScript interfaces for all data passed between screens.

Avoid putting all application logic into one component.

---

## 10. Video Playback

Use `expo-video` or another compatible, maintained native playback solution.

Before implementation, verify its compatibility with the installed Expo SDK and Android build configuration.

### Requirements

- Local file playback
- Full-screen landscape mode
- Play and pause
- Seek bar
- Current time and duration
- Resume from saved position
- Periodic playback-progress persistence
- Save progress when pausing or leaving the player
- Watched-state detection
- Subtitle selection where supported
- Audio-track selection where supported
- Playback-speed controls where supported
- Graceful handling of unsupported codecs and corrupt files
- Correct cleanup of player resources
- Screen lifecycle handling
- Next Episode action for series

Do not claim that every MKV, AVI, or other container is playable. Container support and codec support are different.

Prefer passing Android content URIs to the player when required. If a particular player cannot consume a selected document URI directly, implement a carefully scoped solution and document its tradeoffs. Do not copy multi-gigabyte movies into app storage just to make playback work.

Save playback progress at reasonable intervals, not on every animation frame.

### Continue Watching rules

- Resume from the last saved position.
- Exclude completed items from Continue Watching.
- Use the associated episode/media relationships to find the next episode.
- Avoid autoplaying unrelated movies.
- Handle missing or deleted files gracefully.

---

## 11. Thumbnails and Artwork

Generate local video thumbnails when supported.

Requirements:

- Cache thumbnails separately from original files.
- Never modify the original movie files.
- Generate thumbnails lazily or in batches.
- Avoid extracting every thumbnail synchronously during startup.
- Handle extraction failures.
- Use a placeholder for videos without thumbnails.
- Do not rely on internet access.
- Avoid repeatedly regenerating unchanged thumbnails.

Poster images should be replaceable by locally stored artwork in a later iteration.

Do not introduce online metadata APIs as a required dependency.

---

## 12. Architecture and Project Structure

Use a modular structure similar to:

```text
offlineflix/
├── app/
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── search.tsx
│   ├── settings.tsx
│   ├── movie/
│   │   └── [id].tsx
│   ├── series/
│   │   └── [id].tsx
│   └── player/
│       └── [mediaId].tsx
├── src/
│   ├── components/
│   ├── features/
│   │   ├── library/
│   │   ├── scanner/
│   │   ├── classification/
│   │   ├── movies/
│   │   ├── series/
│   │   ├── playback/
│   │   └── search/
│   ├── db/
│   │   ├── database.ts
│   │   ├── migrations/
│   │   ├── repositories/
│   │   └── schema.ts
│   ├── native/
│   ├── hooks/
│   ├── types/
│   ├── utils/
│   └── theme/
├── assets/
├── android/
├── app.json
├── package.json
└── tsconfig.json
```

Adapt the structure to the actual Expo Router setup. Do not create redundant abstractions just to match this tree.

Separate:

- UI
- Data access
- Scanning
- Classification
- Playback
- Persistence
- Platform-specific code

---

## 13. Performance Requirements

Assume the library may contain hundreds or thousands of videos.

- Do not recursively scan on every screen render.
- Do not load every video thumbnail into memory.
- Do not execute long synchronous loops on the JavaScript thread.
- Use batched database writes.
- Use stable IDs for list items.
- Use `FlatList` or an appropriate virtualized list for large result sets.
- Cache parsed filenames and metadata.
- Avoid unnecessary React re-renders.
- Debounce search.
- Make scanning cancellable.
- Display progress while scanning.
- Reconcile database state safely after an interrupted scan.

Measure actual performance rather than assuming it is fast.

---

## 14. Security and Privacy

- Keep all media local.
- Do not upload video files, filenames, thumbnails, or viewing history.
- Do not add analytics that transmit viewing behavior.
- Request only the permissions necessary for selected-folder access and playback.
- Do not include unnecessary internet permissions or network dependencies.
- Keep native document URIs and file metadata inside the app unless needed by the user.
- Do not log private paths or media information unnecessarily.
- Handle invalid and inaccessible files safely.

The core media-library features must function without an internet connection after the app and its required components have been installed.

---

## 15. Testing Requirements

Create unit tests for the classification and parsing logic.

Test at least these fixtures:

### Fixture A — Standalone movies

```text
Movie/
├── Film A.mp4
└── Film B.mkv
```

Expected: two movies.

### Fixture B — Standard series

```text
Movie/
└── Panchayat/
    └── Season 1/
        ├── S01E01.mkv
        └── S01E02.mkv
```

Expected: one series, one season, two episodes.

### Fixture C — Nested technical directories

```text
Movie/
└── Show/
    └── 1080p/
        └── Season 2/
            └── Show.S02E03.mkv
```

Expected: the correct show, season 2, episode 3. `1080p` must not become a series or season.

### Fixture D — Flat episodes

```text
Movie/
└── Series X/
    ├── Episode 1.mp4
    ├── Episode 2.mp4
    └── Episode 3.mp4
```

Expected: a series with three ordered episodes, or a reviewable classification if the evidence is insufficient.

### Fixture E — Mixed nested layout

```text
Movie/
└── Series Y/
    ├── S01E01.mkv
    └── Season 2/
        └── Episode 02.mkv
```

Expected: one series with correctly organized episodes, including inherited season information where justified.

### Fixture F — Duplicate quality versions

```text
Movie/
└── Series Z/
    ├── 720p/
    │   └── S01E01.mp4
    └── 1080p/
        └── S01E01.mkv
```

Expected: two physical media files, with an optional grouping as alternate versions of one logical episode.

### Fixture G — Movie inside a folder

```text
Movie/
└── Interstellar/
    ├── Interstellar.mkv
    └── subtitles.srt
```

Expected: a movie, not automatically a series.

### Fixture H — Uncertain filenames

```text
Movie/
└── Unknown/
    ├── Part 1.mp4
    └── Part 2.mp4
```

Expected: no unjustified certainty. Preserve the files and provide a review mechanism.

Also test:

- Empty directories
- Unsupported extensions
- Unreadable folders
- Rescanning without duplicates
- Files deleted between scans
- Folder permission revocation
- Scan cancellation
- Database migrations
- Interrupted scans
- Playback-progress persistence
- Missing media during resume

Use synthetic file-tree fixtures for unit tests, then verify Android storage behavior on the actual device.

---

## 16. Development Workflow

Follow this exact sequence.

### Phase 1 — Environment verification

1. Inspect the WSL environment.
2. Verify Node.js, npm, Java, Android SDK, Gradle prerequisites, and ADB.
3. Identify missing components.
4. Make only necessary environment changes.
5. Confirm the Android phone is accessible.

### Phase 2 — Bootstrap

1. Create or inspect the Expo project.
2. Verify Expo SDK compatibility.
3. Install required packages.
4. Configure TypeScript and Expo Router.
5. Create a minimal working application.
6. Run Expo diagnostics.

### Phase 3 — First Android build

1. Run the native Android development build.
2. Install it on the connected phone.
3. Launch it.
4. Verify that it connects to Metro.
5. Fix actual build or runtime errors.

Do not move on while the project has a fundamental build failure.

### Phase 4 — Storage and scanner

1. Implement folder selection.
2. Persist permissions.
3. Recursively scan the directory.
4. Build file metadata records.
5. Implement scan progress and cancellation.
6. Verify scanning on the actual phone.

### Phase 5 — Database and classification

1. Create SQLite schema and migrations.
2. Implement repositories.
3. Implement filename parsing.
4. Implement the classification engine.
5. Add synthetic fixture tests.
6. Persist manual corrections.
7. Verify that rescans preserve progress and do not create duplicates.

### Phase 6 — Playback

1. Integrate the native player.
2. Play a selected local file.
3. Add playback progress.
4. Add resume playback.
5. Add series episode navigation.
6. Test subtitles and supported codecs.

### Phase 7 — Netflix-style interface

1. Implement the dark theme.
2. Build the home screen.
3. Add movie and series details.
4. Add season and episode views.
5. Add Continue Watching and My List.
6. Add search and library settings.
7. Improve loading, empty and error states.

### Phase 8 — Final verification

Run available checks, including:

```bash
npx tsc --noEmit
npx expo-doctor
npm test
```

Only run `npm test` if a test script has been configured. Run the actual build command and resolve meaningful errors.

Install and launch the final app on the Android phone.

---

## 17. Required Agent Behavior

You are an implementation agent, not just a code generator.

For each phase:

1. Inspect the existing files and environment.
2. Explain the next action briefly.
3. Implement the changes.
4. Run relevant checks.
5. Read and diagnose errors.
6. Fix errors and repeat the checks.
7. Summarize verified results.
8. Continue to the next phase when unblocked.

Do not replace working configuration without evidence that it is incorrect.

Do not invent terminal output, test results, successful builds, or device behavior.

Do not silently skip failing tests.

If an operation requires user interaction on the Android phone, explain exactly what to do, then continue once the operation can be verified.

If you discover an architectural limitation, choose the smallest reliable solution, document it, and proceed.

If a dependency is incompatible with the installed Expo SDK, identify the compatibility issue before selecting a replacement.

Do not introduce unnecessary backend services, accounts, cloud storage, subscriptions, or online movie catalogs.

Keep the first working version simple, stable, offline-first, and maintainable.

---

## 18. Definition of Done

The first production-oriented milestone is complete when:

- The app builds and installs on my actual Android phone.
- The user can select the existing `Movie` directory.
- The directory permission survives application restarts where Android permits it.
- The scanner finds videos in nested directories.
- Movies and series are organized using explainable classification rules.
- Uncertain classifications can be corrected.
- The media library is stored in SQLite.
- Rescanning does not create duplicates or reset watch history.
- A selected local video plays successfully.
- Playback progress can be saved and resumed.
- The home screen provides a polished dark streaming interface.
- The core experience does not depend on a media server or internet connection.
- TypeScript checks and relevant tests pass.
- The final Android build is verified on the connected device.

## 19. Start Now

Begin with Phase 1.

Inspect the current working directory and WSL Android development environment. Determine whether the project already exists and whether the connected phone is available.

Then bootstrap or reuse the project, build a minimal Expo development app, and verify that it launches on the phone.

After that, implement the application in the phase order described above.

**Prioritize working code, reliable Android storage access, accurate classification, and verified device builds over superficial UI polish.**