import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarX,
  CheckCircle,
  Clock,
  Eye,
  FileSpreadsheet,
  History,
  Layers,
  Loader2,
  RefreshCw,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Pagination } from '../components/Pagination'
import { useAuth } from '../hooks/useAuth'
import {
  getDashboardAttention,
  getDashboardSummary,
} from '../services/dashboard'
import type {
  DashboardAttentionResponse,
  DashboardSummary,
} from '../types/dashboard'
import { getApiErrorMessage } from '../utils/api-error'
import {
  calendarStatusLabels,
  calendarStatusTones,
} from '../utils/counterparty'
import { formatDate, roleLabels } from '../utils/labels'
import { secondaryButtonClass } from '../utils/styles'

const PAGE_SIZE = 8

type ModuleLink = {
  to: string
  title: string
  description: string
  icon: LucideIcon
}

type StatusCard = {
  title: string
  value: number
  hint: string
  icon: LucideIcon
  iconClass: string
  to: string
}

function relativeDateLabel(daysUntilFollowUp: number | null): string {
  if (daysUntilFollowUp === null) {
    return 'Sin fecha programada'
  }

  if (daysUntilFollowUp === 0) {
    return 'Vence hoy'
  }

  if (daysUntilFollowUp === 1) {
    return 'Vence mañana'
  }

  if (daysUntilFollowUp > 1) {
    return `Vence en ${daysUntilFollowUp} días`
  }

  const days = Math.abs(daysUntilFollowUp)
  return `Vencido hace ${days} día${days === 1 ? '' : 's'}`
}

function relativeDateClass(daysUntilFollowUp: number | null): string {
  if (daysUntilFollowUp === null) {
    return 'text-slate-500'
  }

  if (daysUntilFollowUp < 0) {
    return 'text-red-600'
  }

  if (daysUntilFollowUp <= 15) {
    return 'text-amber-600'
  }

  return 'text-slate-500'
}

