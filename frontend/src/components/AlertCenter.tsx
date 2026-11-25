import {
  ArrowUpRight,
  Bell,
  CalendarClock,
  CheckCheck,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from './Badge'
import { useNotificationFeed } from '../hooks/useNotificationFeed'
import {
  getAnnualNotifications,
  markAnnualNotificationRead,
} from '../services/annual-notifications'
import {
  getNotifications,
  markNotificationRead,
} from '../services/notifications'
import type {
  NotificationProcess,
  NotificationSource,
} from '../types/notification'
import type { AlertNotification } from '../utils/notification'
import { getApiErrorMessage } from '../utils/api-error'
import { formatDate } from '../utils/labels'
import {
  alertStateLabels,
  alertStateTones,
  buildAlertGroups,
  notificationProcessLabels,
  notificationSourceLabels,
  type AlertGroup,
  type AlertState,
} from '../utils/notification'
import type {
  AnnualNotification,
  FollowUpNotification,
} from '../types/notification'

const statusOrder: AlertState[] = [
  'OVERDUE',
  'DUE_SOON',
  'PENDING',
  'COMPLETED',
]

const sourceOrder: Record<NotificationProcess, NotificationSource[]> = {
  FOLLOW_UP: ['arriendos', 'clientes', 'colocadores'],
  ANNUAL: ['arriendos', 'clientes'],
}

const stateStyles: Record<
  AlertState,
  { row: string; border: string; icon: string }
> = {
  OVERDUE: {
    row: 'bg-red-50/70',
    border: 'border-l-red-500',
    icon: 'text-red-600',
  },
  DUE_SOON: {
    row: 'bg-amber-50/70',
    border: 'border-l-amber-400',
    icon: 'text-amber-600',
  },
  PENDING: {
    row: 'bg-white',
    border: 'border-l-blue-400',
    icon: 'text-blue-600',
  },
  COMPLETED: {
    row: 'bg-emerald-50/70',
    border: 'border-l-emerald-500',
    icon: 'text-emerald-600',
  },
}

function getCategorySections(
  items: AlertGroup[],
  process: NotificationProcess,
) {
  return sourceOrder[process].map((source) => ({
    key: `${process}:${source}`,
    source,
    label: `${notificationProcessLabels[process]} · ${notificationSourceLabels[source]}`,
    items: items.filter(
      (item) => item.process === process && item.source === source,
    ),
  }))
}

type AlertMenuProps = {
  process: NotificationProcess
  title: string
  buttonLabel: string
  emptyMessage: string
  icon: LucideIcon
  notifications: AlertNotification[]
  isLoading: boolean
  error: string
  refresh: () => Promise<void>
  markRead: (id: string) => Promise<unknown>
  setIsLoading: (value: boolean) => void
}

function AlertMenu({
  process,
  title,
  buttonLabel,
  emptyMessage,
  icon: Icon,
  notifications,
  isLoading,
  error,
  refresh,
  markRead,
  setIsLoading,
}: AlertMenuProps) {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [markingGroupKey, setMarkingGroupKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

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

  const items = useMemo(
    () =>
      buildAlertGroups(notifications).filter(
        (item) => item.process === process,
      ),
    [notifications, process],
  )

  const unreadCount = items.filter((item) => !item.read).length

  const statusSections = useMemo(
    () =>
      statusOrder
        .map((state) => ({
          state,
          items: items.filter((item) => item.state === state),
        }))
        .filter((section) => section.items.length > 0),
    [items],
  )

  const combinedError = [error, actionError].filter(Boolean).join(' ')

  const refreshAll = () => {
    setIsLoading(true)
    void refresh()
  }

  const markGroupAsRead = async (
    item: AlertGroup,
    navigateAfter = false,
  ) => {
    if (markingGroupKey) {
      return false
    }

    setMarkingGroupKey(item.key)
    setActionError('')

    try {
      await Promise.all(
        item.members
          .filter((member) => !member.read)
          .map((member) => markRead(member.id)),
      )
      await refresh()

      if (navigateAfter) {
        setOpen(false)
        navigate(item.navigatePath)
      }

      return true
    } catch (markError) {
      setActionError(
        getApiErrorMessage(
          markError,
          'No fue posible marcar las alertas como leídas',
        ),
      )
      return false
    } finally {
      setMarkingGroupKey(null)
    }
  }

  const renderAlertItem = (item: AlertGroup) => {
    const style = stateStyles[item.state]
    const isMarking = markingGroupKey === item.key

    return (
      <li
        key={item.key}
        className={`border-l-4 ${style.border} ${style.row}`}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <span className={`mt-0.5 ${style.icon}`}>
            {process === 'FOLLOW_UP' ? (
              <ClipboardCheck className="size-4" />
            ) : (
              <CalendarClock className="size-4" />
            )}
          </span>

          <button
            type="button"
            onClick={() => {
              void markGroupAsRead(item, true)
            }}
            disabled={isMarking}
            className="min-w-0 flex-1 text-left disabled:opacity-70"
          >
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={alertStateTones[item.state]}>
                {alertStateLabels[item.state]}
              </Badge>
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {item.daysLabel}
              </span>
            </span>

            <span className="mt-1 block truncate text-sm font-medium text-slate-900">
              {item.counterpartyLabel}
            </span>
            <span className="block text-xs text-slate-500">
              Identificación: {item.identification}
            </span>
            <span className="mt-1 block text-xs text-slate-600">
              Vence: {formatDate(item.dueDate)} · {item.daysLabel}
            </span>
            <span className="mt-1 block text-[11px] text-slate-500">
              Recordatorios: {item.reminderLabels.join(' · ')}
            </span>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-800">
              Abrir registro
              <ArrowUpRight className="size-3.5" />
            </span>
          </button>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {item.read ? (
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Leída
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void markGroupAsRead(item)
                }}
                disabled={isMarking}
                className="rounded-md p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-900 disabled:opacity-60"
                aria-label="Marcar alerta como leída"
                title="Marcar como leída"
              >
                <CheckCheck className="size-4" />
              </button>
            )}
            {isMarking && (
              <Loader2 className="size-4 animate-spin text-slate-500" />
            )}
          </div>
        </div>
      </li>
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
            refreshAll()
          }
        }}
        className="relative inline-flex items-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium text-slate-600 transition hover:bg-amber-50 hover:text-slate-900"
        aria-label={
          unreadCount > 0
            ? `${title}, ${unreadCount} sin leer`
            : title
        }
        aria-haspopup="true"
        aria-expanded={open}
        title={title}
      >
        <Icon className="size-5" />
        <span className="hidden sm:inline">{buttonLabel}</span>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 py-0.5 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-16 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[min(24rem,calc(100vw-2rem))]">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-amber-600" />
                  <p className="text-sm font-semibold text-slate-900">
                    {title}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {unreadCount > 0
                    ? `${unreadCount} obligaciones sin leer`
                    : 'Todo al día'}
                </p>
              </div>
              <button
                type="button"
                onClick={refreshAll}
                disabled={isLoading}
                className="rounded-md p-1.5 text-slate-500 transition hover:bg-amber-50 hover:text-slate-900 disabled:opacity-60"
                aria-label={`Actualizar ${title.toLowerCase()}`}
              >
                <RefreshCw
                  className={`size-4 ${isLoading ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>

          {combinedError && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
              <span>{combinedError}</span>
              <button
                type="button"
                onClick={refreshAll}
                className="ml-1 font-medium underline"
              >
                Reintentar
              </button>
            </div>
          )}

          <div className="max-h-[min(32rem,calc(100vh-11rem))] overflow-y-auto">
            {isLoading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Cargando alertas...
              </div>
            ) : statusSections.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto size-8 text-amber-300" />
                <p className="mt-2 text-sm font-medium text-slate-900">
                  No hay alertas activas
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {emptyMessage}
                </p>
              </div>
            ) : (
              statusSections.map((section) => (
                <div key={section.state}>
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {alertStateLabels[section.state]}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">
                      {section.items.length}
                    </span>
                  </div>
                  {getCategorySections(section.items, process).map(
                    (category) => (
                      <div key={category.key}>
                        <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-1.5">
                          <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            {category.label}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">
                            {category.items.length}
                          </span>
                        </div>
                        <ul className="divide-y divide-slate-100">
                          {category.items.length > 0 ? (
                            category.items.map(renderAlertItem)
                          ) : (
                            <li className="px-4 py-2 text-[11px] text-slate-400">
                              Sin alertas activas
                            </li>
                          )}
                        </ul>
                      </div>
                    ),
                  )}
                </div>
              ))
            )}
          </div>

          {items.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2">
              <p className="text-[11px] leading-snug text-slate-500">
                Marcar como leída no completa la obligación; el estado se
                actualiza al registrar la actividad.
              </p>
              <div className="mt-1 flex justify-center">
                <button
                  type="button"
                  onClick={refreshAll}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-amber-50 hover:text-slate-900"
                >
                  <RefreshCw className="size-3.5" />
                  Actualizar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function FollowUpAlertsButton() {
  const feed = useNotificationFeed<FollowUpNotification>({
    load: getNotifications,
    markRead: markNotificationRead,
  })

  return (
    <AlertMenu
      process="FOLLOW_UP"
      title="Seguimiento semestral"
      buttonLabel="Seguimiento"
      emptyMessage="Los vencimientos de seguimiento aparecerán aquí."
      icon={ClipboardCheck}
      notifications={feed.notifications}
      isLoading={feed.isLoading}
      error={feed.error}
      refresh={feed.refresh}
      markRead={markNotificationRead}
      setIsLoading={feed.setIsLoading}
    />
  )
}

export function AnnualUpdatesAlertsButton() {
  const feed = useNotificationFeed<AnnualNotification>({
    load: getAnnualNotifications,
    markRead: markAnnualNotificationRead,
  })

  return (
    <AlertMenu
      process="ANNUAL"
      title="Actualización anual"
      buttonLabel="Actualización"
      emptyMessage="Los vencimientos de actualización anual aparecerán aquí."
      icon={CalendarClock}
      notifications={feed.notifications}
      isLoading={feed.isLoading}
      error={feed.error}
      refresh={feed.refresh}
      markRead={markAnnualNotificationRead}
      setIsLoading={feed.setIsLoading}
    />
  )
}
