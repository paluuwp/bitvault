import { describe, expect, it } from 'vitest'
import type { FileDto, LibrarySummary, SignedFileUrl, TrackDto } from '../src/routes/library'
import type { ErrorBody, Harness, LoginBody } from './helpers'
import { MemoryStore, createHarness, loginRequest, readJson } from './helpers'

const AUDIO_BYTES = new TextEncoder().encode('RIFFdata')
const COVER_BYTES = new TextEncoder().encode('PNGdata')
const ATTACHMENT_BYTES = new TextEncoder().encode('PDFdata')
const HOUR_SEC = 3600
const MIB = 1024 * 1024

const SECOND_IDENTITY = {
  sub: 'google-sub-second',
  email: 'second@example.com',
  name: 'Second',
}

interface Setup {
  harness: Harness
  token: string
  libraryId: string
}

async function setup(): Promise<Setup> {
  const harness = createHarness()
  const login = await readJson<LoginBody>(await loginRequest(harness))
  const libraryId = login.libraries[0]?.id
  if (!libraryId) throw new Error('Личная библиотека не создана')
  return { harness, token: login.token, libraryId }
}

interface SecondSetup extends Setup {
  harness: Harness
}

async function loginSecond(harness: Harness): Promise<SecondSetup> {
  const second = createHarness({
    store: harness.store,
    bucket: harness.bucket,
    identity: SECOND_IDENTITY,
  })
  const login = await readJson<LoginBody>(await loginRequest(second))
  const libraryId = login.libraries[0]?.id
  if (!libraryId) throw new Error('Личная библиотека второго пользователя не создана')
  return { harness: second, token: login.token, libraryId }
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

async function request(
  harness: Harness,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return harness.app.request(`/api/v1${path}`, init, harness.env)
}

function uploadFile(
  harness: Harness,
  token: string,
  libraryId: string,
  fileId: string,
  kind: string,
  bytes: Uint8Array,
  mimeType: string,
  name?: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const query = new URLSearchParams({ kind })
  if (name !== undefined) query.set('name', name)
  return request(harness, `/libraries/${libraryId}/files/${fileId}?${query.toString()}`, {
    method: 'PUT',
    headers: { ...auth(token), 'Content-Type': mimeType, ...extraHeaders },
    body: bytes,
  })
}

function putTrack(
  harness: Harness,
  token: string,
  libraryId: string,
  trackId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return request(harness, `/libraries/${libraryId}/tracks/${trackId}`, {
    method: 'PUT',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function listTracks(
  harness: Harness,
  token: string,
  libraryId: string,
): Promise<{ library: LibrarySummary; tracks: TrackDto[] }> {
  const response = await request(harness, `/libraries/${libraryId}/tracks`, {
    headers: auth(token),
  })
  expect(response.status).toBe(200)
  return readJson<{ library: LibrarySummary; tracks: TrackDto[] }>(response)
}

async function expectError(
  response: Response,
  status: number,
  code: string,
): Promise<ErrorBody> {
  expect(response.status).toBe(status)
  const body = await readJson<ErrorBody>(response)
  expect(body.error.code).toBe(code)
  expect(typeof body.error.message).toBe('string')
  expect(body.error.message.length).toBeGreaterThan(0)
  return body
}

async function uploadAudio(
  context: Setup,
  fileId = 'audio-1',
  name = 'loop.wav',
): Promise<FileDto> {
  const response = await uploadFile(
    context.harness,
    context.token,
    context.libraryId,
    fileId,
    'audio',
    AUDIO_BYTES,
    'audio/wav',
    name,
  )
  expect(response.status).toBe(200)
  return readJson<FileDto>(response)
}

describe('GET /libraries/:libraryId/tracks', () => {
  it('без Bearer → 401', async () => {
    const { harness, libraryId } = await setup()
    await expectError(
      await request(harness, `/libraries/${libraryId}/tracks`),
      401,
      'UNAUTHORIZED',
    )
  })

  it('несуществующая библиотека → 404', async () => {
    const context = await setup()
    await expectError(
      await request(context.harness, '/libraries/lib_missing/tracks', {
        headers: auth(context.token),
      }),
      404,
      'NOT_FOUND',
    )
  })

  it('чужая библиотека → 404 и треки не утекают', async () => {
    const first = await setup()
    const second = await loginSecond(first.harness)
    await putTrack(first.harness, first.token, first.libraryId, 'trk-1', { name: 'Мой трек' })

    await expectError(
      await request(first.harness, `/libraries/${second.libraryId}/tracks`, {
        headers: auth(first.token),
      }),
      404,
      'NOT_FOUND',
    )
    expect((await listTracks(first.harness, first.token, first.libraryId)).tracks).toHaveLength(1)
  })

  it('viewer читает, но не пишет', async () => {
    const context = await setup()
    const membership = context.harness.store.memberships.find(
      (entry) => entry.libraryId === context.libraryId,
    )
    expect(membership).toBeDefined()
    if (membership) membership.role = 'viewer'

    expect((await listTracks(context.harness, context.token, context.libraryId)).tracks).toHaveLength(0)

    const put = await putTrack(context.harness, context.token, context.libraryId, 'trk-1', {
      name: 'Track',
    })
    expect((await expectError(put, 403, 'FORBIDDEN')).error.code).toBe('FORBIDDEN')

    const remove = await request(
      context.harness,
      `/libraries/${context.libraryId}/tracks/trk-1`,
      { method: 'DELETE', headers: auth(context.token) },
    )
    await expectError(remove, 403, 'FORBIDDEN')

    const upload = await uploadFile(
      context.harness,
      context.token,
      context.libraryId,
      'f1',
      'audio',
      AUDIO_BYTES,
      'audio/wav',
    )
    await expectError(upload, 403, 'FORBIDDEN')
  })
})

describe('PUT /libraries/:libraryId/tracks/:trackId', () => {
  it('без Bearer → 401', async () => {
    const { harness, libraryId } = await setup()
    await expectError(
      await request(harness, `/libraries/${libraryId}/tracks/trk-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      401,
      'UNAUTHORIZED',
    )
  })

  it('сохраняет все поля и файлы, GET возвращает то же', async () => {
    const context = await setup()
    const audio = await uploadAudio(context)
    const coverResponse = await uploadFile(
      context.harness,
      context.token,
      context.libraryId,
      'cover-1',
      'cover',
      COVER_BYTES,
      'image/png',
      'cover.png',
    )
    expect(coverResponse.status).toBe(200)
    const cover = await readJson<FileDto>(coverResponse)

    for (const [id, name] of [
      ['att-1', 'notes.pdf'],
      ['att-2', 'project.zip'],
    ] as const) {
      const response = await uploadFile(
        context.harness,
        context.token,
        context.libraryId,
        id,
        'attachment',
        ATTACHMENT_BYTES,
        'application/octet-stream',
        name,
      )
      expect(response.status).toBe(200)
    }

    const response = await putTrack(context.harness, context.token, context.libraryId, 'trk-1', {
      name: '  Night Drive  ',
      bpm: 128,
      musicalKey: 'C#m',
      genre: '  Techno ',
      tags: ['#techno', 'Techno', 'bass'],
      notes: '  заметка  ',
      color: '#8B5CF6',
      isFavorite: true,
      durationSec: 245.5,
      createdAt: '2026-11-01T12:00:00.000Z',
      updatedAt: '2026-11-02T13:30:00.000Z',
      audioFileId: 'audio-1',
      coverFileId: 'cover-1',
      attachmentFileIds: ['att-1', 'att-2'],
      playCount: 99,
      lastPlayedAt: '2026-11-03T00:00:00.000Z',
    })
    expect(response.status).toBe(200)
    const track = await readJson<TrackDto>(response)

    expect(track).toEqual({
      id: 'trk-1',
      name: 'Night Drive',
      bpm: 128,
      musicalKey: 'C#m',
      genre: 'Techno',
      tags: ['techno', 'bass'],
      notes: 'заметка',
      color: '#8B5CF6',
      isFavorite: true,
      durationSec: 245.5,
      createdAt: '2026-11-01T12:00:00.000Z',
      updatedAt: '2026-11-02T13:30:00.000Z',
      lastPlayedAt: null,
      playCount: 0,
      audioFile: audio,
      coverFile: cover,
      attachments: [
        {
          id: 'att-1',
          kind: 'attachment',
          name: 'notes.pdf',
          mimeType: 'application/octet-stream',
          size: ATTACHMENT_BYTES.byteLength,
        },
        {
          id: 'att-2',
          kind: 'attachment',
          name: 'project.zip',
          mimeType: 'application/octet-stream',
          size: ATTACHMENT_BYTES.byteLength,
        },
      ],
    })

    const listed = await listTracks(context.harness, context.token, context.libraryId)
    expect(listed.library).toEqual({ id: context.libraryId, name: 'Моя библиотека', role: 'owner' })
    expect(listed.tracks).toEqual([track])
    expect(context.harness.store.attachments.get('trk-1')).toEqual(['att-1', 'att-2'])
  })

  it('обновление сохраняет playCount/lastPlayedAt и заменяет вложения', async () => {
    const context = await setup()
    await uploadAudio(context)
    for (const id of ['att-1', 'att-2']) {
      expect(
        (
          await uploadFile(
            context.harness,
            context.token,
            context.libraryId,
            id,
            'attachment',
            ATTACHMENT_BYTES,
            'application/octet-stream',
            id,
          )
        ).status,
      ).toBe(200)
    }

    const first = await putTrack(context.harness, context.token, context.libraryId, 'trk-1', {
      name: 'Track',
      audioFileId: 'audio-1',
      attachmentFileIds: ['att-1', 'att-2'],
    })
    expect(first.status).toBe(200)

    const stored = context.harness.store.tracks.get('trk-1')
    expect(stored).toBeDefined()
    if (stored) {
      stored.playCount = 7
      stored.lastPlayedAt = '2026-11-10T09:00:00.000Z'
    }

    const updatedResponse = await putTrack(
      context.harness,
      context.token,
      context.libraryId,
      'trk-1',
      {
        name: 'Track 2',
        audioFileId: 'audio-1',
        coverFileId: null,
        attachmentFileIds: ['att-2'],
        color: '#FB7185',
      },
    )
    expect(updatedResponse.status).toBe(200)
    const updated = await readJson<TrackDto>(updatedResponse)
    expect(updated.name).toBe('Track 2')
    expect(updated.playCount).toBe(7)
    expect(updated.lastPlayedAt).toBe('2026-11-10T09:00:00.000Z')
    expect(updated.color).toBe('#FB7185')
    expect(updated.attachments.map((file) => file.id)).toEqual(['att-2'])
    expect(context.harness.store.attachments.get('trk-1')).toEqual(['att-2'])
  })

  it('отклоняет чужой, несуществующий и удалённый файл → 400', async () => {
    const first = await setup()
    const second = await loginSecond(first.harness)
    expect(
      (
        await uploadFile(
          second.harness,
          second.token,
          second.libraryId,
          'foreign-file',
          'audio',
          AUDIO_BYTES,
          'audio/wav',
        )
      ).status,
    ).toBe(200)

    await expectError(
      await putTrack(first.harness, first.token, first.libraryId, 'trk-1', {
        name: 'Track',
        audioFileId: 'foreign-file',
      }),
      400,
      'BAD_REQUEST',
    )

    await expectError(
      await putTrack(first.harness, first.token, first.libraryId, 'trk-1', {
        name: 'Track',
        audioFileId: 'missing-file',
      }),
      400,
      'BAD_REQUEST',
    )

    await uploadAudio(first, 'deleted-file')
    const deleted = first.harness.store.files.get('deleted-file')
    expect(deleted).toBeDefined()
    if (deleted) deleted.deletedAt = first.harness.nowIso()

    await expectError(
      await putTrack(first.harness, first.token, first.libraryId, 'trk-1', {
        name: 'Track',
        attachmentFileIds: ['deleted-file'],
      }),
      400,
      'BAD_REQUEST',
    )

    expect((await listTracks(first.harness, first.token, first.libraryId)).tracks).toHaveLength(0)
  })

  it('валидирует поля по клиентским ограничениям', async () => {
    const context = await setup()
    const invalidBodies: Record<string, unknown>[] = [
      { name: '' },
      { name: 'a'.repeat(101) },
      { name: 42 },
      { name: 'Track', bpm: 10 },
      { name: 'Track', bpm: 401 },
      { name: 'Track', bpm: 128.5 },
      { name: 'Track', bpm: 'fast' },
      { name: 'Track', musicalKey: 'H' },
      { name: 'Track', genre: 'g'.repeat(41) },
      { name: 'Track', tags: Array.from({ length: 11 }, (_, index) => `tag${index}`) },
      { name: 'Track', tags: ['x'.repeat(25)] },
      { name: 'Track', notes: 'n'.repeat(2001) },
      { name: 'Track', color: '#000000' },
      {
        name: 'Track',
        attachmentFileIds: Array.from({ length: 51 }, (_, index) => `att${index}`),
      },
      { name: 'Track', audioFileId: '../escape' },
    ]

    for (const body of invalidBodies) {
      const response = await putTrack(
        context.harness,
        context.token,
        context.libraryId,
        'trk-1',
        body,
      )
      await expectError(response, 400, 'BAD_REQUEST')
    }

    expect((await listTracks(context.harness, context.token, context.libraryId)).tracks).toHaveLength(0)
  })

  it('проверяет JSON, Content-Type и размер тела', async () => {
    const context = await setup()
    const path = `/libraries/${context.libraryId}/tracks/trk-1`

    await expectError(
      await request(context.harness, path, {
        method: 'PUT',
        headers: { ...auth(context.token), 'Content-Type': 'application/json' },
        body: '{',
      }),
      400,
      'BAD_REQUEST',
    )

    await expectError(
      await request(context.harness, path, {
        method: 'PUT',
        headers: { ...auth(context.token), 'Content-Type': 'text/plain' },
        body: JSON.stringify({ name: 'Track' }),
      }),
      400,
      'BAD_REQUEST',
    )

    await expectError(
      await request(context.harness, path, {
        method: 'PUT',
        headers: { ...auth(context.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x'.repeat(70 * 1024) }),
      }),
      413,
      'PAYLOAD_TOO_LARGE',
    )
  })

  it('отклоняет некорректный id трека', async () => {
    const context = await setup()
    for (const trackId of ['bad.id', 'j'.repeat(129)]) {
      await expectError(
        await putTrack(context.harness, context.token, context.libraryId, trackId, {
          name: 'Track',
        }),
        400,
        'BAD_REQUEST',
      )
    }
  })
})

describe('DELETE /libraries/:libraryId/tracks/:trackId', () => {
  it('без Bearer → 401', async () => {
    const { harness, libraryId } = await setup()
    await expectError(
      await request(harness, `/libraries/${libraryId}/tracks/trk-1`, { method: 'DELETE' }),
      401,
      'UNAUTHORIZED',
    )
  })

  it('мягко удаляет трек, повтор даёт 204', async () => {
    const context = await setup()
    expect(
      (await putTrack(context.harness, context.token, context.libraryId, 'trk-1', { name: 'Track' }))
        .status,
    ).toBe(200)

    const first = await request(
      context.harness,
      `/libraries/${context.libraryId}/tracks/trk-1`,
      { method: 'DELETE', headers: auth(context.token) },
    )
    expect(first.status).toBe(204)
    expect(context.harness.store.tracks.get('trk-1')?.deletedAt).toBe(context.harness.nowIso())
    expect((await listTracks(context.harness, context.token, context.libraryId)).tracks).toHaveLength(0)

    const second = await request(
      context.harness,
      `/libraries/${context.libraryId}/tracks/trk-1`,
      { method: 'DELETE', headers: auth(context.token) },
    )
    expect(second.status).toBe(204)

    const missing = await request(
      context.harness,
      `/libraries/${context.libraryId}/tracks/trk-missing`,
      { method: 'DELETE', headers: auth(context.token) },
    )
    expect(missing.status).toBe(204)
  })
})

describe('PUT /libraries/:libraryId/files/:fileId', () => {
  it('без Bearer → 401', async () => {
    const { harness, libraryId } = await setup()
    await expectError(
      await uploadFile(harness, '', libraryId, 'f1', 'audio', AUDIO_BYTES, 'audio/wav'),
      401,
      'UNAUTHORIZED',
    )
  })

  it('сохраняет байты в R2 и строку в files, перезапись в той же библиотеке', async () => {
    const context = await setup()
    const dto = await uploadAudio(context, 'audio-1', 'loop.wav')
    expect(dto).toEqual({
      id: 'audio-1',
      kind: 'audio',
      name: 'loop.wav',
      mimeType: 'audio/wav',
      size: AUDIO_BYTES.byteLength,
    })

    const key = `libraries/${context.libraryId}/files/audio-1`
    const stored = context.harness.bucket.objects.get(key)
    expect(stored).toBeDefined()
    expect(stored?.bytes).toEqual(AUDIO_BYTES)
    expect(stored?.contentType).toBe('audio/wav')

    const record = context.harness.store.files.get('audio-1')
    expect(record?.libraryId).toBe(context.libraryId)
    expect(record?.r2Key).toBe(key)
    expect(record?.deletedAt).toBeNull()

    const nextBytes = new TextEncoder().encode('RIFF-NEXT')
    const overwrite = await uploadFile(
      context.harness,
      context.token,
      context.libraryId,
      'audio-1',
      'audio',
      nextBytes,
      'audio/mpeg',
      'loop2.mp3',
    )
    expect(overwrite.status).toBe(200)
    const overwritten = await readJson<FileDto>(overwrite)
    expect(overwritten.size).toBe(nextBytes.byteLength)
    expect(overwritten.name).toBe('loop2.mp3')
    expect(context.harness.bucket.objects.get(key)?.bytes).toEqual(nextBytes)
    expect(context.harness.store.files.size).toBe(1)
  })

  it('тот же fileId в другой библиотеке → 409, первый объект не тронут', async () => {
    const first = await setup()
    const second = await loginSecond(first.harness)
    await uploadAudio(first, 'shared-file', 'first.wav')

    const conflict = await uploadFile(
      second.harness,
      second.token,
      second.libraryId,
      'shared-file',
      'audio',
      new TextEncoder().encode('OTHER'),
      'audio/wav',
    )
    await expectError(conflict, 409, 'CONFLICT')

    const firstKey = `libraries/${first.libraryId}/files/shared-file`
    expect(first.harness.bucket.objects.get(firstKey)?.bytes).toEqual(AUDIO_BYTES)
    expect(
      first.harness.bucket.objects.has(`libraries/${second.libraryId}/files/shared-file`),
    ).toBe(false)
    expect(first.harness.store.files.get('shared-file')?.libraryId).toBe(first.libraryId)
  })

  it('пустое тело → 400', async () => {
    const context = await setup()
    await expectError(
      await uploadFile(
        context.harness,
        context.token,
        context.libraryId,
        'empty',
        'audio',
        new Uint8Array(),
        'audio/wav',
      ),
      400,
      'BAD_REQUEST',
    )
    expect(context.harness.bucket.objects.size).toBe(0)
  })

  it('превышение лимита обложки → 413', async () => {
    const context = await setup()
    await expectError(
      await uploadFile(
        context.harness,
        context.token,
        context.libraryId,
        'big-cover',
        'cover',
        new Uint8Array(10 * MIB + 1),
        'image/png',
      ),
      413,
      'PAYLOAD_TOO_LARGE',
    )
    expect(context.harness.bucket.objects.size).toBe(0)
  })

  it('превышение лимита аудио по Content-Length → 413 до записи', async () => {
    const context = await setup()
    await expectError(
      await uploadFile(
        context.harness,
        context.token,
        context.libraryId,
        'big-audio',
        'audio',
        AUDIO_BYTES,
        'audio/mpeg',
        undefined,
        { 'Content-Length': String(90 * MIB + 1) },
      ),
      413,
      'PAYLOAD_TOO_LARGE',
    )
    expect(context.harness.bucket.objects.size).toBe(0)
  })

  it('проверяет kind, Content-Type и имя файла', async () => {
    const context = await setup()

    await expectError(
      await uploadFile(
        context.harness,
        context.token,
        context.libraryId,
        'f1',
        'video',
        AUDIO_BYTES,
        'audio/wav',
      ),
      400,
      'BAD_REQUEST',
    )

    await expectError(
      await request(context.harness, `/libraries/${context.libraryId}/files/f1?kind=audio`, {
        method: 'PUT',
        headers: auth(context.token),
        body: AUDIO_BYTES,
      }),
      400,
      'BAD_REQUEST',
    )

    await expectError(
      await uploadFile(
        context.harness,
        context.token,
        context.libraryId,
        'f1',
        'audio',
        AUDIO_BYTES,
        'not-a-mime',
      ),
      400,
      'BAD_REQUEST',
    )

    await expectError(
      await uploadFile(
        context.harness,
        context.token,
        context.libraryId,
        'f1',
        'audio',
        AUDIO_BYTES,
        'audio/wav',
        'n'.repeat(256),
      ),
      400,
      'BAD_REQUEST',
    )
  })
})

describe('GET /libraries/:libraryId/files/:fileId/url и /media/:fileId', () => {
  it('без Bearer → 401', async () => {
    const { harness, libraryId } = await setup()
    await expectError(
      await request(harness, `/libraries/${libraryId}/files/f1/url`),
      401,
      'UNAUTHORIZED',
    )
  })

  it('выдаёт абсолютный подписанный url, медиа отдаётся и поддерживает Range', async () => {
    const context = await setup()
    await uploadAudio(context)

    const response = await request(
      context.harness,
      `/libraries/${context.libraryId}/files/audio-1/url`,
      { headers: auth(context.token) },
    )
    expect(response.status).toBe(200)
    const signed = await readJson<SignedFileUrl>(response)

    const expectedExp = Math.floor(Date.parse(context.harness.nowIso()) / 1000) + HOUR_SEC
    const url = new URL(signed.url)
    expect(url.origin).toBe('http://localhost')
    expect(url.pathname).toBe('/api/v1/media/audio-1')
    expect(url.searchParams.get('exp')).toBe(String(expectedExp))
    expect(url.searchParams.get('sig')).toMatch(/^[0-9a-f]{64}$/)
    expect(signed.expiresAt).toBe(new Date(expectedExp * 1000).toISOString())
    expect(signed.file.id).toBe('audio-1')

    const mediaPath = `${url.pathname}${url.search}`
    const media = await context.harness.app.request(
      mediaPath,
      { headers: { Origin: 'http://localhost:5173' } },
      context.harness.env,
    )
    expect(media.status).toBe(200)
    expect(media.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(media.headers.get('content-type')).toBe('audio/wav')
    expect(media.headers.get('content-length')).toBe(String(AUDIO_BYTES.byteLength))
    expect(media.headers.get('accept-ranges')).toBe('bytes')
    expect(media.headers.get('cache-control')).toBe('private, max-age=3600')
    expect(media.headers.get('etag')).toBeTruthy()
    expect(new Uint8Array(await media.arrayBuffer())).toEqual(AUDIO_BYTES)

    const ranged = await context.harness.app.request(
      mediaPath,
      { headers: { Range: 'bytes=0-3' } },
      context.harness.env,
    )
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('content-range')).toBe(
      `bytes 0-3/${AUDIO_BYTES.byteLength}`,
    )
    expect(ranged.headers.get('content-length')).toBe('4')
    expect(new Uint8Array(await ranged.arrayBuffer())).toEqual(AUDIO_BYTES.slice(0, 4))

    const suffix = await context.harness.app.request(
      mediaPath,
      { headers: { Range: 'bytes=-3' } },
      context.harness.env,
    )
    expect(suffix.status).toBe(206)
    expect(suffix.headers.get('content-range')).toBe(
      `bytes ${AUDIO_BYTES.byteLength - 3}-${AUDIO_BYTES.byteLength - 1}/${AUDIO_BYTES.byteLength}`,
    )
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(
      AUDIO_BYTES.slice(AUDIO_BYTES.byteLength - 3),
    )
  })

  it('битая подпись и истёкший срок → 401', async () => {
    const context = await setup()
    await uploadAudio(context)
    const signed = await readJson<SignedFileUrl>(
      await request(context.harness, `/libraries/${context.libraryId}/files/audio-1/url`, {
        headers: auth(context.token),
      }),
    )
    const url = new URL(signed.url)

    const tampered = new URL(url.toString())
    tampered.searchParams.set('sig', '0'.repeat(64))
    await expectError(
      await context.harness.app.request(
        `${tampered.pathname}${tampered.search}`,
        undefined,
        context.harness.env,
      ),
      401,
      'UNAUTHORIZED',
    )

    await expectError(
      await context.harness.app.request(
        `${url.pathname}?exp=${url.searchParams.get('exp')}`,
        undefined,
        context.harness.env,
      ),
      401,
      'UNAUTHORIZED',
    )

    context.harness.advanceMs((HOUR_SEC + 1) * 1000)
    await expectError(
      await context.harness.app.request(
        `${url.pathname}${url.search}`,
        undefined,
        context.harness.env,
      ),
      401,
      'UNAUTHORIZED',
    )
  })

  it('удалённый файл → 404 и для url, и для медиа', async () => {
    const context = await setup()
    await uploadAudio(context)
    const signed = await readJson<SignedFileUrl>(
      await request(context.harness, `/libraries/${context.libraryId}/files/audio-1/url`, {
        headers: auth(context.token),
      }),
    )
    const url = new URL(signed.url)

    const record = context.harness.store.files.get('audio-1')
    expect(record).toBeDefined()
    if (record) record.deletedAt = context.harness.nowIso()

    await expectError(
      await request(context.harness, `/libraries/${context.libraryId}/files/audio-1/url`, {
        headers: auth(context.token),
      }),
      404,
      'NOT_FOUND',
    )
    await expectError(
      await context.harness.app.request(
        `${url.pathname}${url.search}`,
        undefined,
        context.harness.env,
      ),
      404,
      'NOT_FOUND',
    )
  })

  it('без MEDIA_TOKEN_SECRET → 503', async () => {
    const harness = createHarness({ env: { MEDIA_TOKEN_SECRET: undefined } })
    const login = await readJson<LoginBody>(await loginRequest(harness))
    const libraryId = login.libraries[0]?.id ?? ''
    expect(
      (
        await uploadFile(
          harness,
          login.token,
          libraryId,
          'audio-1',
          'audio',
          AUDIO_BYTES,
          'audio/wav',
        )
      ).status,
    ).toBe(200)

    await expectError(
      await request(harness, `/libraries/${libraryId}/files/audio-1/url`, {
        headers: auth(login.token),
      }),
      503,
      'UNAVAILABLE',
    )
  })
})

describe('изоляция библиотек', () => {
  it('треки и файлы одной библиотеки не видны и не доступны в другой', async () => {
    const first = await setup()
    const second = await loginSecond(first.harness)

    await uploadAudio(first, 'first-audio')
    await putTrack(first.harness, first.token, first.libraryId, 'first-track', {
      name: 'Первый',
      audioFileId: 'first-audio',
    })

    expect(
      (
        await uploadFile(
          second.harness,
          second.token,
          second.libraryId,
          'second-audio',
          'audio',
          AUDIO_BYTES,
          'audio/wav',
        )
      ).status,
    ).toBe(200)
    await putTrack(second.harness, second.token, second.libraryId, 'second-track', {
      name: 'Второй',
      audioFileId: 'second-audio',
    })

    expect((await listTracks(first.harness, first.token, first.libraryId)).tracks.map((t) => t.id)).toEqual([
      'first-track',
    ])
    expect((await listTracks(second.harness, second.token, second.libraryId)).tracks.map((t) => t.id)).toEqual([
      'second-track',
    ])

    await expectError(
      await putTrack(first.harness, first.token, second.libraryId, 'x', { name: 'X' }),
      404,
      'NOT_FOUND',
    )
    await expectError(
      await putTrack(second.harness, second.token, first.libraryId, 'y', { name: 'Y' }),
      404,
      'NOT_FOUND',
    )
    await expectError(
      await request(first.harness, `/libraries/${second.libraryId}/files/second-audio/url`, {
        headers: auth(first.token),
      }),
      404,
      'NOT_FOUND',
    )
    await expectError(
      await putTrack(first.harness, first.token, first.libraryId, 'third-track', {
        name: 'Чужой файл',
        audioFileId: 'second-audio',
      }),
      400,
      'BAD_REQUEST',
    )
  })
})

describe('MemoryStore', () => {
  it('upsertTrack сохраняет playCount/lastPlayedAt и запрещает чужую библиотеку', async () => {
    const store = new MemoryStore()
    const input = {
      id: 'trk-1',
      libraryId: 'lib_a',
      name: 'Track',
      bpm: 120,
      musicalKey: null,
      genre: null,
      tags: ['tag'],
      notes: '',
      color: '#D8FF3E',
      isFavorite: false,
      durationSec: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      audioFileId: null,
      coverFileId: null,
      attachmentFileIds: ['file-1'],
    }

    expect(await store.upsertTrack(input)).not.toBeNull()
    const stored = store.tracks.get('trk-1')
    expect(stored).toBeDefined()
    if (stored) {
      stored.playCount = 5
      stored.lastPlayedAt = '2026-11-10T00:00:00.000Z'
    }

    const updated = await store.upsertTrack({ ...input, name: 'Track 2', attachmentFileIds: [] })
    expect(updated?.playCount).toBe(5)
    expect(updated?.lastPlayedAt).toBe('2026-11-10T00:00:00.000Z')
    expect(store.attachments.get('trk-1')).toEqual([])
    expect(await store.upsertTrack({ ...input, libraryId: 'lib_b' })).toBeNull()

    await store.softDeleteTrack('lib_a', 'trk-1', '2026-11-16T00:00:00.000Z')
    expect(store.tracks.get('trk-1')?.deletedAt).toBe('2026-11-16T00:00:00.000Z')
    await store.softDeleteTrack('lib_b', 'trk-1', '2026-11-17T00:00:00.000Z')
    expect(store.tracks.get('trk-1')?.deletedAt).toBe('2026-11-16T00:00:00.000Z')
  })

  it('upsertFile не перезаписывает файл другой библиотеки', async () => {
    const store = new MemoryStore()
    const input = {
      id: 'file-1',
      libraryId: 'lib_a',
      kind: 'audio',
      r2Key: 'libraries/lib_a/files/file-1',
      mimeType: 'audio/wav',
      size: 4,
      originalName: 'a.wav',
      now: '2026-11-01T00:00:00.000Z',
    }
    expect(await store.upsertFile(input)).not.toBeNull()
    expect(
      await store.upsertFile({ ...input, libraryId: 'lib_b', r2Key: 'libraries/lib_b/files/file-1' }),
    ).toBeNull()
    expect(store.files.get('file-1')?.libraryId).toBe('lib_a')
  })
})
