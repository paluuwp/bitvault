import { useState } from 'react'
import { Modal } from '@/components/ui'
import type { ImportMode, UseLibraryTransferResult } from '@/hooks/useLibraryTransfer'
import type { UseStorageInfoResult } from '@/hooks/useStorageInfo'
import type { ImportResult } from '@/types/models'
import { ImportDialog } from './ImportDialog'
import { StorageMeter } from './StorageMeter'
import { TransferPanel } from './TransferPanel'

export interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  storage: UseStorageInfoResult
  transfer: UseLibraryTransferResult
  /** Идёт загрузка файлов: импорт в это время заблокирован. */
  uploading?: boolean
  /** Вызывается перед записью библиотеки при импорте с заменой. */
  onBeforeReplace: () => void
  /** Обновляет библиотеку и данные хранилища после успешного импорта. */
  onImported: (result: ImportResult) => Promise<void>
}

export function SettingsDialog({
  open,
  onClose,
  storage,
  transfer,
  uploading = false,
  onBeforeReplace,
  onImported,
}: SettingsDialogProps) {
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [settling, setSettling] = useState(false)

  const busy = transfer.exporting || transfer.importing || settling

  const handleSelectImportFile = (file: File) => {
    setPendingFile(file)
    transfer.clearMessages()
    setImportOpen(true)
  }

  const handleImport = async (mode: ImportMode): Promise<ImportResult | null> => {
    if (!pendingFile) return null

    // Блокировка держится до конца обновления библиотеки, иначе импорт можно запустить повторно.
    setSettling(true)
    try {
      const result = await transfer.importFromFile(pendingFile, mode, onBeforeReplace)
      if (result) await onImported(result)
      return result
    } finally {
      setSettling(false)
    }
  }

  const handleCloseImport = () => {
    if (busy) return
    setImportOpen(false)
  }

  const handleClose = () => {
    if (busy) return
    setImportOpen(false)
    onClose()
  }

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title="Настройки"
        description="Хранилище и перенос библиотеки"
        size="lg"
        closeOnBackdrop={!busy}
      >
        <div className="flex flex-col gap-4">
          <StorageMeter
            info={storage.info}
            loading={storage.loading}
            onRequestPersistence={storage.requestPersistence}
          />

          <TransferPanel
            exporting={transfer.exporting}
            importing={transfer.importing}
            progress={transfer.progress}
            errorMessage={transfer.errorMessage}
            warningMessage={transfer.warningMessage}
            onExport={() => void transfer.exportToFile()}
            onSelectImportFile={handleSelectImportFile}
          />
        </div>
      </Modal>

      <ImportDialog
        open={importOpen}
        file={pendingFile}
        busy={busy}
        uploading={uploading}
        exporting={transfer.exporting}
        progress={transfer.progress}
        errorMessage={transfer.errorMessage}
        onClose={handleCloseImport}
        onImport={handleImport}
        onExportFirst={() => void transfer.exportToFile()}
      />
    </>
  )
}
