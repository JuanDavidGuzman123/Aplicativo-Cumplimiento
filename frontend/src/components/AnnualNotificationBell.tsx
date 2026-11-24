import { CalendarClock, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotificationFeed } from '../hooks/useNotificationFeed'
import {
  getAnnualNotifications,
  markAnnualNotificationRead,
} from '../services/annual-notifications'
import type { AnnualNotification } from '../types/notification'
import {
  annualNotificationTypeLabels,
  annualNotificationTypeTones,
} from '../utils/notification'
import { NotificationList } from './NotificationList'

export function AnnualNotificationBell() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const feed = useNotificationFeed<AnnualNotification>({
    load: getAnnualNotifications,
    markRead: markAnnualNotificationRead,
  })

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

  const handleSelect = async (notification: AnnualNotification) => {
    const marked = await feed.markAsRead(notification)

    if (!marked) {
      return
    }

    setOpen(false)

    const annualCounterparty = notification.annualCounterparty
    const code = annualCounterparty?.code
    const basePath =
      annualCounterparty?.source === 'clientes'
        ? '/actualizacion-anual/clientes'
        : '/actualizacion-anual'

    navigate(
      code
        ? `${basePath}?code=${encodeURIComponent(code)}`
        : basePath,
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open
          setOpen(nextOpen)

          if (nextOpen) {
            void feed.refresh()
          }
        }}
        className="relative rounded-md p-2 text-slate-600 transition hover:bg-amber-50 hover:text-slate-900"
        aria-label={
          feed.unreadCount > 0
            ? `Alertas de actualización anual, ${feed.unreadCount} sin leer`
            : 'Alertas de actualización anual'
        }
        aria-haspopup="true"
        aria-expanded={open}
      >
        <CalendarClock className="size-5" />
        {feed.unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 py-0.5 text-[10px] font-semibold leading-none text-white">
            {feed.unreadCount > 99 ? '99+' : feed.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Alertas de actualización anual
              </p>
              <p className="text-xs text-slate-500">
                {feed.unreadCount > 0
                  ? `${feed.unreadCount} sin leer`
                  : 'Todo al día'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                feed.setIsLoading(true)
                void feed.refresh()
              }}
              disabled={feed.isLoading}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-amber-50 hover:text-slate-900 disabled:opacity-60"
              aria-label="Actualizar alertas anuales"
            >
              <RefreshCw
                className={`size-4 ${feed.isLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          <NotificationList
            notifications={feed.notifications}
            isLoading={feed.isLoading}
            error={feed.error}
            markingId={feed.markingId}
            labels={annualNotificationTypeLabels}
            tones={annualNotificationTypeTones}
            emptyTitle="No hay alertas anuales"
            emptyDescription="Los vencimientos de actualización aparecerán aquí."
            refreshLabel="Actualizar alertas anuales"
            onRefresh={() => {
              void feed.refresh()
            }}
            onSelect={(notification) => {
              void handleSelect(notification)
            }}
          />
        </div>
      )}
    </div>
  )
}
