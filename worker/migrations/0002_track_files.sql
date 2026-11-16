-- 0002_track_files.sql
-- Связь треков с файлами библиотеки (аудио и обложка) и индекс для выборки
-- треков по библиотеке. Файлы хранятся в приватном R2, здесь — только метаданные.
-- Применение: wrangler d1 migrations apply bitvault-prod --local

ALTER TABLE tracks ADD COLUMN audio_file_id TEXT;
ALTER TABLE tracks ADD COLUMN cover_file_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tracks_library_id ON tracks (library_id, id);
