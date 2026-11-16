-- 0001_init.sql
-- Начальная схема BitVault API для Cloudflare D1.
-- Время хранится ISO 8601 UTC в TEXT, размеры и числа — в INTEGER/REAL.
-- Применение: wrangler d1 migrations apply bitvault-prod --local

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX idx_users_email ON users (email);

CREATE TABLE libraries (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_libraries_owner ON libraries (owner_user_id);

CREATE TABLE library_members (
  library_id TEXT NOT NULL REFERENCES libraries (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (library_id, user_id)
);

CREATE INDEX idx_library_members_user ON library_members (user_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  user_agent TEXT
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

CREATE TABLE files (
  id TEXT PRIMARY KEY NOT NULL,
  library_id TEXT NOT NULL REFERENCES libraries (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size INTEGER,
  original_name TEXT,
  sha256 TEXT,
  created_at TEXT,
  deleted_at TEXT
);

CREATE INDEX idx_files_library ON files (library_id);
CREATE INDEX idx_files_sha256 ON files (sha256);

CREATE TABLE tracks (
  id TEXT PRIMARY KEY NOT NULL,
  library_id TEXT NOT NULL REFERENCES libraries (id) ON DELETE CASCADE,
  name TEXT,
  name_lower TEXT,
  bpm REAL,
  musical_key TEXT,
  genre TEXT,
  tags_json TEXT,
  notes TEXT,
  color TEXT,
  is_favorite INTEGER DEFAULT 0,
  duration_sec REAL,
  play_count INTEGER DEFAULT 0,
  last_played_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  version INTEGER DEFAULT 1,
  deleted_at TEXT
);

CREATE INDEX idx_tracks_library_updated ON tracks (library_id, updated_at);
CREATE INDEX idx_tracks_library_deleted ON tracks (library_id, deleted_at);

CREATE TABLE track_attachments (
  track_id TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  position INTEGER,
  PRIMARY KEY (track_id, file_id)
);

CREATE INDEX idx_track_attachments_file ON track_attachments (file_id);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  library_id TEXT REFERENCES libraries (id) ON DELETE CASCADE,
  kind TEXT,
  r2_upload_id TEXT,
  r2_key TEXT,
  original_name TEXT,
  mime_type TEXT,
  size INTEGER,
  part_size INTEGER,
  status TEXT,
  created_at TEXT,
  expires_at TEXT
);

CREATE INDEX idx_uploads_user_status ON uploads (user_id, status);
CREATE INDEX idx_uploads_expires ON uploads (expires_at);

CREATE TABLE plays (
  id TEXT PRIMARY KEY NOT NULL,
  track_id TEXT REFERENCES tracks (id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  client_play_id TEXT,
  played_at TEXT,
  UNIQUE (user_id, client_play_id)
);

CREATE INDEX idx_plays_track_played ON plays (track_id, played_at);
CREATE INDEX idx_plays_user_played ON plays (user_id, played_at);

CREATE TABLE mutations (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_mutation_id TEXT NOT NULL,
  library_id TEXT REFERENCES libraries (id) ON DELETE CASCADE,
  result_json TEXT,
  created_at TEXT,
  PRIMARY KEY (user_id, client_mutation_id)
);

CREATE INDEX idx_mutations_library ON mutations (library_id);

CREATE TABLE shares (
  id TEXT PRIMARY KEY NOT NULL,
  library_id TEXT REFERENCES libraries (id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE,
  created_at TEXT,
  expires_at TEXT,
  revoked_at TEXT
);

CREATE INDEX idx_shares_library ON shares (library_id);

-- Fixed-window счётчики для rate limiting (например, вход по IP).
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

-- Очистка старых окон: DELETE ... WHERE window_start < ?.
CREATE INDEX idx_rate_limits_window ON rate_limits (window_start);
