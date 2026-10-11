export type Migration = { version: number; sql: string };

const V1 = `
CREATE TABLE scan_root (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  document_uri TEXT NOT NULL UNIQUE,
  permission_persisted INTEGER NOT NULL DEFAULT 1,
  last_successful_scan_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE media_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root_id INTEGER NOT NULL REFERENCES scan_root(id),
  document_uri TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size_bytes INTEGER,
  modified_at INTEGER,
  mime_type TEXT,
  duration_ms INTEGER,
  thumbnail_path TEXT,
  content_fingerprint TEXT,
  availability_status TEXT NOT NULL DEFAULT 'available',
  last_scanned_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_media_root_path ON media_item(root_id, relative_path);
CREATE INDEX idx_media_name_size ON media_item(file_name, size_bytes);
CREATE INDEX idx_media_status ON media_item(root_id, availability_status);

CREATE TABLE library_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  sort_title TEXT NOT NULL,
  kind TEXT NOT NULL,
  parent_id INTEGER REFERENCES library_entry(id),
  media_item_id INTEGER REFERENCES media_item(id),
  season_number INTEGER,
  episode_number INTEGER,
  classification_source TEXT NOT NULL,
  confidence REAL NOT NULL,
  needs_review INTEGER NOT NULL DEFAULT 0,
  relative_path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_entry_parent ON library_entry(parent_id);
CREATE INDEX idx_entry_kind ON library_entry(kind, sort_title);
CREATE INDEX idx_entry_review ON library_entry(needs_review);

CREATE TABLE episode_media (
  episode_entry_id INTEGER NOT NULL REFERENCES library_entry(id),
  media_item_id INTEGER NOT NULL REFERENCES media_item(id),
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (episode_entry_id, media_item_id)
);

CREATE TABLE playback_progress (
  media_item_id INTEGER PRIMARY KEY REFERENCES media_item(id),
  position_ms INTEGER NOT NULL,
  duration_ms INTEGER,
  completed INTEGER NOT NULL DEFAULT 0,
  last_played_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE favorite (
  library_entry_id INTEGER PRIMARY KEY REFERENCES library_entry(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE subtitle_track (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_item_id INTEGER NOT NULL REFERENCES media_item(id),
  document_uri TEXT,
  display_name TEXT NOT NULL,
  language_code TEXT,
  is_external INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_subtitle_media ON subtitle_track(media_item_id);

CREATE TABLE classification_override (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_relative_path TEXT NOT NULL UNIQUE,
  override_kind TEXT,
  override_title TEXT,
  parent_override_path TEXT,
  season_number INTEGER,
  episode_number INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE scan_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root_id INTEGER NOT NULL REFERENCES scan_root(id),
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  directories_visited INTEGER NOT NULL DEFAULT 0,
  files_discovered INTEGER NOT NULL DEFAULT 0,
  files_indexed INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_processed_path TEXT,
  cancelled INTEGER NOT NULL DEFAULT 0
);
`;

const V2 = `
ALTER TABLE media_item ADD COLUMN poster_url TEXT;
ALTER TABLE media_item ADD COLUMN poster_source TEXT;
ALTER TABLE media_item ADD COLUMN metadata_attempted INTEGER NOT NULL DEFAULT 0;

ALTER TABLE library_entry ADD COLUMN poster_url TEXT;
ALTER TABLE library_entry ADD COLUMN poster_source TEXT;
ALTER TABLE library_entry ADD COLUMN metadata_attempted INTEGER NOT NULL DEFAULT 0;

CREATE TABLE app_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const V3 = `
UPDATE media_item SET thumbnail_path = NULL;
`;

const V4 = `
CREATE TABLE youtube_playlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  channel_title TEXT,
  thumbnail_url TEXT,
  video_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  synced_at INTEGER
);

CREATE TABLE youtube_video (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES youtube_playlist(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  position INTEGER NOT NULL,
  position_ms INTEGER,
  completed INTEGER NOT NULL DEFAULT 0,
  last_played_at INTEGER,
  UNIQUE (playlist_id, video_id)
);
CREATE INDEX idx_youtube_video_playlist ON youtube_video(playlist_id, position);
`;

export const MIGRATIONS: Migration[] = [
  { version: 1, sql: V1 },
  { version: 2, sql: V2 },
  { version: 3, sql: V3 },
  { version: 4, sql: V4 },
];
