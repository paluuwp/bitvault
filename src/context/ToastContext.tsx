/* eslint-disable react-refresh/only-export-components -- провайдер и хук по плану живут в одном файле */
import { clsx } from 'clsx'
import { X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { IconButton } from '@/components/ui'

export type ToastVariant = 'info' | 'success' | 'error'

export interface ToastOptions {
  title: string
  description?: string
  variant?: ToastVariant
}

interface ToastItem {
  id: number
  title: string
  description?: string
  variant: ToastVariant
}

export interface ToastContextValue {
  toast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const MAX_TOASTS = 3
const TOAST_TIMEOUT_MS = 4000

const variantLedClasses: Record<ToastVariant, string> = {
  info: 'text-led-cyan',
  success: 'text-led-green',
  error: 'text-led-red',
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem
  onDismiss: (id: number) => void
}) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(item.id), TOAST_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [item.id, onDismiss])

  return (
    <div className="fl-panel animate-fade-up pointer-events-auto flex items-start gap-3 rounded-card p-3.5 shadow-float">
      <span
        aria-hidden="true"
        className={clsx('fl-led mt-1.5 shrink-0', variantLedClasses[item.variant])}
      />
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-text">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-caption text-text-muted">{item.description}</p>
        )}
      </div>
      <IconButton
        label="Закрыть уведомление"
        variant="ghost"
        onClick={() => onDismiss(item.id)}
        className="-mt-1 -mr-1"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </IconButton>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextIdRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id))
  }, [])

  const toast = useCallback((options: ToastOptions) => {
    nextIdRef.current += 1
    const item: ToastItem = {
      id: nextIdRef.current,
      title: options.title,
      description: options.description,
      variant: options.variant ?? 'info',
    }
    setToasts((previous) => [...previous, item].slice(-MAX_TOASTS))
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 bottom-28 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast должен использоваться внутри ToastProvider')
  }
  return context
}

/**
 * Необязательный доступ к тостам: возвращает null вне ToastProvider.
 * Нужен утилитам и компонентам, которые могут рендериться изолированно
 * (например, в компонентных тестах) и не должны падать без провайдера.
 */
export function useOptionalToast(): ToastContextValue | null {
  return useContext(ToastContext)
}
