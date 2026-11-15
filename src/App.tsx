import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import type { AppSection } from '@/components/layout/navigation'
import { LibraryPage } from '@/pages/LibraryPage'
import { LibraryToolbar } from '@/components/library/LibraryToolbar'
import type { TrackMenuAction } from '@/components/library/trackMenu'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { TrackDetailDrawer } from '@/components/track'
import { ConfirmDialog } from '@/components/ui'
import { DropZone, UploadOverlay } from '@/components/upload'
import { UPLOAD_ACCEPT, isImageUpload } from '@/components/upload/fileKinds'
import { PlayerProvider, usePlayerControls, usePlayerTrack } from '@/context/PlayerContext'
import { ToastProvider, useToast } from '@/context/ToastContext'
import { useLibraryFilters, buildTagStats } from '@/hooks/useLibraryFilters'
import { useLibraryTransfer } from '@/hooks/useLibraryTransfer'
import { useStorageInfo } from '@/hooks/useStorageInfo'
import { useTracks } from '@/hooks/useTracks'
import type { UseTracksResult } from '@/hooks/useTracks'
import { useUpload } from '@/hooks/useUpload'
import {
  AppError,
  LIMITS,
  deleteTrack,
  getFile,
  getFileUrl,
  isAppError,
} from '@/lib'
import type { ImportResult, Track, TrackPatch } from '@/types/models'

async function downloadTrackAudio(track: Track): Promise<void> {
  if (!track.audioFileId) return

  const file = await getFile(track.audioFileId)
  if (!file) throw new AppError('NOT_FOUND', 'Аудиофайл не найден.')

  const handle = await getFileUrl(track.audioFileId)
  const link = document.createElement('a')
  link.href = handle.url
  link.download = file.originalName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(handle.revoke, 1000)
}

/** Понятное пользователю описание ошибки загрузки библиотеки. */
function describeLibraryError(error: AppError | null): string | null {
  if (!error) return null
  if (error.code === 'DB_UNAVAILABLE') {
    return 'Браузер не даёт доступ к локальному хранилищу. Отключите приватный режим или разрешите IndexedDB и повторите попытку.'
  }
  return error.message
}

