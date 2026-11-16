# BitVault API (Cloudflare Worker)

Изолированный Worker API для BitVault. Первая очередь: health, вход через
Google, серверные сессии в D1, `/auth/me`, выход. Контракт —
`../docs/cloudflare-api.md`, схема — `migrations/0001_init.sql`.

Фронтенд (`../src`) этот каталог не использует; сборка и зависимости
корневого проекта не затрагиваются.

## Стек

- [Hono](https://hono.dev) — роутинг и middleware.
- [jose](https://github.com/panva/jose) — проверка Google ID-токена по JWKS.
- Cloudflare D1 (сессии, пользователи, библиотеки) и R2 (binding `BUCKET`,
  пока не используется).
- TypeScript (strict, без DOM lib), Vitest (node environment), Wrangler.

## Требования

- Node.js >= 22, npm.
- Аккаунт Cloudflare и `wrangler login` — только для деплоя и remote-команд.
  Локальные миграции и тесты работают без аккаунта.

## Установка

```bash
cd worker
npm install
```

Lockfile (`package-lock.json`) создаётся `npm install` и должен быть
закоммичен вместе с `package.json`.

## Конфигурация

`wrangler.jsonc` уже указывает на реальные ресурсы владельца:

1. D1 `bitvault-prod` — `database_id` вписан (ID не секрет).
2. R2 `bitvault-prod` — имя в binding `BUCKET`; бакет должен быть приватным.
3. Секреты и переменные для локальной разработки — в `worker/.dev.vars`
   (шаблон: `.dev.vars.example`; файл не коммитится):
   - `GOOGLE_CLIENT_ID` — публичный OAuth Client ID, он же audience токена;
   - `ALLOWED_EMAILS` — белый список e-mail через запятую (регистр не важен);
     пустой список запрещает вход всем (fail closed);
   - `MEDIA_TOKEN_SECRET` — резерв под HMAC медиа-токенов, пока не читается.
   Для деплоя те же значения задаются через `wrangler secret put`.

`PUBLIC_ORIGINS` задаётся в `vars` и содержит точные origin'ы CORS:
`https://paluuwp.github.io,http://localhost:5173`. Wildcard не используется.

## Деплой (выполнен 2026-11-16)

- URL: `https://bitvault-api.bitvault-api.workers.dev` (workers.dev subdomain
  аккаунта — `bitvault-api`, поэтому имя повторяется).
- Remote-миграция `bitvault-prod` применена (30 команд, 12 таблиц).
- Секреты в Worker заданы через dashboard: `ALLOWED_EMAILS`,
  `MEDIA_TOKEN_SECRET` (значения в репозитории и в чате не публикуются).
- Проверено на живом Worker: `GET /api/v1/health` → 200 `{ok:true}`,
  `GET /api/v1/health/ready` → 200 (D1 доступна), preflight CORS с
  `https://paluuwp.github.io` → 204 с правильными заголовками,
  `/auth/me` без токена → 401 `no-store`, заведомо неверный Google-токен →
  401 `UNAUTHORIZED` (значит, JWKS Google с Worker доступен).
- Повторный деплой: `npm run deploy` из `worker/`.

## Миграции D1

```bash
# локально (эмуляция D1, состояние в .wrangler/state)
npm run db:migrate:local
# remote (после замены database_id и wrangler login)
npm run db:migrate:remote
```

Прямая команда:

```bash
wrangler d1 migrations apply bitvault-prod --local --persist-to .wrangler/state
```

## Разработка и проверки

```bash
npm run dev         # wrangler dev на http://localhost:8787
npm run typecheck   # tsc -p tsconfig.json (noEmit, strict)
npm test            # vitest run, тесты без сети
npm run test:watch
```

Тесты используют `MemoryStore` и стаб-верификатор Google-токена через DI
`createApp({ storeFactory, verifyIdToken, now })`; сеть и D1 не нужны.
Проверка Google-токена тестируется офлайн на локально сгенерированной паре
ключей (`createLocalJWKSet`), включая `email_verified`, `iss`, `aud`, `exp`
и классификацию ошибок JWKS (401 против 503).

Корневой ESLint каталог `worker` не линтует (у него Node/Workers-глобали, а не
браузерные); статическая проверка — `npm run typecheck` в strict-режиме плюс
тесты в CI.

## Эндпоинты (`/api/v1`)

| Метод | Путь | Авторизация | Ответ |
| --- | --- | --- | --- |
| GET | `/health` | нет | `200 { "ok": true, "version": "1" }` |
| GET | `/health/ready` | нет | `200 { "ok": true }` или `503 { "ok": false }` (D1) |
| POST | `/auth/google` | нет | `200 { token, expiresAt, user, libraries }` |
| GET | `/auth/me` | Bearer | `200 { user, libraries, expiresAt }` |
| POST | `/auth/logout` | Bearer | `204` |
| POST | `/auth/logout-all` | Bearer | `204` |

Ошибки — единый конверт `{ "error": { "code", "message" } }` с кодами из
контракта. Неизвестный маршрут и необработанные ошибки тоже отдают JSON и
CORS-заголовки для разрешённых origin.

## Сессии

- Токен — 32 случайных байта в base64url (43 символа), в D1 хранится только
  SHA-256 hex. Токен другой длины отклоняется до запроса в БД.
- Срок — 30 дней; продление `expires_at` при любом авторизованном запросе не
  чаще раза в сутки.
- `/auth/logout` удаляет текущую сессию, `/auth/logout-all` — все сессии
  пользователя. Истёкшая сессия удаляется при обращении и даёт 401.
- На пользователя хранится не больше 20 сессий; при входе старые вытесняются,
  истёкшие удаляются оппортунистически.

## Безопасность

- Белый список e-mail проверяется только на сервере при каждом входе; пустой
  список запрещает вход всем (fail closed).
- `/auth/google`: только `application/json`, тело ≤16 КиБ, `credential`
  ≤8192 символов, не больше 10 попыток в минуту с одного IP
  (`CF-Connecting-IP`) — fixed window в таблице `rate_limits`; счётчики окон
  старше часа удаляются при входе.
- Ответы авторизации отдаются с `Cache-Control: no-store`.
- CORS: точное совпадение origin, `Vary: Origin`, preflight 204, без wildcard.
- В логи попадают только код ошибки и класс исключения — без токенов,
  credential и e-mail.
- Секреты не хранятся в репозитории; `.dev.vars` в `.gitignore`.
- Одинаковые правила действуют для ошибок: детали внутренних сбоев наружу не
  отдаются (500 → `INTERNAL`).

## Ограничения первой очереди

- Реальные вход и загрузка файлов ещё не проверялись: для входа нужен
  фронтенд с Google Identity Services, эндпоинтов файлов/медиа пока нет.
- Rate limit — фиксированное окно в D1: точность достаточна для защиты входа,
  но это не распределённый лимитер; при нескольких инстансах Worker счётчик
  всё равно общий, потому что живёт в D1.
- `CF-Connecting-IP` присутствует только на реальном Cloudflare; при локальной
  разработке все запросы попадают в общий ключ `login:unknown`.
- `PUBLIC_ORIGINS` по умолчанию включает `http://localhost:5173` — удобно для
  локального фронтенда; после настройки можно убрать его из production-значения
  (пустое значение закрывает CORS полностью).
- `D1Store` не покрыт интеграционными тестами в CI: SQL проверен вручную на
  локальной D1 (`wrangler d1 execute`), но не автотестами. Следующий шаг —
  `@cloudflare/vitest-pool-workers` с применением миграций.
- Нет эндпоинтов библиотеки/треков/файлов/медиа — только схема под них.
- `MEDIA_TOKEN_SECRET` объявлен, но не используется.
- Нет refresh-токенов: клиент хранит opaque session token и при 401
  выполняет вход заново.