export function HomePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState('')

  const [attention, setAttention] =
    useState<DashboardAttentionResponse | null>(null)
  const [attentionLoading, setAttentionLoading] = useState(true)
  const [attentionError, setAttentionError] = useState('')
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    getDashboardSummary()
      .then((data) => {
        if (!active) {
          return
        }

        setSummary(data)
        setSummaryError('')
      })
      .catch((loadError) => {
        if (active) {
          setSummaryError(
            getApiErrorMessage(
              loadError,
              'No fue posible cargar los indicadores',
            ),
          )
        }
      })
      .finally(() => {
        if (active) {
          setSummaryLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [refreshKey])

  useEffect(() => {
    let active = true

    getDashboardAttention(page, PAGE_SIZE)
      .then((data) => {
        if (!active) {
          return
        }

        setAttention(data)
        setAttentionError('')

        if (
          data.meta.totalPages > 0 &&
          data.meta.page > data.meta.totalPages
        ) {
          setPage(data.meta.totalPages)
        }
      })
      .catch((loadError) => {
        if (active) {
          setAttentionError(
            getApiErrorMessage(
              loadError,
              'No fue posible cargar las contrapartes que requieren atención',
            ),
          )
        }
      })
      .finally(() => {
        if (active) {
          setAttentionLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [page, refreshKey])

  const refresh = () => {
    setSummaryLoading(true)
    setAttentionLoading(true)
    setPage(1)
    setRefreshKey((value) => value + 1)
  }

  const handlePageChange = (nextPage: number) => {
    setAttentionLoading(true)
    setPage(nextPage)
  }

  const isRefreshing = summaryLoading || attentionLoading
  const totalCalendar = summary
    ? summary.calendar.overdue +
      summary.calendar.pending +
      summary.calendar.upcoming +
      summary.calendar.onTime +
      summary.calendar.unscheduled
    : 0

  const statusCards: StatusCard[] = summary
    ? [
        {
          title: 'Contrapartes activas',
          value: summary.counterparties.active,
          hint: `${summary.counterparties.archived} archivadas`,
          icon: Building2,
          iconClass: 'bg-slate-900 text-white',
          to: '/contrapartes?status=ACTIVE',
        },
        {
          title: 'Vencidas',
          value: summary.calendar.overdue,
          hint: 'Fecha anterior a hoy',
          icon: AlertTriangle,
          iconClass: 'bg-red-50 text-red-600',
          to: '/contrapartes?calendarStatus=OVERDUE',
        },
        {
          title: 'Pendientes 0–15 días',
          value: summary.calendar.pending,
          hint: 'Seguimientos próximos',
          icon: Clock,
          iconClass: 'bg-amber-50 text-amber-600',
          to: '/contrapartes?calendarStatus=PENDING',
        },
        {
          title: 'Próximas 16–30 días',
          value: summary.calendar.upcoming,
          hint: 'Siguiente rango',
          icon: Calendar,
          iconClass: 'bg-blue-50 text-blue-600',
          to: '/contrapartes?calendarStatus=UPCOMING',
        },
        {
          title: 'Al día',
          value: summary.calendar.onTime,
          hint: 'Más de 30 días',
          icon: CheckCircle,
          iconClass: 'bg-emerald-50 text-emerald-600',
          to: '/contrapartes?calendarStatus=ON_TIME',
        },
        {
          title: 'Sin programar',
          value: summary.calendar.unscheduled,
          hint: 'Sin fecha de seguimiento',
          icon: CalendarX,
          iconClass: 'bg-slate-100 text-slate-600',
          to: '/contrapartes?calendarStatus=UNSCHEDULED',
        },
      ]
    : []

  const calendarDistribution = summary
    ? [
        {
          label: 'Vencidas',
          value: summary.calendar.overdue,
          color: 'bg-red-500',
        },
        {
          label: 'Pendientes 0–15',
          value: summary.calendar.pending,
          color: 'bg-amber-500',
        },
        {
          label: 'Próximas 16–30',
          value: summary.calendar.upcoming,
          color: 'bg-blue-500',
        },
        {
          label: 'Al día',
          value: summary.calendar.onTime,
          color: 'bg-emerald-500',
        },
        {
          label: 'Sin programar',
          value: summary.calendar.unscheduled,
          color: 'bg-slate-400',
        },
      ]
    : []

  const modules: ModuleLink[] = [
    {
      to: '/contrapartes',
      title: 'Contrapartes',
      description:
        'Consulte el calendario semestral, filtre por estado y administre el registro de contrapartes.',
      icon: Building2,
    },
    {
      to: '/actualizacion-anual',
      title: 'Actualización anual',
      description:
        'Consulte las contrapartes activas e inactivas y su estado de actualización anual. No genera alertas.',
      icon: CalendarCheck,
    },
    ...(isAdmin
      ? [
          {
            to: '/subprocesos',
            title: 'Subprocesos',
            description:
              'Administre el catálogo de subprocesos que se asigna a las contrapartes.',
            icon: Layers,
          },
          {
            to: '/importar',
            title: 'Importar Excel',
            description:
              'Cargue archivos .xlsx o .xlsm, valide el mapeo y confirme la importación de contrapartes.',
            icon: FileSpreadsheet,
          },
          {
            to: '/auditoria',
            title: 'Auditoría',
            description:
              'Consulte las acciones críticas con filtros por usuario, entidad y tipo de acción.',
            icon: History,
          },
          {
            to: '/usuarios',
            title: 'Usuarios',
            description:
              'Cree cuentas, asigne roles y controle el acceso al sistema.',
            icon: Users,
          },
        ]
      : []),
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Panel de control
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Hola, {user?.name}. Sesión iniciada como{' '}
            {user ? roleLabels[user.role] : ''}.
            {summary
              ? ` Corte al ${formatDate(summary.businessDate)}.`
              : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isRefreshing}
          className={secondaryButtonClass}
        >
          <RefreshCw
            className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          Actualizar
        </button>
      </div>

      {summaryError && (
        <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <p>{summaryError}</p>
          <button
            type="button"
            onClick={refresh}
            className="font-medium underline underline-offset-2"
          >
            Reintentar
          </button>
        </div>
      )}

      {!summary && summaryLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {statusCards.map(
            ({ title, value, hint, icon: Icon, iconClass, to }) => (
              <Link
                key={title}
                to={to}
                className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`flex size-9 items-center justify-center rounded-lg ${iconClass}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                </div>
                <p className="mt-4 text-2xl font-semibold text-slate-900">
                  {value}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {title}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
              </Link>
            ),
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Requieren atención
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Contrapartes vencidas, pendientes o sin programar.
              </p>
            </div>
            {attention && attention.meta.total > 0 && (
              <Badge tone="amber">{attention.meta.total} por atender</Badge>
            )}
          </div>

          {attentionError && (
            <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
              {attentionError}
            </div>
          )}

          {!attention && attentionLoading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Cargando contrapartes
            </div>
          ) : attention && attention.data.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <CheckCircle className="mx-auto size-8 text-emerald-500" />
              <p className="mt-3 text-sm font-medium text-slate-700">
                No hay contrapartes que requieran atención
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Todas las contrapartes activas tienen seguimientos
                programados fuera del rango de 15 días.
              </p>
            </div>
          ) : attention ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Contraparte</th>
                    <th className="px-4 py-3 font-medium">Subproceso</th>
                    <th className="px-4 py-3 font-medium">
                      Próximo seguimiento
                    </th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attention.data.map((item) => (
                    <tr
                      key={item.id}
                      className="transition hover:bg-slate-50"
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">
                          {item.businessName}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          NIT {item.nit}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {item.subprocess.name}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {formatDate(item.nextFollowUpDate)}
                        </p>
                        <p
                          className={`mt-0.5 text-xs ${relativeDateClass(
                            item.daysUntilFollowUp,
                          )}`}
                        >
                          {relativeDateLabel(item.daysUntilFollowUp)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            calendarStatusTones[item.calendarStatus]
                          }
                        >
                          {calendarStatusLabels[item.calendarStatus]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/contrapartes/${item.id}`}
                          className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          aria-label={`Ver ${item.businessName}`}
                        >
                          <Eye className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {attention && (
            <Pagination
              page={attention.meta.page}
              totalPages={attention.meta.totalPages}
              total={attention.meta.total}
              onPageChange={handlePageChange}
            />
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Resumen operativo
            </h2>
            <dl className="mt-4 divide-y divide-slate-100">
              <div className="flex items-center justify-between py-3 first:pt-0">
                <dt className="text-sm text-slate-600">
                  Seguimientos en borrador
                </dt>
                <dd className="text-sm font-semibold text-slate-900">
                  {summary?.followUps.drafts ?? '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-slate-600">
                  Finalizados este mes
                </dt>
                <dd className="text-sm font-semibold text-slate-900">
                  {summary?.followUps.finalizedThisMonth ?? '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-slate-600">
                  Subprocesos activos
                </dt>
                <dd className="text-sm font-semibold text-slate-900">
                  {summary?.subprocesses.active ?? '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between py-3 last:pb-0">
                <dt className="text-sm text-slate-600">
                  Contrapartes archivadas
                </dt>
                <dd className="text-sm font-semibold text-slate-900">
                  {summary?.counterparties.archived ?? '—'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Distribución del calendario
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {summary
                ? `${summary.counterparties.active} contrapartes activas`
                : 'Cargando indicadores'}
            </p>

            {summary && totalCalendar > 0 ? (
              <>
                <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-100">
                  {calendarDistribution.map(
                    ({ label, value, color }) =>
                      value > 0 && (
                        <div
                          key={label}
                          className={color}
                          style={{
                            width: `${(value / totalCalendar) * 100}%`,
                          }}
                          title={`${label}: ${value}`}
                        />
                      ),
                  )}
                </div>
                <ul className="mt-4 space-y-2">
                  {calendarDistribution.map(({ label, value, color }) => (
                    <li
                      key={label}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="flex items-center gap-2 text-slate-600">
                        <span
                          className={`size-2.5 rounded-full ${color}`}
                        />
                        {label}
                      </span>
                      <span className="font-medium text-slate-900">
                        {value}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                No hay contrapartes activas registradas.
              </p>
            )}
          </section>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">
          Accesos rápidos
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Consulte y administre las contrapartes del área. Las
          notificaciones de vencimiento están disponibles en la campana
          superior.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {modules.map(({ to, title, description, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-lg border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-md bg-slate-900 text-white">
                  <Icon className="size-4" />
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {title}
                </span>
                <ArrowRight className="ml-auto size-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
              </div>
              <p className="mt-3 text-sm text-slate-600">{description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
