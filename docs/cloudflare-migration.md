# Переход BitVault на серверное хранилище (Cloudflare)

Статус на 2026-11-16: **первая и вторая очереди задеплоены** (авторизация и
библиотека аккаунта). Ресурсы Cloudflare созданы
(D1 `bitvault-prod`, приватный R2 `bitvault-prod`, OAuth-клиент Google), Worker
`bitvault-api` опубликован по адресу `https://bitvault-api.bitvault-api.workers.dev`,
D1-миграции применены, секреты заданы. Клиент подключён к API: после входа
показывает библиотеку аккаунта — см. «Библиотека аккаунта».

Загрузка файлов переработана после первых живых испытаний: Worker пишет
тело запроса в R2 потоком, без буферизации в памяти (лимит памяти Workers
Free — 128 МБ; буферизация крупного mp3 приводила к сбросу соединения),
`Content-Length` обязателен, фактический размер сверяется после записи.
Клиент повторяет запросы при сетевом сбое или таймауте: обычные — до трёх
попыток, загрузка файла — одна повторная.

## Что решено

- Фронтенд остаётся статикой на GitHub Pages (`https://paluuwp.github.io/bitvault/`).
- API — отдельный Worker на `*.workers.dev` (позже можно свой домен), путь `/api/v1`.
- Файлы — в приватном бакете R2, метаданные — в D1, сессии — в D1.
- Вход — Google Identity Services + белый список e-mail. Паролей нет.
- Приложение остаётся local-first: IndexedDB — основное хранилище, сервер —
  синхронизация и резервная копия. Локальные данные никогда не уходят на сервер
  без явного действия пользователя (импорт ZIP или включение синхронизации).
- Клиент ходит в API только по HTTPS с Bearer-токеном; медиа отдаются по
  короткоживущим HMAC-ссылкам с поддержкой Range (перемотка в `<audio>`).

## Карта кода (по факту исследования)

- Сетевого слоя нет вообще: в `src` нет `fetch`, `axios`, `import.meta.env`
  или `VITE_*` — клиент API, модель пользователя и синхронизация пишутся с нуля.
- IndexedDB: `DB_NAME = 'bitvault'`, `DB_VERSION = 1`, сторы `tracks` и `files`,
  upgrade только «создать, если нет» — `src/lib/db.ts:12-48`.
- Репозитории — свободные функции без интерфейсов и внедрения зависимостей
  (`src/lib/repositories/tracks.ts`, `files.ts`), публичный фасад —
  `src/lib/index.ts:5-15`.
- Двоичные данные живут в `StoredFile.blob` (`src/types/models.ts:68-76`).
  `getFileUrl` читает blob и делает object URL (`src/lib/index.ts:36-50`);
  контракт `FileUrlHandle { url, revoke }` используют плеер, обложки, вложения
  и скачивание — это главный шов для перехода на сетевые URL.
- Плеер ставит object URL в `audio.src` (`src/context/PlayerContext.tsx:164-177`),
  поэтому сервер обязан поддерживать Range/`206` и CORS.
- Экспорт/импорт ZIP ходит в сторы напрямую и собирает архив целиком в памяти
  (`src/lib/exportImport.ts`).
- `navigator.storage` измеряет хранилище origin, а не R2 (`src/lib/storage.ts`).
- Тесты: 16 файлов, 142 теста; `src/lib/__tests__/db.test.ts:17` жёстко ждёт
  версию 1; 4 файла работают с fake-indexeddb.

## Действия владельца (по шагам)

### 1. Аккаунт Cloudflare

1. Зарегистрироваться на <https://dash.cloudflare.com> и включить двухфакторную
   аутентификацию (My Profile → Authentication).
2. Добавить платёжный профиль (карту) в Billing. R2 — платный сервис с
   бесплатным лимитом: без карты его обычно не включить. В пределах лимитов
   списаний нет, но карта должна быть привязана.
3. В разделе R2 → Enable R2. Создать бакет `bitvault-prod`, регион Automatic.
   **Не включать** публичный доступ (`r2.dev` / Public Development URL) — файлы
   должны отдаваться только через Worker.
4. В разделе Workers & Pages → D1 → Create database: `bitvault-prod`.
5. Для R2 включить правило жизненного цикла: прерывать незавершённые
   multipart-загрузки через 7 дней (R2 → bucket → Settings → Object lifecycle).

### 2. API-токен для деплоя

My Profile → API Tokens → Create Token → Custom token:

