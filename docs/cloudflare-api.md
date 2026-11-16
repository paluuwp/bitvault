# BitVault API — контракт v1

Черновик контракта для Worker API (`/api/v1`). Источник истины по схеме —
миграции D1 в `worker/migrations/`. Реализация первой очереди: health,
авторизация Google, сессии, `/auth/me`, выход. Остальные разделы — план,
эндпоинты появятся следующими очередями.

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
- Запись-операции принимают `clientMutationId` (строка, уникальная в рамках
  пользователя) и идемпотентны: повтор с тем же ID возвращает прежний
  результат, а не создаёт дубль.
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

## План следующих очередей (формы уточняются при реализации)

### Библиотека и треки

- `GET /library` — библиотека текущего пользователя и счётчики.
- `GET /tracks?since=<ISO>&limit=<n>&cursor=<opaque>` — дельта-выборка,
  включая удалённые (`deletedAt`) для клиентского tombstone.
- `POST /tracks` — создать (с `clientMutationId`).
- `GET /tracks/:id`, `PATCH /tracks/:id` (с `version` для оптимистичной
  блокировки, 409 при расхождении), `DELETE /tracks/:id` (мягкое удаление).
- `POST /tracks/:id/plays` — `{ "playId": "<uuid>", "playedAt": "<ISO>" }`.
- `POST /tracks/:id/favorite` — переключение избранного.

### Файлы и загрузка

- `POST /files/uploads` — начать загрузку:
  `{ kind, originalName, mimeType, size, clientMutationId }` →
  `{ uploadId, partSize, uploadUrl?: ... }`.
- `PUT /files/uploads/:uploadId/parts/:partNumber` — тело — часть 8 МиБ.
- `POST /files/uploads/:uploadId/complete` — завершить, получить `fileId`.
- `DELETE /files/uploads/:uploadId` — отменить.
- `GET /files/:id` — метаданные, `DELETE /files/:id` — удалить (только
  неиспользуемый файл).
- Правила: аудио ≤250 МБ, обложка ≤10 МБ, вложение ≤250 МБ, 50 вложений на
  трек; MIME проверяется по расширению из белого списка.

### Медиа-стриминг

- `GET /media/:fileId?token=<hmac>` — поток из R2, поддержка `Range`
  (`206 Partial Content`, `Content-Range`), `Cache-Control: private,
  max-age=3600`. Токен — HMAC-SHA256 от `fileId|userId|exp`, TTL 1 час.
- Токен выдаётся в ответах, где клиенту нужен URL (трек, обложка,
  вложение). Просроченный токен — 401; клиент запрашивает новый через API.

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
  last_played_at, created_at, updated_at, version, deleted_at)` —
  индекс `(library_id, updated_at)`.
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
