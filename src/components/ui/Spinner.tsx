import { clsx } from 'clsx'
import { LoaderCircle } from 'lucide-react'

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}

const sizeClasses: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-6 w-6',
}

export function Spinner({ size = 'md', label = 'Загрузка', className }: SpinnerProps) {
  return (
    <span role="status" className={clsx('inline-flex items-center justify-center', className)}>
      <LoaderCircle
        aria-hidden="true"
        className={clsx('animate-spin motion-reduce:animate-none', sizeClasses[size])}
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}
