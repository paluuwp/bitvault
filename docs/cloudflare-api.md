# BitVault API — контракт v1

Черновик контракта для Worker API (`/api/v1`). Источник истины по схеме —
миграции D1 в `worker/migrations/`. Реализованы: health, авторизация Google,
сессии, `/auth/me`, выход, библиотека аккаунта (треки, файлы, медиа-стриминг).
Публичные ссылки — план следующих очередей.

## Общие правила

- Базовый путь: `https://<worker-host>/api/v1`. Все ответы — JSON
  (`Content-Type: application/json`), кроме медиа-стриминга; исключения без
  тела — `204` у `/auth/logout`, `/auth/logout-all` и preflight `OPTIONS`.
- Аутентификация: `Authorization: Bearer <session_token>` для всех
  эндпоинтов, кроме `/health`, `/auth/google` и `/media/*` (там HMAC-токен
  в query).
- CORS: только точные origin из `PUBLIC_ORIGINS` (по умолчанию
  `https://paluuwp.github.io,http://localhost:5173`). Разрешённые заголовки:
  `Authorization`, `Content-Type`. Ответ на preflight — 204, без wildcard.
- Ошибки — единый конверт:
  ```json
  { "error": { "code": "EMAIL_NOT_ALLOWED", "message": "..." } }
  ```
  Коды: `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `EMAIL_NOT_ALLOWED` (403),
  `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409),
  `PAYLOAD_TOO_LARGE` (413), `RATE_LIMITED` (429), `INTERNAL` (500),
  `UNAVAILABLE` (503).
- Время — ISO 8601 UTC. Размеры — байты. ID — строки (UUID или
  `^[A-Za-z0-9_-]{1,128}$` для файлов из ZIP-импорта).
- Запись треков — upsert по клиентскому id (`PUT`), идемпотентна по
  построению; конфликтов версий нет, действует last-write-wins (клиент
  присылает свои `createdAt`/`updatedAt`).
- Секреты (`GOOGLE_CLIENT_ID` не секрет, `MEDIA_TOKEN_SECRET`,
  `ALLOWED_EMAILS`) живут только в Worker; в клиентскую сборку попадает лишь
  URL API и публичный Google Client ID.

## Авторизация

### POST /auth/google

```json
{ "credential": "<Google ID token из GIS>" }
```

Сервер проверяет подпись по JWKS Google, `iss` (`accounts.google.com`),
`aud` = `GOOGLE_CLIENT_ID`, срок действия, `email_verified = true`, затем
сверяет e-mail с `ALLOWED_EMAILS` (список через запятую, регистр не важен).

Требования к запросу: `Content-Type: application/json`, тело не больше
16 КиБ, `credential` не длиннее 8192 символов. Не чаще 10 попыток входа
в минуту с одного IP (`CF-Connecting-IP`); лишние — 429 `RATE_LIMITED`.
Ответы авторизации отдаются с `Cache-Control: no-store`.

Ответ 200:

```json
{
  "token": "<opaque session token>",
  "expiresAt": "2026-12-16T10:00:00.000Z",
  "user": { "id": "...", "email": "...", "name": "...", "picture": "..." },
  "libraries": [{ "id": "...", "name": "Моя библиотека", "role": "owner" }]
}
```

При первом входе создаётся пользователь и личная библиотека (роль `owner`).
Ошибки: 400 `BAD_REQUEST` (нет credential, чужой Content-Type или слишком
длинный credential), 401 `UNAUTHORIZED` (неверный токен), 403
`EMAIL_NOT_ALLOWED`, 413 `PAYLOAD_TOO_LARGE` (тело больше 16 КиБ), 429
`RATE_LIMITED`, 500 `INTERNAL`, 503 `UNAVAILABLE` (не настроен
`GOOGLE_CLIENT_ID` или недоступны ключи Google).

### GET /auth/me

Ответ 200:

```json
{
  "user": { "id": "...", "email": "...", "name": "...", "picture": "..." },
  "libraries": [{ "id": "...", "name": "Моя библиотека", "role": "owner" }],
  "expiresAt": "2026-12-16T10:00:00.000Z"
}
```