- Permissions: `Workers Scripts:Edit`, `D1:Edit`, `R2:Edit` (для бакета
  `bitvault-prod`), `Account Settings:Read`.
- Account Resources: только ваш аккаунт.

Сохранить токен и Account ID (в правой панели dashboard). Токен никому не
пересылать и не вставлять в чат/репозиторий.

### 3. Google OAuth (вход)

1. <https://console.cloud.google.com> → новый проект, например `bitvault`.
2. APIs & Services → OAuth consent screen: External, заполнить название,
   e-mail поддержки. Тип приложения — Web application.
3. Credentials → Create credentials → OAuth client ID → Web application.
   Authorized JavaScript origins:
   - `https://paluuwp.github.io`
   - `http://localhost:5173`
   Redirect URI не нужен (Google Identity Services возвращает ID-токен
   напрямую).
4. Сохранить Client ID. Это публичное значение, оно попадёт в сборку
   фронтенда. Client secret не нужен.
5. Пока приложение в статусе Testing, войти смогут только добавленные test
   users. Для друзей — либо добавить их туда, либо опубликовать приложение
   (Publish app); доступ всё равно ограничит белый список на сервере.

### 4. Секреты Worker (не в репозитории)

Задать через `wrangler secret put` или dashboard (Workers → bitvault-api →
Settings → Variables):

- `GOOGLE_CLIENT_ID` — Client ID из шага 3 (публичное значение, сейчас задан
  обычной переменной в `wrangler.jsonc`).
- `ALLOWED_EMAILS` — список разрешённых e-mail через запятую (ваш, позже друзья).
- `MEDIA_TOKEN_SECRET` — случайная строка ≥32 байт (например,
  `openssl rand -base64 48`).

Обычные переменные: `PUBLIC_ORIGINS=https://paluuwp.github.io,http://localhost:5173`.

### 5. GitHub (репозиторий paluuwp/bitvault)

Settings → Secrets and variables → Actions:

- Secrets: `CLOUDFLARE_API_TOKEN` (шаг 2), `CLOUDFLARE_ACCOUNT_ID`.
- Variables: `VITE_GOOGLE_CLIENT_ID`, `VITE_API_URL` (URL Worker после первого
  деплоя), `VITE_STORAGE_MODE` (`local` до готовности сервера, затем `remote`).

Секреты Cloudflare и Google client secret в клиентскую сборку не попадают:
во фронтенде допустимы только публичные `VITE_*` (URL API, Client ID).

### 6. После первого деплоя Worker

1. Прислать мне URL Worker — я впишу его в `VITE_API_URL` и CORS.
2. Прогнать миграции D1: dev → проверка → prod (команду дам, prod-миграции
   только с вашего подтверждения).
3. Проверить вход своим Google-аккаунтом, загрузку трека, перемотку,
   удаление, повторный вход.
4. Сделать экспорт D1 (backup) перед включением синхронизации.

## Что делаю я (после ваших шагов)

1. ~~Контракт API и схема D1 (миграции), Worker-скелет на Hono-совместимом
   роутере, health-check.~~ Готово в `worker/`, см. ниже.
2. ~~Авторизация Google ID-токена (проверка подписи, `aud`, срока; allowlist),
   сессии в D1, `/auth/me`, `/auth/logout`.~~ Готово, кроме деплоя.
3. Файлы: multipart 8 МБ, лимиты, проверка владельца, медиа-токены, Range.
4. Клиент: `RemoteApi`, `StorageAdapter`/`SyncedAdapter`, IndexedDB v2
   (`fileMeta`, `outbox`, `syncMeta`), миграция существующих данных.
5. Тесты: unit для Worker (Vitest в node-окружении с in-memory Store),
   интеграционные для адаптера, e2e-сценарий входа/загрузки; QA-ревью по
   диффу.
6. CI: workflow проверок (lint/test/build + worker typecheck/test) и отдельный
   workflow деплоя Worker; фронтенд-деплой не ломаем.

## Что уже сделано в коде (2026-11-16)

- `worker/` — отдельный npm-проект (Hono, jose, wrangler, TypeScript strict,
  Vitest). Конфиг `wrangler.jsonc`, миграция `migrations/0001_init.sql`
  (12 таблиц, включая `rate_limits`; PK объявлены `NOT NULL`, есть индекс по
  окну rate limit).
