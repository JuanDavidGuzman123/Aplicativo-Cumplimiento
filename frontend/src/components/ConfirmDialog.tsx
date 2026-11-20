import { Loader2 } from 'lucide-react'
import {
  dangerButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../utils/styles'
import { Modal } from './Modal'

type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  tone?: 'danger' | 'primary'
  isLoading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  tone = 'primary',
  isLoading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="text-sm text-slate-600">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className={secondaryButtonClass}
          disabled={isLoading}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={tone === 'danger' ? dangerButtonClass : primaryButtonClass}
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="size-4 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
