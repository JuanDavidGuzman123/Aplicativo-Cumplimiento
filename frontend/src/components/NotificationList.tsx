import { AlertTriangle, Bell, Loader2, RefreshCw } from 'lucide-react'
import { Badge, type BadgeTone } from './Badge'
import { formatDate } from '../utils/labels'

export type NotificationRow = {
  id: string
  read: boolean
  type: string
  message: string
  scheduledDate: string | null
}

type NotificationListProps<T extends NotificationRow> = {
  notifications: T[]
  isLoading: boolean
  error: string
  markingId: string | null
  labels: Record<string, string>
  tones: Record<string, BadgeTone>
  emptyTitle: string
  emptyDescription: string
  refreshLabel: string
  onRefresh: () => void
  onSelect: (notification: T) => void
}

export function NotificationList<T extends NotificationRow>({
  notifications,
  isLoading,
  error,
  markingId,
  labels,
  tones,
  emptyTitle,
  emptyDescription,
  refreshLabel,
  onRefresh,
  onSelect,
}: NotificationListProps<T>) {
  return (
    <>
      {error && (
        <div className="flex items-start gap-2 border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <span>{error}</span>
            <button
              type="button"
              onClick={onRefresh}
              className="ml-1 font-medium underline"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      <div className="max-h-96 overflow-y-auto">
        {isLoading && notifications.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Cargando notificaciones...
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Bell className="mx-auto size-8 text-amber-300" />
            <p className="mt-2 text-sm font-medium text-slate-900">
              {emptyTitle}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {emptyDescription}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => {
                    void onSelect(notification)
                  }}
                  disabled={markingId === notification.id}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-amber-50/60 disabled:opacity-70 ${
                    notification.read ? 'bg-white' : 'bg-amber-50/70'
                  }`}
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      notification.read
                        ? 'bg-amber-400'
                        : 'bg-amber-500'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={tones[notification.type]}>
                        {labels[notification.type]}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        Vence: {formatDate(notification.scheduledDate)}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm leading-snug text-slate-700">
                      {notification.message}
                    </span>
                  </span>
                  {markingId === notification.id && (
                    <Loader2 className="mt-1 size-4 shrink-0 animate-spin text-slate-500" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {notifications.length > 0 && (
        <div className="flex justify-center border-t border-slate-100 py-2">
          <button
            type="button"
            onClick={() => {
              void onRefresh()
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-amber-50 hover:text-slate-900"
            aria-label={refreshLabel}
          >
            <RefreshCw className="size-3.5" />
            Actualizar
          </button>
        </div>
      )}
    </>
  )
}
