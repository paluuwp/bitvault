import { clsx } from 'clsx'
import { UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'

export interface DropZoneProps {
  onFiles: (files: File[]) => void
  children: ReactNode
  className?: string
}

function isFileDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

/**
 * Принимает файлы, брошенные в область библиотеки. События слушаются на
 * контейнере, а не на window, поэтому модалки и поля ввода не перехватываются.
 */
export function DropZone({ onFiles, children, className }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const [fileCount, setFileCount] = useState(0)
  const depthRef = useRef(0)

  const reset = () => {
    depthRef.current = 0
    setDragging(false)
    setFileCount(0)
  }

  return (
    <div
      data-drop-zone=""
      className={clsx('relative min-h-full', className)}
      onDragEnter={(event) => {
        if (!isFileDrag(event)) return
        event.preventDefault()
        depthRef.current += 1
        setDragging(true)
        setFileCount(event.dataTransfer.items.length)
      }}
      onDragOver={(event) => {
        if (!isFileDrag(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setFileCount(event.dataTransfer.items.length)
      }}
      onDragLeave={() => {
        depthRef.current = Math.max(0, depthRef.current - 1)
        if (depthRef.current === 0) reset()
      }}
      onDrop={(event) => {
        event.preventDefault()
        reset()
        const files = Array.from(event.dataTransfer.files)
        if (files.length === 0) return
        onFiles(files)
      }}
    >
      {children}

      {dragging && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-accent bg-bg/85 px-6 text-center"
        >
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-control bg-accent/10 text-accent">
            <UploadCloud className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="text-h2 text-text">Отпустите файлы, чтобы добавить их</p>
          <p className="text-body text-text-muted">
            Файлов: {fileCount}. Изображения станут обложками в редакторе бита.
          </p>
        </div>
      )}
    </div>
  )
}
