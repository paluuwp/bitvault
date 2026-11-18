import type { Track } from '@/types/models'
import { TrackRow } from './TrackRow'
import type { TrackMenuAction } from './trackMenu'

export interface TrackListProps {
  tracks: Track[]
  label: string
  selectedId?: string | null
  onPlay?: (track: Track) => void
  onOpen?: (track: Track) => void
  onToggleFavorite?: (track: Track) => void
  onMenuAction?: (track: Track, action: TrackMenuAction) => void
}

export function TrackList({
  tracks,
  label,
  selectedId = null,
  onPlay,
  onOpen,
  onToggleFavorite,
  onMenuAction,
}: TrackListProps) {
  return (
    <ul
      aria-label={label}
      className="fl-panel animate-fade-up overflow-hidden rounded-card bg-white/[0.025] bg-none py-1"
    >
      {tracks.map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          index={index + 1}
          selected={track.id === selectedId}
          onPlay={onPlay}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
          onMenuAction={onMenuAction}
        />
      ))}
    </ul>
  )
}