- Реализовано: `GET /api/v1/health`, `GET /health/ready`,
  `POST /auth/google`, `GET /auth/me`, `POST /auth/logout`,
  `POST /auth/logout-all`; CORS по точному origin, единый конверт ошибок.
- Защита входа: body limit 16 КиБ, обязательный JSON, rate limit 10 попыток
  в минуту на IP (fixed window в D1), allowlist fail-closed, сессии с
  SHA-256-хешем, TTL 30 дней, ≤20 сессий на пользователя, `no-store`.
- Проверено локально: `npm run typecheck`, 78 тестов worker (MemoryStore,
  без сети), миграция на локальной D1 (30 команд), SQL-smoke для upsert
  пользователя, fixed-window счётчика и его очистки, pruning сессий,
  NOT NULL на PK и индекса окна rate limit.
- Корневые проверки не сломаны: lint, 142 теста, production build.
- `database_id` реальной D1 `bitvault-prod` вписан в `wrangler.jsonc`;
  remote-миграции и деплой выполнены (см. ниже).
- Не сделано: реальный вход через Google с фронтенда, R2-загрузки, медиа,
  клиентский сетевой слой, интеграционные тесты `D1Store` (SQL проверен
  вручную на локальной и на remote D1, но не в CI). CI-workflow для фронтенда
  и worker добавлен.

## Состояние деплоя (2026-11-16)

- Worker: `https://bitvault-api.bitvault-api.workers.dev`, версия
  `d869c32b-9c11-4f2e-b11a-05672940640e` (2026-11-16, включает `expiresAt`
  в `/auth/me`; предыдущая — `f9e216e5-3767-4b98-921b-1242d47d414e`).
- workers.dev subdomain аккаунта — `bitvault-api` (поэтому имя в URL
  повторяется; при желании subdomain можно переименовать, но тогда меняется
  URL и `VITE_API_URL`).
- Remote-миграция D1 `bitvault-prod`: 30 команд, 12 таблиц.
- Секреты Worker: `ALLOWED_EMAILS`, `MEDIA_TOKEN_SECRET` (заданы в dashboard,
  значения нигде в репозитории/чате не хранятся). `GOOGLE_CLIENT_ID` и
  `PUBLIC_ORIGINS` — обычные переменные в `wrangler.jsonc`.
- Проверки на живом Worker (повторены после передеплоя 2026-11-16):
  `/api/v1/health` → 200, `/api/v1/health/ready` → 200 (D1 доступна), preflight
  CORS с `https://paluuwp.github.io` → 204, `/auth/me` без токена → 401 с
  `Cache-Control: no-store`, заведомо неверный Google-токен → 401
  `UNAUTHORIZED` (JWKS Google с Worker доступен).
- Не проверено: успешный вход реальным Google-аккаунтом (нужен фронтенд с
  Google Identity Services) и всё, что за ним (сессии в проде, `expiresAt`
  в ответе `/auth/me`, файлы).

## Вход на фронтенде (2026-11-16)

- В левом меню появился блок «Аккаунт» (кнопка «Войти» над «Настройки»),
  диалог аккаунта с Google-кнопкой, профилем, списком библиотек и выходом.
- Клиентский слой: `src/lib/config.ts` (публичные `VITE_API_URL`,
  `VITE_GOOGLE_CLIENT_ID` с дефолтами), `src/lib/api/*` (RemoteApi, разбор
  конверта ошибок, таймауты), `src/lib/auth/session.ts` (сессия в
  `localStorage`, ключ `bv.auth.session`, TTL-проверка), `src/lib/auth/google.ts`
  (ленивая загрузка GIS), `src/context/AuthContext.tsx`.
- Local-first сохранён: при старте нет ни одного сетевого запроса; GIS грузится
  только при открытии диалога, `/auth/me` — при открытии диалога или по кнопке
  «Обновить данные».
- Проверено: 271 тест (из них 129 новых), lint, typecheck, production build;
  живая проверка в браузере — ноль запросов при старте, загрузка GIS только
  после нажатия «Войти».
- Срок сессии: `/auth/me` теперь возвращает `expiresAt` (актуальный серверный
  срок с учётом продления раз в сутки), клиент применяет его при обновлении
  данных; если поле отсутствует (старый Worker) — сохраняется прежний срок.
  Изменение Worker-контракта аддитивное; Worker передеплоен 2026-11-16
  (версия `d869c32b-…`), поле доступно в проде. Worker-проверки: typecheck,
  82 теста.
