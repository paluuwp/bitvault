import { clsx } from 'clsx'
import { Heart } from 'lucide-react'

export interface FavoriteButtonProps {
  isFavorite: boolean
  trackName: string
  disabled?: boolean
  onToggle?: () => void
  variant?: 'overlay' | 'plain'
  className?: string
}

export function FavoriteButton({
  isFavorite,
  trackName,
  disabled = false,
  onToggle,
  variant = 'plain',
  className,
}: FavoriteButtonProps) {
  const label = isFavorite
    ? `Убрать «${trackName}» из избранного`
    : `Добавить «${trackName}» в избранное`

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isFavorite}
      title={label}
      disabled={disabled}
      onClick={() => onToggle?.()}
      className={clsx(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control border transition-colors disabled:pointer-events-none disabled:opacity-40',
        variant === 'overlay'
          ? 'border-control-border bg-bg/90 hover:bg-bg'
          : 'border-transparent hover:bg-surface-hover',
        isFavorite
          ? 'text-favorite'
          : variant === 'overlay'
            ? 'text-text hover:text-favorite'
            : 'text-text-muted hover:text-favorite',
        className,
      )}
    >
      <Heart className={clsx('h-5 w-5', isFavorite && 'fill-current')} aria-hidden="true" />
    </button>
  )
}
