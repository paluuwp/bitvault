import type { Track } from '@/types/models'
import { TrackCard } from './TrackCard'
import type { TrackMenuAction } from './trackMenu'

export interface TrackGridProps {
  tracks: Track[]
  selectedId?: string | null
  onPlay?: (track: Track) => void
  onOpen?: (track: Track) => void
  onToggleFavorite?: (track: Track) => void
  onMenuAction?: (track: Track, action: TrackMenuAction) => void
}

export function TrackGrid({
  tracks,
  selectedId = null,
  onPlay,
  onOpen,
  onToggleFavorite,
  onMenuAction,
}: TrackGridProps) {
  return (
    <div className="track-grid">
      {tracks.map((track) => (
        <TrackCard
          key={track.id}
          track={track}
          selected={track.id === selectedId}
          onPlay={onPlay}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
          onMenuAction={onMenuAction}
        />
      ))}
    </div>
  )
}