function AppContent({ library }: { library: UseTracksResult }) {
  const { toast } = useToast()
  const upload = useUpload(library.refresh)
  const storage = useStorageInfo()
  const refreshStorage = storage.refresh
  const transfer = useLibraryTransfer()
  const { currentTrack } = usePlayerTrack()
  const { playTrack, togglePlay, stop, removeFromQueue, syncTrack } = usePlayerControls()

  const [activeSection, setActiveSection] = useState<AppSection>('library')
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wasUploadingRef = useRef(false)

  useEffect(() => {
    if (wasUploadingRef.current && !upload.isUploading) void refreshStorage()
    wasUploadingRef.current = upload.isUploading
  }, [upload.isUploading, refreshStorage])

  const isFavorites = activeSection === 'favorites'
  const sectionTracks = useMemo(
    () => (isFavorites ? library.tracks.filter((track) => track.isFavorite) : library.tracks),
    [isFavorites, library.tracks],
  )
  const filters = useLibraryFilters(sectionTracks)
  const sidebarTags = useMemo(() => buildTagStats(library.tracks).slice(0, 12), [library.tracks])
  const favoritesCount = useMemo(
    () => library.tracks.filter((track) => track.isFavorite).length,
    [library.tracks],
  )

  const selectedTrack = useMemo(
    () =>
      selectedTrackId === null
        ? null
        : (library.tracks.find((track) => track.id === selectedTrackId) ?? null),
    [library.tracks, selectedTrackId],
  )
  const pendingDeleteTrack = useMemo(
    () =>
      pendingDeleteId === null
        ? null
        : (library.tracks.find((track) => track.id === pendingDeleteId) ?? null),
    [library.tracks, pendingDeleteId],
  )

  const handleIncomingFiles = (incoming: File[]) => {
    if (incoming.length === 0) return

    const files = incoming.slice(0, LIMITS.dropFilesMax)
    if (incoming.length > files.length) {
      toast({
        title: `За один раз можно добавить не больше ${LIMITS.dropFilesMax} файлов`,
        description: `Остальные ${incoming.length - files.length} файлов не добавлены.`,
        variant: 'info',
      })
    }

    const images = files.filter(isImageUpload)
    const others = files.filter((file) => !isImageUpload(file))

    if (images.length > 0) {
      toast({
        title: 'Изображения добавляются как обложка в редакторе бита',
        description: 'Откройте бит и выберите обложку в карточке редактирования.',
        variant: 'info',
      })
    }

    if (others.length > 0) {
      void upload.uploadFiles(others)
    }
  }

  // Файл, брошенный мимо библиотеки, не должен уводить браузер со страницы.
  const incomingFilesRef = useRef(handleIncomingFiles)
  incomingFilesRef.current = handleIncomingFiles

  useEffect(() => {
    const hasFiles = (event: globalThis.DragEvent): boolean =>
      event.dataTransfer !== null && Array.from(event.dataTransfer.types).includes('Files')

    const handleDragOver = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = (event: globalThis.DragEvent) => {
      if (!hasFiles(event) || !event.dataTransfer) return
      event.preventDefault()

      const target = event.target instanceof Element ? event.target : null
      // Внутри зоны библиотеки drop уже обрабатывает DropZone, в диалогах — не мешаем.
      if (
        target?.closest('[data-drop-zone]') ||
        target?.closest('dialog[open]') ||
        target?.closest('[role="dialog"]')
      ) {
        return
      }

      const files = Array.from(event.dataTransfer.files)
      if (files.length > 0) incomingFilesRef.current(files)
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  const handleAddTrack = () => {
    fileInputRef.current?.click()
  }

  const handleOpenTrack = (track: Track) => {
    setSelectedTrackId(track.id)
  }

  const handleToggleFavorite = (track: Track) => {
    void library.toggleFavorite(track.id)
  }

  const handlePlay = (track: Track) => {
    if (track.audioFileId === null) {
      setSelectedTrackId(track.id)
      return
    }

    if (currentTrack?.id === track.id) {
      togglePlay()
      return
    }

    playTrack(track, filters.visibleTracks)
  }

  const handleDownload = async (track: Track) => {
    try {
      await downloadTrackAudio(track)
    } catch (caught) {
      console.error('Не удалось скачать аудио', caught)
      toast({
        title: 'Не удалось скачать аудио',
        description: isAppError(caught) ? caught.message : 'Повторите попытку.',
        variant: 'error',
      })
    }
  }

  const handleMenuAction = (track: Track, action: TrackMenuAction) => {
    switch (action) {
      case 'play':
        handlePlay(track)
        break
      case 'open':
        handleOpenTrack(track)
        break
      case 'favorite':
        void library.toggleFavorite(track.id)
        break
      case 'download':
        void handleDownload(track)
        break
      case 'delete':
        setPendingDeleteId(track.id)
        break
    }
  }

  const handleConfirmDelete = async () => {
    const track = pendingDeleteTrack
    if (!track || deleting) return

    setDeleting(true)
    try {
      await deleteTrack(track.id)
      removeFromQueue(track.id)
      if (currentTrack?.id === track.id) stop()
      library.removeTrack(track.id)
      if (selectedTrackId === track.id) setSelectedTrackId(null)
      setPendingDeleteId(null)
      void storage.refresh()
      toast({
        title: 'Бит удалён',
        description: `«${track.name}» и его файлы удалены.`,
        variant: 'success',
      })
    } catch (caught) {
      console.error('Не удалось удалить бит', caught)
      toast({
        title: 'Не удалось удалить бит',
        description: isAppError(caught) ? caught.message : 'Повторите попытку.',
        variant: 'error',
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleSaveTrack = async (id: string, patch: TrackPatch): Promise<Track> => {
    const updated = await library.updateTrack(id, patch)
    syncTrack(updated)
    void storage.refresh()
    toast({
      title: 'Изменения сохранены',
      description: `«${updated.name}»`,
      variant: 'success',
    })
    return updated
  }

  const handleTagSelect = (tag: string) => {
    setActiveSection('library')
    filters.setOnlyFavorites(false)
    filters.setTag(tag)
  }

  const handleNavigate = (section: AppSection) => {
    if (section === 'favorites') filters.setOnlyFavorites(false)
    setActiveSection(section)
  }

  const handleOpenSettings = () => {
    setSettingsOpen(true)
  }

  const handleLibraryImported = async (result: ImportResult) => {
    await library.refresh()
    await storage.refresh()
    setSelectedTrackId(null)

    const variant =
      result.errors.length > 0 ? 'error' : result.warnings.length > 0 ? 'info' : 'success'
    const summary = `Треков: ${result.tracksImported}, пропущено: ${result.tracksSkipped}, файлов: ${result.filesImported}.`
    const suffix =
      result.errors.length > 0
        ? ` Ошибок: ${result.errors.length}.`
        : result.warnings.length > 0
          ? ` Предупреждений: ${result.warnings.length}.`
          : ''

    toast({
      title: 'Импорт завершён',
      description: `${summary}${suffix}`,
      variant,
    })
  }

  return (
    <>
      <AppShell
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onOpenSettings={handleOpenSettings}
        onTagSelect={handleTagSelect}
        tags={sidebarTags}
        libraryCount={library.tracks.length}
        favoritesCount={favoritesCount}
        storageInfo={storage.info}
        storageLoading={storage.loading}
        query={filters.query}
        onQueryChange={filters.setQuery}
        sort={filters.sortField}
        sortDirection={filters.sortDirection}
        onSortChange={filters.setSortField}
        onToggleSortDirection={filters.toggleSortDirection}
        view={filters.view}
        onViewChange={filters.setView}
        onAddTrack={handleAddTrack}
      >
        <DropZone onFiles={handleIncomingFiles}>
          <LibraryPage
            title={isFavorites ? 'Избранное' : 'Библиотека'}
            tracks={filters.visibleTracks}
            totalCount={sectionTracks.length}
            selectedId={currentTrack?.id ?? null}
            view={filters.view}
            loading={library.loading}
            errorMessage={
              library.tracks.length === 0 ? describeLibraryError(library.error) : null
            }
            onRetry={() => void library.refresh()}
            onPlay={handlePlay}
            onOpen={handleOpenTrack}
            onToggleFavorite={handleToggleFavorite}
            onMenuAction={handleMenuAction}
            onAddTrack={handleAddTrack}
            hasActiveFilters={filters.hasActiveFilters}
            onResetFilters={filters.resetFilters}
            emptyTitle={isFavorites ? 'В избранном пока пусто' : 'Библиотека пока пуста'}
            emptyDescription={
              isFavorites
                ? 'Отмечайте биты сердцем — они появятся здесь.'
                : 'Добавьте первый бит — библиотека начнётся здесь.'
            }
            toolbar={
              <LibraryToolbar
                onlyFavorites={filters.onlyFavorites}
                onToggleOnlyFavorites={filters.toggleOnlyFavorites}
                showFavoritesFilter={!isFavorites}
                tags={filters.availableTags}
                activeTag={filters.tag}
                onTagSelect={filters.setTag}
                hasActiveFilters={filters.hasActiveFilters}
                onResetFilters={filters.resetFilters}
                resultCount={filters.visibleTracks.length}
                totalCount={sectionTracks.length}
                sort={filters.sortField}
                sortDirection={filters.sortDirection}
                onSortChange={filters.setSortField}
                onToggleSortDirection={filters.toggleSortDirection}
              />
            }
          />
        </DropZone>
      </AppShell>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        className="hidden"
        aria-label="Добавить биты"
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : []
          event.target.value = ''
          handleIncomingFiles(files)
        }}
      />

      <UploadOverlay progress={upload.progress} />

      <TrackDetailDrawer
        open={selectedTrack !== null}
        track={selectedTrack}
        onClose={() => setSelectedTrackId(null)}
        onSave={handleSaveTrack}
        onToggleFavorite={handleToggleFavorite}
      />

      <ConfirmDialog
        open={pendingDeleteTrack !== null}
        title="Удалить бит?"
        description={
          pendingDeleteTrack
            ? `«${pendingDeleteTrack.name}» будет удалён вместе с аудио, обложкой и вложениями. Это действие нельзя отменить.`
            : undefined
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        destructive
        loading={deleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if (!deleting) setPendingDeleteId(null)
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        storage={storage}
        transfer={transfer}
        uploading={upload.isUploading}
        onBeforeReplace={stop}
        onImported={handleLibraryImported}
      />
    </>
  )
}

/** Библиотека живёт над плеером: учёт прослушивания обновляет список треков. */
function LibraryApp() {
  const library = useTracks()
  return (
    <PlayerProvider onTrackPlayed={library.applyTrackUpdate}>
      <AppContent library={library} />
    </PlayerProvider>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <LibraryApp />
    </ToastProvider>
  )
}
