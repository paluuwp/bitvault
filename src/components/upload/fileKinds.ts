import {
  AUDIO_EXTENSIONS,
  AUDIO_MIME_TYPES,
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
} from '@/lib'

const ATTACHMENT_EXTENSIONS = ['flp', 'zip', 'rar', '7z', 'mid', 'midi', 'als', 'ptx']

function getExtension(name: string): string {
  const trimmed = name.trim()
  const dotIndex = trimmed.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) return ''
  return trimmed.slice(dotIndex + 1).toLowerCase()
}

export function isImageUpload(file: File): boolean {
  const mime = file.type.split(';')[0]?.trim().toLowerCase() ?? ''
  return IMAGE_MIME_TYPES.includes(mime) || IMAGE_EXTENSIONS.includes(getExtension(file.name))
}

/** Аудио, проекты FL Studio и прочие вложения, которые можно выбрать в диалоге. */
export const UPLOAD_ACCEPT = [
  ...AUDIO_MIME_TYPES,
  ...AUDIO_EXTENSIONS.map((extension) => `.${extension}`),
  ...ATTACHMENT_EXTENSIONS.map((extension) => `.${extension}`),
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
].join(',')