`expiresAt` — актуальный серверный срок сессии: он учитывает продление
`expires_at` (не чаще раза в сутки), поэтому может быть больше срока,
полученного при входе. Клиенту следует обновлять локальный срок по этому
полю. 401 — сессии нет или истекла.

### POST /auth/logout

Удаляет текущую сессию. Ответ 204.

### POST /auth/logout-all

Удаляет все сессии пользователя. Ответ 204.

Сессии: случайные 32 байта (base64url, 43 символа), в D1 хранится только
SHA-256 хеш. Срок — 30 дней; продлевается при любом авторизованном запросе
не чаще раза в сутки (сдвиг `expires_at`). Отзыв — удаление строки. На
пользователя хранится не больше 20 сессий: при входе более старые
вытесняются, истёкшие удаляются оппортунистически.

## Health

### GET /health

Без авторизации. Ответ 200: `{ "ok": true, "version": "1" }`. Используется
деплоем и мониторингом.

### GET /health/ready

Без авторизации. Дешёвая проверка D1 (`SELECT 1`): 200 `{ "ok": true }`
или 503 `{ "ok": false }`, если база недоступна.

## Библиотека аккаунта

Все эндпоинты требуют Bearer-сессию. Членство проверяется по
`library_members`: нет библиотеки или членства — 404 (существование чужой
библиотеки не раскрывается); роль `viewer` при записи — 403. Роли `owner` и
`editor` могут писать. ID треков и файлов генерирует клиент
(`^[A-Za-z0-9_-]{1,128}$`); upsert по ID.

### GET /libraries/:libraryId/tracks

Ответ 200:

```json
{
  "library": { "id": "...", "name": "Моя библиотека", "role": "owner" },
  "tracks": [
    {
      "id": "...", "name": "Beat", "bpm": 140, "musicalKey": "Am",
      "genre": "Trap", "tags": ["dark"], "notes": "", "color": "#8B5CF6",
      "isFavorite": false, "durationSec": 120,
      "createdAt": "...", "updatedAt": "...",
      "lastPlayedAt": null, "playCount": 0,
      "audioFile": { "id": "...", "kind": "audio", "name": "beat.wav",
                     "mimeType": "audio/wav", "size": 123 },
      "coverFile": null,
      "attachments": []
    }
  ]
}
```

Удалённые треки (мягкое удаление) в список не попадают.

### PUT /libraries/:libraryId/tracks/:trackId

Тело — JSON трека: `name`, `bpm`, `musicalKey`, `genre`, `tags`, `notes`,
`color`, `isFavorite`, `durationSec`, `createdAt`, `updatedAt`,
`audioFileId`, `coverFileId`, `attachmentFileIds`. Ограничения: имя 1–100,
BPM 20–400 целое, жанр ≤40, теги ≤10 по ≤24, заметки ≤2000, вложений ≤50,
цвет — из палитры приложения, тело ≤64 КиБ. Все переданные файлы должны уже
лежать в этой библиотеке, иначе 400. Ответ 200 — сохранённый трек в формате
элемента списка. Трек с тем же id в другой библиотеке — 409.

### DELETE /libraries/:libraryId/tracks/:trackId

Мягкое удаление (`deleted_at`). Ответ 204.

### PUT /libraries/:libraryId/files/:fileId?kind=&name=

Тело — сырые байты файла, `Content-Type` — MIME файла, `kind` — `audio`,
`cover` или `attachment`, `name` — исходное имя. Лимиты: аудио и вложение
≤90 МиБ (ограничение тела Worker), обложка ≤10 МиБ; пустое тело — 400.
Файл кладётся в приватный R2 (`libraries/<libraryId>/files/<fileId>`),
имя хранится только в D1. Ответ 200 — `{ id, kind, name, mimeType, size }`.
Файл с тем же id в другой библиотеке — 409.

### GET /libraries/:libraryId/files/:fileId/url

Ответ 200:

