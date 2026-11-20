import {
  AlertTriangle,
  Bell,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAnnualNotifications,
  markAnnualNotificationRead,
} from '../services/annual-notifications'
import {
  getNotifications,
  markNotificationRead,
} from '../services/notifications'
import type { AppNotification } from '../types/notification'
import { getApiErrorMessage } from '../utils/api-error'
import { formatDate } from '../utils/labels'
import {
  notificationTypeLabels,
  notificationTypeTones,
} from '../utils/notification'
import { Badge } from './Badge'

const POLL_INTERVAL_MS = 60_000

function mergeNotifications(
  semestral: AppNotification[],
  annual: AppNotification[],
): AppNotification[] {
  return [...semestral, ...annual].sort((first, second) => {
    const createdDiff =
      new Date(second.createdAt).getTime() -
      new Date(first.createdAt).getTime()

    return createdDiff || second.id.localeCompare(first.id)
  })
}

export function NotificationBell() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>(
    [],
  )
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [semestral, annual] = await Promise.all([
        getNotifications(),
        getAnnualNotifications(),
      ])
      setNotifications(
        mergeNotifications(semestral.data, annual.data),
      )
      setUnreadCount(semestral.unreadCount + annual.unreadCount)
      setError('')
    } catch (loadError) {
      setError(
        getApiErrorMessage(
          loadError,
          'No fue posible cargar las notificaciones',
        ),
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    const refresh = async () => {
      try {
        const [semestral, annual] = await Promise.all([
          getNotifications(),
          getAnnualNotifications(),
        ])

        if (!active) {
          return
        }

        setNotifications(
          mergeNotifications(semestral.data, annual.data),
        )
        setUnreadCount(
          semestral.unreadCount + annual.unreadCount,
        )
        setError('')
      } catch (loadError) {
        if (!active) {
          return
        }

        setError(
          getApiErrorMessage(
            loadError,
            'No fue posible cargar las notificaciones',
          ),
        )
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void refresh()
    const interval = window.setInterval(() => {
      void refresh()
    }, POLL_INTERVAL_MS)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleToggle = () => {
    const nextOpen = !open
    setOpen(nextOpen)

    if (nextOpen) {
      void load()
    }
  }

  const handleSelect = async (notification: AppNotification) => {
    if (markingId) {
      return
    }

    if (!notification.read) {
      setMarkingId(notification.id)
      setError('')

      try {
        const markRead =
          notification.source === 'ANNUAL'
            ? markAnnualNotificationRead
            : markNotificationRead
        const updated = await markRead(notification.id)
        setNotifications((current) =>
          current.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        )
        setUnreadCount((current) => Math.max(0, current - 1))
      } catch (markError) {
        setError(
          getApiErrorMessage(
            markError,
            'No fue posible marcar la notificación como leída',
          ),
        )
        setMarkingId(null)
        return
      }

      setMarkingId(null)
    }

    setOpen(false)

    if (notification.source === 'ANNUAL') {
      const code = notification.annualCounterparty?.code

      navigate(
        code
          ? `/actualizacion-anual?code=${encodeURIComponent(code)}`
          : '/actualizacion-anual',
      )
      return
    }

    if (notification.counterparty) {
      navigate(`/contrapartes/${notification.counterparty.id}`)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="relative rounded-md p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        aria-label={
          unreadCount > 0
            ? `Notificaciones, ${unreadCount} sin leer`
            : 'Notificaciones'
        }
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 py-0.5 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Notificaciones
              </p>
              <p className="text-xs text-slate-500">
                {unreadCount > 0
                  ? `${unreadCount} sin leer`
                  : 'Todo al día'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsLoading(true)
                void load()
              }}
              disabled={isLoading}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60"
              aria-label="Actualizar notificaciones"
            >
              <RefreshCw
                className={`size-4 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsLoading(true)
                    void load()
                  }}
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
                <Bell className="mx-auto size-8 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-900">
                  No hay notificaciones
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Los vencimientos próximos aparecerán aquí.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void handleSelect(notification)
                      }}
                      disabled={markingId === notification.id}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 disabled:opacity-70 ${
                        notification.read ? 'bg-white' : 'bg-blue-50/60'
                      }`}
                    >
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${
                          notification.read
                            ? 'bg-slate-300'
                            : 'bg-blue-600'
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge
                            tone={notificationTypeTones[notification.type]}
                          >
                            {notificationTypeLabels[notification.type]}
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
        </div>
      )}
    </div>
  )
}
