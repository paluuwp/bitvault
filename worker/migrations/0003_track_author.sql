-- 0003_track_author.sql
-- Необязательное поле трека «автор» (до 120 символов, лимит проверяется в API).
-- Существующие строки получают NULL; старые клиенты без поля продолжают работать.
-- Применение: wrangler d1 migrations apply bitvault-prod --local

ALTER TABLE tracks ADD COLUMN author TEXT;