- Не проверено: реальный вход Google-аккаунтом (нужен аккаунт из
  `ALLOWED_EMAILS` и разрешённый origin в Google Console), работа на прод-origin
  GitHub Pages, визуальная проверка на мобильном.
- Переменные GitHub Actions (Variables, не Secrets): `VITE_API_URL`,
  `VITE_GOOGLE_CLIENT_ID` — необязательны, без них сборка использует публичные
  дефолты. `deploy.yml` передаёт их в `npm run build`.

## Библиотека аккаунта (2026-11-16)

- Worker: `GET/PUT/DELETE /libraries/:libraryId/tracks…`,
  `PUT /libraries/:libraryId/files/:fileId?kind=&name=`,
  `GET …/files/:fileId/url`, `GET /media/:fileId?exp=&sig=` (HMAC,
  TTL 1 час, Range). Миграция `0002_track_files.sql` добавляет
  `tracks.audio_file_id`/`cover_file_id`. Файлы — в приватном R2.
- Клиент: `src/lib/cloud.ts` — треки аккаунта кэшируются в тех же
  IndexedDB-хранилищах с пометкой `source: 'cloud'`; список объединяет
  локальные и облачные треки. Файлы стримятся по подписанной ссылке и
  кэшируются после первого скачивания; при сбое сети показывается кэш.
  Новые треки при активном входе сразу уходят на сервер; локальные
  переносятся по кнопке в баннере над библиотекой. Выход удаляет облачный
  кэш с устройства.
- Проверено: корень — lint, typecheck, 288 тестов (17 cloud-тестов),
  production build; worker — typecheck, 110 тестов (28 новых), локальная
  миграция `0002` на D1-эмуляторе и SQL smoke на SQLite; приложение
  открывается в браузере без ошибок в консоли (анонимный режим).
- Задеплоено 2026-11-16 с подтверждения владельца: remote-миграция `0002`
  применена к `bitvault-prod` (колонки `audio_file_id`/`cover_file_id` и
  индекс `idx_tracks_library_id` проверены SQL-запросом), Worker передеплоен
  (версия `bd4eb68e-348b-41ad-8257-bc8246547988`). Smoke-тесты прода:
  `/health` и `/health/ready` → 200, библиотечные маршруты и `/media/*` без
  токена/подписи → 401, preflight `PUT` с origin GitHub Pages → 204 с
  `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`.
- Не проверено на проде: реальный вход Google-аккаунтом из
  `ALLOWED_EMAILS`, загрузка файла в R2 и воспроизведение по подписанной
  ссылке — для этого нужно войти в аккаунт в браузере.
- 2026-11-16 по подтверждению владельца передеплоен Worker с потоковой
  загрузкой (версия `3055b6c1-744f-43e5-a7c6-056f42a1f094`): первая живая
  попытка загрузить mp3 обрывалась (`net::ERR_CONNECTION_RESET` через ~29 с),
  потому что Worker читал тело запроса в память. Smoke после деплоя: `/health`
  и `/health/ready` → 200, preflight `PUT` → 204, `/libraries/*` и `/media/*`
  без токена/подписи → 401. Не проверено: загрузка файла из браузера под
  аккаунтом (`Content-Length` отправляется браузером, локально в workerd
  файл 50 МБ загружается).

## Лимиты бесплатного тарифа (проверено 2026-11-16)

- R2: 10 ГБ-мес хранения, 1 млн Class A и 10 млн Class B операций в месяц,
  egress бесплатный. Нужен платёжный профиль.
- Workers Free: 100 000 запросов/день, 10 мс CPU на запрос, тело запроса
  до 100 МБ, потоковый ответ без лимита размера.
- D1 Free: 5 млн строк чтения и 100 000 строк записи в день, 500 МБ на базу,
  5 ГБ на аккаунт, Time Travel 7 дней.

Мониторинг: dashboard → Workers/D1/R2 → Metrics. При росте — Workers Paid
($5/мес) снимает дневные лимиты D1 и повышает CPU.

## Открытые решения

- Вход только через Google (рекомендовано) или ещё magic-link по e-mail.
- Одна личная библиотека на пользователя сейчас; общие библиотеки и публичные
  ссылки — отдельным этапом.
- Лимит хранилища на пользователя (например, 2 ГБ) — обсуждаемо.
- Публичный домен для API: пока `workers.dev`, позже можно `api.…`.
- Офлайн: облачные треки, уже скачанные на устройство, играют из кэша;
  не скачанные требуют сети, локальные — работают как раньше.