```json
{
  "url": "https://<worker-host>/api/v1/media/<fileId>?exp=<unix>&sig=<hex>",
  "expiresAt": "2026-11-16T11:00:00.000Z",
  "file": { "id": "...", "kind": "audio", "name": "beat.wav",
            "mimeType": "audio/wav", "size": 123 }
}
```

Подпись — HMAC-SHA256 от `<fileId>|<exp>` секретом `MEDIA_TOKEN_SECRET`,
TTL 1 час. Если секрет не задан — 503 `UNAVAILABLE`.

### GET /media/:fileId?exp=&sig=

Без Bearer: доступ подтверждается подписью и сроком. Поток из R2 с
`Accept-Ranges: bytes`, одиночный `Range` → 206 и `Content-Range`;
недостижимый диапазон → 416, синтаксически неверный или множественный
`Range` игнорируется и отдаётся полный файл. Просроченная или неверная
подпись — 401, файл не найден — 404. `Cache-Control: private, max-age=3600`,
`X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src
'none'; sandbox`; вложения отдаются с `Content-Disposition: attachment`.

## План следующих очередей (формы уточняются при реализации)

### Синхронизация и прослушивания

- `GET /tracks?since=<ISO>&limit=<n>&cursor=<opaque>` — дельта-выборка.
- `POST /tracks/:id/plays` — `{ "playId": "<uuid>", "playedAt": "<ISO>" }`.
- `POST /tracks/:id/favorite` — переключение избранного.

### Файлы и загрузка (докачка частями)

- `POST /files/uploads` и части по 8 МиБ — для файлов больше лимита тела
  Worker (~100 МБ).

### Публичные ссылки (позже)

- `POST /shares`, `DELETE /shares/:id`, `GET /public/:shareToken` — только
  для явно опубликованных библиотек; выключено по умолчанию.

## Схема D1 (обзор; истина — миграции)

- `users(id, google_sub UNIQUE, email, name, picture, created_at,
  last_seen_at)` — `email` намеренно не UNIQUE: уникален только Google
  subject, e-mail при повторном входе обновляется.
- `libraries(id, owner_user_id, name, created_at, updated_at, version)`.
- `library_members(library_id, user_id, role, created_at)` — PK
  `(library_id, user_id)`.
- `sessions(id, user_id, token_hash UNIQUE, created_at, expires_at,
  last_used_at, user_agent)`.
- `tracks(id, library_id, name, name_lower, bpm, musical_key, genre,
  tags_json, notes, color, is_favorite, duration_sec, play_count,
  last_played_at, created_at, updated_at, version, deleted_at,
  audio_file_id, cover_file_id)` — индекс `(library_id, updated_at)`;
  миграция `0002_track_files.sql`.
- `track_attachments(track_id, file_id, position)` — PK `(track_id, file_id)`.
- `files(id, library_id, kind, r2_key UNIQUE, mime_type, size, original_name,
  sha256, created_at, deleted_at)`.
- `uploads(id, user_id, library_id, kind, r2_upload_id, r2_key, original_name,
  mime_type, size, part_size, status, created_at, expires_at)`.
- `plays(id, track_id, user_id, client_play_id, played_at)` — UNIQUE
  `(user_id, client_play_id)`.
- `mutations(user_id, client_mutation_id, library_id, result_json, created_at)`
  — PK `(user_id, client_mutation_id)`.
- `shares(id, library_id, token_hash UNIQUE, created_at, expires_at,
  revoked_at)`.
- `rate_limits(key, window_start, count)` — fixed-window счётчики
  (например, вход по IP); PK `key`, окна старше часа удаляются при входе.

## Безопасность

- Белый список e-mail проверяется на сервере при каждом входе; клиентская
  проверка не считается защитой.
- Сессионный токен — только в памяти/`localStorage` клиента; в D1 — хеш.
- Проверка владельца для каждого трека/файла через `library_members`.
- Никаких публичных URL R2; бакет приватный, доступ только через Worker.
- Логи не содержат токенов, credential и e-mail в открытом виде (только
  хеш/ID пользователя).
