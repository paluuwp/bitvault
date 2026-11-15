import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getAudioDuration,
  getFileExtension,
  isAudioFile,
  isSupportedAudioMime,
  normalizeMimeType,
} from '../audio'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getFileExtension', () => {
  it('возвращает расширение в нижнем регистре', () => {
    expect(getFileExtension('Beat.WAV')).toBe('wav')
    expect(getFileExtension('archive.tar.GZ')).toBe('gz')
  })

  it('возвращает пустую строку без расширения', () => {
    expect(getFileExtension('noext')).toBe('')
    expect(getFileExtension('.flp')).toBe('')
    expect(getFileExtension('trailing.')).toBe('')
  })
})

describe('isAudioFile', () => {
  it('определяет аудио по MIME-типу', () => {
    expect(isAudioFile({ name: 'beat', type: 'audio/mpeg' })).toBe(true)
    expect(isAudioFile({ name: 'beat', type: 'AUDIO/WAV; codecs=1' })).toBe(true)
  })

  it('определяет аудио по расширению', () => {
    expect(isAudioFile({ name: 'Beat.WAV', type: '' })).toBe(true)
    expect(isAudioFile({ name: 'beat.flac', type: 'application/octet-stream' })).toBe(true)
  })

  it('не считает аудио прочие файлы', () => {
    expect(isAudioFile({ name: 'project.flp', type: 'application/octet-stream' })).toBe(false)
    expect(isAudioFile({ name: 'cover.png', type: 'image/png' })).toBe(false)
  })
})

describe('isSupportedAudioMime', () => {
  it('игнорирует параметры MIME', () => {
    expect(isSupportedAudioMime('audio/wav; codecs=1')).toBe(true)
    expect(normalizeMimeType(' Audio/WAV ; x')).toBe('audio/wav')
    expect(isSupportedAudioMime('text/plain')).toBe(false)
  })
})

describe('getAudioDuration', () => {
  it('возвращает null, когда HTMLAudioElement недоступен (jsdom)', async () => {
    vi.stubGlobal('Audio', undefined)
    await expect(getAudioDuration(new Blob(['x']))).resolves.toBeNull()
  })
})
