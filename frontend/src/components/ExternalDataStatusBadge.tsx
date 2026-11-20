import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { Badge, type BadgeTone } from './Badge'
import type { ExternalDataStatus } from '../types/external-data'
import { formatDateTime } from '../utils/labels'
import { secondaryButtonClass } from '../utils/styles'

type ExternalDataStatusBadgeProps = {
  status: ExternalDataStatus | null
  connected: boolean
  syncing?: boolean
  onSync?: () => void
}

type StatusView = {
  label: string
  detail: string
  tone: BadgeTone
  icon: typeof CheckCircle2
}

function resolveView(
  status: ExternalDataStatus | null,
  connected: boolean,
): StatusView {
  if (!status) {
    return {
      label: 'Conectando',
      detail: 'Consultando el estado de la fuente externa',
      tone: 'slate',
      icon: Loader2,
    }
  }

  if (!status.enabled || status.connection === 'disabled') {
    return {
      label: 'Desactivado',
      detail: 'La fuente externa está desactivada',
      tone: 'slate',
      icon: CloudOff,
    }
  }

  if (!status.configured || status.connection === 'unconfigured') {
    return {
      label: 'Sin configurar',
      detail: status.lastError ?? 'Faltan credenciales de Microsoft Graph',
      tone: 'amber',
      icon: AlertTriangle,
    }
  }

  if (
    status.connection === 'connecting' ||
    status.freshness === 'never'
  ) {
    return {
      label: 'Sincronizando',
      detail: 'Cargando la primera versión del libro externo',
      tone: 'blue',
      icon: Loader2,
    }
  }

  if (status.freshness === 'error') {
    return {
      label: 'Sin datos',
      detail: status.lastError ?? 'No fue posible leer el libro externo',
      tone: 'red',
      icon: XCircle,
    }
  }

  if (status.freshness === 'stale') {
    return {
      label: 'Desactualizado',
      detail: status.lastError ?? 'No fue posible confirmar cambios recientes',
      tone: 'amber',
      icon: AlertTriangle,
    }
  }

  if (!connected) {
    return {
      label: 'Actualizado',
      detail: 'Reconectando con el canal de cambios',
      tone: 'blue',
      icon: RefreshCw,
    }
  }

  return {
    label: 'Actualizado',
    detail: status.lastChangeAt
      ? `Último cambio: ${formatDateTime(status.lastChangeAt)}`
      : 'Datos sincronizados con el libro externo',
    tone: 'green',
    icon: CheckCircle2,
  }
}

export function ExternalDataStatusBadge({
  status,
  connected,
  syncing = false,
  onSync,
}: ExternalDataStatusBadgeProps) {
  const view = resolveView(
    syncing && status
      ? {
          ...status,
          connection: 'connecting',
        }
      : status,
    syncing || connected,
  )
  const Icon = syncing ? Loader2 : view.icon

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex items-center gap-2">
        <Badge tone={view.tone}>
          <span className="inline-flex items-center gap-1.5">
            <Icon
              className={`size-3.5 ${
                syncing || view.icon === Loader2 ? 'animate-spin' : ''
              }`}
            />
            {syncing ? 'Sincronizando' : view.label}
          </span>
        </Badge>
        {onSync && (
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className={`${secondaryButtonClass} px-3 py-1.5 text-xs`}
          >
            <RefreshCw
              className={`size-3.5 ${syncing ? 'animate-spin' : ''}`}
            />
            Sincronizar
          </button>
        )}
      </div>
      <p className="max-w-md text-xs text-slate-500 sm:text-right">
        {status?.sourceName
          ? `${status.sourceName} · `
          : ''}
        {view.detail}
      </p>
    </div>
  )
}
