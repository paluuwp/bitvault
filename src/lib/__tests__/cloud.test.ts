import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import {
  clearCloudCache,
  downloadCloudFile,
  getCloudContext,
  pushTrackToCloud,
  refreshCloudTracks,
  resolveCloudFile,
} from '../cloud'
import { exportLibrary } from '../exportImport'
import { createTrackFromFile } from '../upload'
import { MANIFEST_ENTRY } from '../constants'
import { withDatabase } from '../db'
import { createSessionStore } from '../auth/session'
import { createTrack, deleteTrack, listTracks } from '../repositories/tracks'
import { saveFile } from '../repositories/files'
import type { RemoteTrack } from '../api'
import type { Track } from '@/types/models'
import { resetDatabase } from './helpers'

const LIBRARY_ID = 'lib_user'

function writeSession(): void {
  const store = createSessionStore(window.localStorage)
  store.write({
    version: 1,
    token: 'a'.repeat(43),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    user: { id: 'usr_1', email: 'owner@example.com', name: 'Owner', picture: null },
    libraries: [{ id: LIBRARY_ID, name: 'Моя библиотека', role: 'owner' }],
  })
}

function remoteTrack(overrides: Partial<RemoteTrack> = {}): RemoteTrack {
  return {
    id: 'cloud-1',
    name: 'Cloud Beat',
    bpm: 140,
    musicalKey: 'Am',
    genre: 'Trap',
    tags: ['dark'],
    notes: '',
    color: '#8B5CF6',
    isFavorite: false,
    durationSec: 120,
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
    lastPlayedAt: null,
    playCount: 0,
    audioFile: { id: 'file-a', kind: 'audio', name: 'beat.wav', mimeType: 'audio/wav', size: 4 },
    coverFile: null,
    attachments: [],
    ...overrides,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function trackDto(overrides: Partial<RemoteTrack> = {}): unknown {
  return remoteTrack(overrides)
}

async function readAllTracks(): Promise<Track[]> {
  return withDatabase((database) => database.getAll('tracks'))
}

const fetchMock = vi.fn()

beforeEach(async () => {
  await resetDatabase()
  window.localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await clearCloudCache()
  window.localStorage.clear()
})

describe('getCloudContext', () => {
  it('без сессии возвращает null', () => {
    expect(getCloudContext()).toBeNull()
  })

  it('с сессией отдаёт токен и личную библиотеку', () => {
    writeSession()
    const context = getCloudContext()
    expect(context?.token).toBe('a'.repeat(43))
    expect(context?.libraryId).toBe(LIBRARY_ID)
  })
})

describe('refreshCloudTracks', () => {
  it('кэширует треки аккаунта и убирает исчезнувшие облачные', async () => {
    writeSession()
    const context = getCloudContext()
    if (!context) throw new Error('Нет контекста')

    await withDatabase(async (database) => {
      await database.put('tracks', {
        id: 'stale-cloud',
        name: 'Old',
        nameLower: 'old',
        bpm: null,
        musicalKey: null,
        genre: null,
        tags: [],
        notes: '',
        color: '#D8FF3E',
        audioFileId: null,
        coverFileId: null,
        attachmentFileIds: [],
        isFavorite: false,
        durationSec: null,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
        lastPlayedAt: null,
        playCount: 0,
        source: 'cloud',
      })
    })
    const local = await createTrack({ name: 'Local Beat' })

    fetchMock.mockResolvedValue(
      json({
        library: { id: LIBRARY_ID, name: 'Моя библиотека', role: 'owner' },
        tracks: [trackDto()],
      }),
    )

    await refreshCloudTracks(context)

    const tracks = await readAllTracks()
    expect(tracks.map((track) => track.id).sort()).toEqual([local.id, 'cloud-1'].sort())
    expect(tracks.find((track) => track.id === 'cloud-1')?.source).toBe('cloud')
  })
})

describe('pushTrackToCloud', () => {
  it('загружает файл и трек, возвращает облачную версию', async () => {
    writeSession()
    const context = getCloudContext()
    if (!context) throw new Error('Нет контекста')

    const stored = await saveFile(
      'audio',
      new Blob(['audio-bytes']),
      'beat.wav',
      'audio/wav',
    )
    const track = await createTrack({
      name: 'Local Beat',
      audioFileId: stored.id,
      durationSec: 60,
    })

    fetchMock
      .mockResolvedValueOnce(
        json({ id: stored.id, kind: 'audio', name: 'beat.wav', mimeType: 'audio/wav', size: 11 }),
      )
      .mockResolvedValueOnce(
        json(
          trackDto({
            id: track.id,
            name: track.name,
            durationSec: 60,
            audioFile: {
              id: stored.id,
              kind: 'audio',
              name: 'beat.wav',
              mimeType: 'audio/wav',
              size: 11,
            },
          }),
        ),
      )

    const pushed = await pushTrackToCloud(context, track)

    expect(pushed.source).toBe('cloud')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(uploadUrl).toContain(`/libraries/${LIBRARY_ID}/files/${stored.id}`)
    expect(uploadUrl).toContain('kind=audio')
    expect(uploadInit.method).toBe('PUT')

    const [trackUrl, trackInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(trackUrl).toContain(`/tracks/${track.id}`)
    expect(trackInit.method).toBe('PUT')
    const body = JSON.parse(String(trackInit.body)) as { audioFileId: string }
    expect(body.audioFileId).toBe(stored.id)

    const cachedFile = await withDatabase((database) => database.get('files', stored.id))
    expect(cachedFile?.cloudUploadedAt).toBeTruthy()
    expect(cachedFile?.cloudLibraryId).toBe(LIBRARY_ID)
  })

  it('повторно не загружает уже загруженный файл', async () => {
    writeSession()
    const context = getCloudContext()
    if (!context) throw new Error('Нет контекста')

    const stored = await saveFile('audio', new Blob(['x']), 'beat.wav', 'audio/wav')
    await withDatabase(async (database) => {
      const file = await database.get('files', stored.id)
      if (file) {
        await database.put('files', {
          ...file,
          cloudUploadedAt: '2026-11-01T00:00:00.000Z',
          cloudLibraryId: LIBRARY_ID,
        })
      }
    })
    const track = await createTrack({ name: 'Local Beat', audioFileId: stored.id })

    fetchMock.mockResolvedValueOnce(json(trackDto({ id: track.id, name: track.name })))

    await pushTrackToCloud(context, track)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/tracks/${track.id}`)
  })
})

describe('файлы аккаунта', () => {
  it('скачивает файл по подписанной ссылке и кэширует его', async () => {
    writeSession()
    const context = getCloudContext()
    if (!context) throw new Error('Нет контекста')

    fetchMock
      .mockResolvedValueOnce(
        json({
          url: 'https://cdn.example/media/file-a?exp=1&sig=x',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          file: {
            id: 'file-a',
            kind: 'audio',
            name: 'beat.wav',
            mimeType: 'audio/wav',
            size: 5,
          },
        }),
      )
      .mockResolvedValueOnce(new Response(new Blob(['audio'])))

    const file = await downloadCloudFile(context, 'file-a')
    expect(file.originalName).toBe('beat.wav')
    expect(file.size).toBe(5)

    const cached = await withDatabase((database) => database.get('files', 'file-a'))
    expect(cached?.originalName).toBe('beat.wav')
  })
})

describe('локальная и облачная библиотека вместе', () => {
  it('listTracks показывает локальные и облачные треки', async () => {
    writeSession()
    const local = await createTrack({ name: 'Local Beat' })
    fetchMock.mockResolvedValue(
      json({
        library: { id: LIBRARY_ID, name: 'Моя библиотека', role: 'owner' },
        tracks: [trackDto()],
      }),
    )

    const tracks = await listTracks()
    expect(tracks.map((track) => track.id)).toEqual(
      expect.arrayContaining([local.id, 'cloud-1']),
    )
  })

  it('при сбое сети отдаёт кэш вместо ошибки', async () => {
    writeSession()
    await createTrack({ name: 'Local Beat' })
    fetchMock.mockRejectedValue(new TypeError('network down'))

    const tracks = await listTracks()
    expect(tracks).toHaveLength(1)
    expect(tracks[0]?.name).toBe('Local Beat')
  })

  it('clearCloudCache оставляет локальные треки и удаляет облачные', async () => {
    writeSession()
    const local = await createTrack({ name: 'Local Beat' })
    fetchMock.mockResolvedValue(
      json({
        library: { id: LIBRARY_ID, name: 'Моя библиотека', role: 'owner' },
        tracks: [trackDto()],
      }),
    )
    await listTracks()

    await clearCloudCache()

    const tracks = await readAllTracks()
    expect(tracks.map((track) => track.id)).toEqual([local.id])
  })
})

describe('удаление облачного трека', () => {
  it('сначала удаляет на сервере, затем локально', async () => {
    writeSession()
    fetchMock.mockResolvedValueOnce(
      json({
        library: { id: LIBRARY_ID, name: 'Моя библиотека', role: 'owner' },
        tracks: [trackDto()],
      }),
    )
    await listTracks()

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await deleteTrack('cloud-1')

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(String(url)).toContain('/tracks/cloud-1')
    expect(init.method).toBe('DELETE')
    const tracks = await readAllTracks()
    expect(tracks).toHaveLength(0)
  })
})

describe('счётчик прослушиваний', () => {
  it('не уменьшается при обновлении из сервера', async () => {
    writeSession()
    const context = getCloudContext()
    if (!context) throw new Error('Нет контекста')

    await withDatabase(async (database) => {
      await database.put('tracks', {
        id: 'cloud-1',
        name: 'Cloud Beat',
        nameLower: 'cloud beat',
        bpm: 140,
        musicalKey: null,
        genre: null,
        tags: [],
        notes: '',
        color: '#8B5CF6',
        audioFileId: null,
        coverFileId: null,
        attachmentFileIds: [],
        isFavorite: false,
        durationSec: null,
        createdAt: '2026-11-10T10:00:00.000Z',
        updatedAt: '2026-11-11T10:00:00.000Z',
        lastPlayedAt: '2026-11-12T09:00:00.000Z',
        playCount: 5,
        source: 'cloud',
      })
    })

    fetchMock.mockResolvedValue(
      json({
        library: { id: LIBRARY_ID, name: 'Моя библиотека', role: 'owner' },
        tracks: [trackDto({ updatedAt: '2026-11-11T10:00:00.000Z' })],
      }),
    )
    await refreshCloudTracks(context)

    const [track] = await readAllTracks()
    expect(track?.playCount).toBe(5)
    expect(track?.lastPlayedAt).toBe('2026-11-12T09:00:00.000Z')
  })
})

describe('выход во время запроса', () => {
  it('запоздавший ответ не воскрешает треки прошлого аккаунта', async () => {
    writeSession()
    const context = getCloudContext()
    if (!context) throw new Error('Нет контекста')

    let resolveFetch: ((response: Response) => void) | undefined
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      }),
    )

    const pending = refreshCloudTracks(context)
    await Promise.resolve()
    await clearCloudCache()
    resolveFetch?.(
      json({
        library: { id: LIBRARY_ID, name: 'Моя библиотека', role: 'owner' },
        tracks: [trackDto()],
      }),
    )

    await expect(pending).rejects.toThrow('Сессия аккаунта завершилась')
    expect(await readAllTracks()).toHaveLength(0)
  })
})

describe('запись трека в аккаунт', () => {
  it('сохраняет локальные счётчик и дату прослушивания', async () => {
    writeSession()
    const context = getCloudContext()
    if (!context) throw new Error('Нет контекста')

    const track: Track = {
      id: 'cloud-1',
      name: 'Cloud Beat',
      nameLower: 'cloud beat',
      bpm: 140,
      musicalKey: null,
      genre: null,
      tags: [],
      notes: '',
      color: '#8B5CF6',
      audioFileId: null,
      coverFileId: null,
      attachmentFileIds: [],
      isFavorite: false,
      durationSec: null,
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-12T10:00:00.000Z',
      lastPlayedAt: '2026-11-12T09:00:00.000Z',
      playCount: 5,
      source: 'cloud',
    }

    fetchMock.mockResolvedValueOnce(json(trackDto({ updatedAt: '2026-11-12T10:00:00.000Z' })))

    const pushed = await pushTrackToCloud(context, track)
    expect(pushed.playCount).toBe(5)
    expect(pushed.lastPlayedAt).toBe('2026-11-12T09:00:00.000Z')

    const [stored] = await readAllTracks()
    expect(stored?.playCount).toBe(5)
    expect(stored?.lastPlayedAt).toBe('2026-11-12T09:00:00.000Z')
  })
})

describe('удаление во время обновления', () => {
  it('запоздавший ответ не воскрешает удалённый трек', async () => {
    writeSession()
    const context = getCloudContext()
    if (!context) throw new Error('Нет контекста')

    await withDatabase(async (database) => {
      await database.put('tracks', {
        id: 'cloud-1',
        name: 'Cloud Beat',
        nameLower: 'cloud beat',
        bpm: null,
        musicalKey: null,
        genre: null,
        tags: [],
        notes: '',
        color: '#8B5CF6',
        audioFileId: null,
        coverFileId: null,
        attachmentFileIds: [],
        isFavorite: false,
        durationSec: null,
        createdAt: '2026-11-10T10:00:00.000Z',
        updatedAt: '2026-11-11T10:00:00.000Z',
        lastPlayedAt: null,
        playCount: 0,
        source: 'cloud',
      })
    })

    let resolveGet: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
      return new Promise<Response>((resolve) => {
        resolveGet = resolve
      })
    })

    const pending = refreshCloudTracks(context)
    await Promise.resolve()
    await deleteTrack('cloud-1')
    resolveGet?.(
      json({
        library: { id: LIBRARY_ID, name: 'Моя библиотека', role: 'owner' },
        tracks: [trackDto()],
      }),
    )
    await pending

    expect(await readAllTracks()).toHaveLength(0)
  })
})

describe('ссылки на файлы после выхода', () => {
  it('запоздавший ответ не кэшируется и не отдаётся', async () => {
    writeSession()
    const context = getCloudContext()
    if (!context) throw new Error('Нет контекста')

    let resolveFetch: ((response: Response) => void) | undefined
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      }),
    )

    const pending = resolveCloudFile(context, 'file-a')
    await Promise.resolve()
    await clearCloudCache()
    resolveFetch?.(
      json({
        url: 'https://cdn.example/media/file-a?exp=1&sig=x',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        file: { id: 'file-a', kind: 'audio', name: 'beat.wav', mimeType: 'audio/wav', size: 5 },
      }),
    )

    await expect(pending).rejects.toThrow('Сессия аккаунта завершилась')

    // Повторный запрос не должен получить ссылку из кэша прошлой сессии.
    fetchMock.mockRejectedValue(new TypeError('network down'))
    await expect(resolveCloudFile(context, 'file-a')).rejects.toThrow()
  })
})

describe('лимит сервера на размер файла', () => {
  it('при входе отклоняет файл больше 90 МБ до сохранения', async () => {
    writeSession()
    const file = new File(['x'], 'big.wav', { type: 'audio/wav' })
    Object.defineProperty(file, 'size', { value: 91 * 1024 * 1024 })

    await expect(createTrackFromFile(file)).rejects.toThrow('больше 90 МБ')
    expect(await readAllTracks()).toHaveLength(0)
    expect(await withDatabase((database) => database.getAll('files'))).toHaveLength(0)
  })
})

describe('резервная копия', () => {
  it('докачивает файлы облачных треков перед сборкой архива', async () => {
    writeSession()
    await withDatabase(async (database) => {
      await database.put('tracks', {
        id: 'cloud-1',
        name: 'Cloud Beat',
        nameLower: 'cloud beat',
        bpm: null,
        musicalKey: null,
        genre: null,
        tags: [],
        notes: '',
        color: '#8B5CF6',
        audioFileId: 'file-a',
        coverFileId: null,
        attachmentFileIds: [],
        isFavorite: false,
        durationSec: null,
        createdAt: '2026-11-10T10:00:00.000Z',
        updatedAt: '2026-11-11T10:00:00.000Z',
        lastPlayedAt: null,
        playCount: 0,
        source: 'cloud',
      })
    })

    fetchMock
      .mockResolvedValueOnce(
        json({
          url: 'https://cdn.example/media/file-a?exp=1&sig=x',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          file: { id: 'file-a', kind: 'audio', name: 'beat.wav', mimeType: 'audio/wav', size: 5 },
        }),
      )
      .mockResolvedValueOnce(new Response(new Blob(['audio'])))

    const blob = await exportLibrary()
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    const manifestEntry = archive[MANIFEST_ENTRY]
    if (!manifestEntry) throw new Error('В архиве нет manifest.json')
    const manifest = JSON.parse(strFromU8(manifestEntry)) as { files: { id: string }[] }
    expect(manifest.files.map((file) => file.id)).toContain('file-a')
    expect(Object.keys(archive).some((path) => path.startsWith('files/'))).toBe(true)
  })
})
