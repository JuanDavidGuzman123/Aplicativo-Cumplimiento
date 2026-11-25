import {
  ArrowUpRight,
  Bell,
  CalendarClock,
  CheckCheck,
  ClipboardCheck,
  Loader2,
  RefreshCw,
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
  AnnualNotification,
  FollowUpNotification,
  NotificationProcess,
  NotificationSource,
} from '../types/notification'
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

type AlertTab = 'all' | 'follow-up' | 'annual'

type AlertItem = AlertGroup

const tabs: { id: AlertTab; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'follow-up', label: 'Seguimiento' },
  { id: 'annual', label: 'Anual' },
]

const statusOrder: AlertState[] = [
  'OVERDUE',
  'DUE_SOON',
  'PENDING',
  'COMPLETED',
]

const processOrder: NotificationProcess[] = [
  'FOLLOW_UP',
  'ANNUAL',
]

const sourceOrder: NotificationSource[] = [
  'arriendos',
  'clientes',
  'colocadores',
]

function getCategorySections(
  items: AlertItem[],
  includeEmpty = false,
) {
  return processOrder
    .flatMap((process) =>
      sourceOrder.map((source) => ({
        key: `${process}:${source}`,
        process,
        label: `${notificationProcessLabels[process]} · ${notificationSourceLabels[source]}`,
        items: items.filter(
          (item) =>
            item.process === process && item.source === source,
        ),
      })),
    )
    .filter(
      (section) =>
        section.items.length > 0 ||
        (includeEmpty && section.process === 'FOLLOW_UP'),
    )
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

export function AlertCenter() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<AlertTab>('all')
  const [markingGroupKey, setMarkingGroupKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const followUpFeed = useNotificationFeed<FollowUpNotification>({
    load: getNotifications,
    markRead: markNotificationRead,
  })
  const annualFeed = useNotificationFeed<AnnualNotification>({
    load: getAnnualNotifications,
    markRead: markAnnualNotificationRead,
  })
  const followUpNotifications = followUpFeed.notifications
  const annualNotifications = annualFeed.notifications

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

  const items = useMemo<AlertItem[]>(
    () =>
      buildAlertGroups([...followUpNotifications, ...annualNotifications]),
    [annualNotifications, followUpNotifications],
  )

  const counts = useMemo(
    () => ({
      all: items.filter((item) => !item.read).length,
      'follow-up': items.filter(
        (item) => item.process === 'FOLLOW_UP' && !item.read,
      ).length,
      annual: items.filter(
        (item) => item.process === 'ANNUAL' && !item.read,
      ).length,
    }),
    [items],
  )

  const statusSections = useMemo(
    () =>
      statusOrder
        .map((state) => ({
          state,
          items: items.filter(
            (item) =>
              item.state === state &&
              (tab === 'all' ||
                (tab === 'follow-up'
                  ? item.process === 'FOLLOW_UP'
                  : item.process === 'ANNUAL')),
          ),
        }))
        .filter((section) => section.items.length > 0),
    [items, tab],
  )

  const totalUnread = counts.all
  const isLoading =
    followUpFeed.isLoading || annualFeed.isLoading
  const error = [followUpFeed.error, annualFeed.error, actionError]
    .filter(Boolean)
    .join(' ')

  const refreshAll = () => {
    followUpFeed.setIsLoading(true)
    annualFeed.setIsLoading(true)
    void followUpFeed.refresh()
    void annualFeed.refresh()
  }

  const markGroupAsRead = async (
    item: AlertItem,
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
          .map((member) =>
            member.process === 'FOLLOW_UP'
              ? markNotificationRead(member.id)
              : markAnnualNotificationRead(member.id),
          ),
      )
      await Promise.all([followUpFeed.refresh(), annualFeed.refresh()])

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

  const renderAlertItem = (item: AlertItem) => {
    const style = stateStyles[item.state]
    const isMarking = markingGroupKey === item.key

    return (
      <li
        key={item.key}
        className={`border-l-4 ${style.border} ${style.row}`}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <span className={`mt-0.5 ${style.icon}`}>
            {item.process === 'FOLLOW_UP' ? (
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
                {item.obligationLabel} · {item.categoryLabel}
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
        className="relative rounded-md p-2 text-slate-600 transition hover:bg-amber-50 hover:text-slate-900"
        aria-label={
          totalUnread > 0
            ? `Alertas, ${totalUnread} sin leer`
            : 'Alertas'
        }
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {totalUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 py-0.5 text-[10px] font-semibold leading-none text-white">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Alertas
                </p>
                <p className="text-xs text-slate-500">
                  {totalUnread > 0
                    ? `${totalUnread} obligaciones sin leer`
                    : 'Todo al día'}
                </p>
              </div>
              <button
                type="button"
                onClick={refreshAll}
                disabled={isLoading}
                className="rounded-md p-1.5 text-slate-500 transition hover:bg-amber-50 hover:text-slate-900 disabled:opacity-60"
                aria-label="Actualizar alertas"
              >
                <RefreshCw
                  className={`size-4 ${isLoading ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`truncate rounded-md px-2 py-1 text-xs font-medium transition ${
                    tab === item.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:bg-white/60'
                  }`}
                >
                  {item.label}
                  {counts[item.id] > 0 && (
                    <span className="ml-1.5 font-semibold">
                      {counts[item.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
              <span>{error}</span>
              <button
                type="button"
                onClick={refreshAll}
                className="ml-1 font-medium underline"
              >
                Reintentar
              </button>
            </div>
          )}

          <div className="max-h-[min(32rem,calc(100vh-7rem))] overflow-y-auto">
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
                  Los vencimientos aparecerán aquí.
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
                  {getCategorySections(
                    section.items,
                    tab === 'follow-up',
                  ).map((category) => (
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
                  ))}
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
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-amber-50"
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
