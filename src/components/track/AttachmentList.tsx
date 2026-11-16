import { Download, FileArchive, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { IconButton, Spinner } from '@/components/ui'
import { useToast } from '@/context/ToastContext'
import { getFileInfo, getFileUrl, getStoredFile, toAppError, AppError } from '@/lib'

interface AttachmentItem {
  id: string
  name: string
  missing: boolean
}

export interface AttachmentListProps {
  fileIds: string[]
  disabled?: boolean
  onRemove: (id: string) => void
}

export function AttachmentList({ fileIds, disabled = false, onRemove }: AttachmentListProps) {
  const { toast } = useToast()
  const [items, setItems] = useState<AttachmentItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (fileIds.length === 0) {
      setItems([])
      setLoading(false)
      return
    }

    setLoading(true)
    Promise.all(
      fileIds.map(async (id): Promise<AttachmentItem> => {
        try {
          const file = await getFileInfo(id)
          return file
            ? { id, name: file.name, missing: false }
            : { id, name: 'Файл недоступен', missing: true }
        } catch (caught) {
          console.error('Не удалось прочитать вложение', caught)
          return { id, name: 'Файл недоступен', missing: true }
        }
      }),
    ).then((nextItems) => {
      if (cancelled) return
      setItems(nextItems)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [fileIds])

  const handleDownload = async (item: AttachmentItem) => {
    if (item.missing) return
    try {
      // Локальный файл отдаём напрямую, облачный сначала скачиваем: атрибут
      // download не работает для чужих origin, и подписанная ссылка открылась
      // бы в новой вкладке вместо сохранения.
      const local = await getStoredFile(item.id)
      let blob: Blob
      if (local) {
        blob = local.blob
      } else {
        const handle = await getFileUrl(item.id)
        const response = await fetch(handle.url)
        if (!response.ok) throw new AppError('NOT_FOUND', 'Не удалось скачать вложение.')
        blob = await response.blob()
        handle.revoke()
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = item.name
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (caught) {
      console.error('Не удалось скачать вложение', caught)
      toast({
        title: 'Не удалось скачать вложение',
        description: toAppError(caught).message,
        variant: 'error',
      })
    }
  }

  return (
    <section aria-label="Вложения" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-body font-medium text-text">Вложения</h3>
        <span className="text-caption text-text-muted">{items.length}</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-caption text-text-muted">
          <Spinner size="sm" label="Загрузка вложений" />
          Загрузка вложений…
        </div>
      ) : items.length === 0 ? (
        <p className="text-caption text-text-muted">
          Вложений нет. Файл проекта, добавленный вместе с битом, появится здесь.
        </p>
      ) : (
        <ul className="fl-inset rounded-control">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
            >
              <FileArchive className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span
                className={
                  item.missing
                    ? 'min-w-0 flex-1 truncate text-caption text-danger'
                    : 'min-w-0 flex-1 truncate text-body text-text'
                }
                title={item.name}
              >
                {item.name}
              </span>

              <IconButton
                label={`Скачать «${item.name}»`}
                disabled={disabled || item.missing}
                onClick={() => void handleDownload(item)}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </IconButton>

              <IconButton
                label={`Удалить вложение «${item.name}»`}
                variant="ghost"
                disabled={disabled}
                onClick={() => onRemove(item.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
