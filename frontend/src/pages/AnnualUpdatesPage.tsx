import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Building2,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, type BadgeTone } from '../components/Badge'
import { ExternalDataStatusBadge } from '../components/ExternalDataStatusBadge'
import { Pagination } from '../components/Pagination'
import { useExternalDataEvents } from '../hooks/useExternalDataEvents'
import {
  getExternalSummary,
  getExternalUpdates,
  getExternalUpdatesDue,
  syncExternalData,
} from '../services/external-data'
import type {
  ExternalAnnualStatus as AnnualStatus,
  ExternalDueListResponse as AnnualUpdatesDueResponse,
  ExternalListParams as AnnualUpdateListParams,
  ExternalAnnualListResponse as AnnualUpdateListResponse,
  ExternalReminderType as AnnualReminderType,
  ExternalSummary as AnnualUpdateSummary,
  ExternalUpdateFilter as AnnualUpdateFilter,
  ExternalUpdateSituation as AnnualUpdateSituation,
} from '../types/external-data'
import { getApiErrorMessage } from '../utils/api-error'
import { formatDate } from '../utils/labels'
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../utils/styles'

const PAGE_SIZE = 15
const DUE_PAGE_SIZE = 10

const annualStatusLabels: Record<AnnualStatus, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
}

const annualStatusTones: Record<AnnualStatus, BadgeTone> = {
  ACTIVE: 'green',
  INACTIVE: 'slate',
}

const updateFilterLabels: Record<AnnualUpdateFilter, string> = {
  UPDATED_THIS_YEAR: 'Actualizado este año',
  PENDING: 'Pendiente de actualizar',
  NO_DATE: 'Sin fecha ni año',
}

const updateFilterTones: Record<AnnualUpdateFilter, BadgeTone> = {
  UPDATED_THIS_YEAR: 'green',
  PENDING: 'amber',
  NO_DATE: 'slate',
}

const annualSituationLabels: Record<
  AnnualUpdateSituation,
  string
> = {
  WITHOUT_DATE: 'Sin fecha',
  OVERDUE: 'Vencido',
  DUE_TODAY: 'Vence hoy',
  DUE_SOON: 'Por vencer',
  NOT_DUE: 'Al día',
}

const annualSituationTones: Record<
  AnnualUpdateSituation,
  BadgeTone
> = {
  WITHOUT_DATE: 'slate',
  OVERDUE: 'red',
  DUE_TODAY: 'amber',
  DUE_SOON: 'blue',
  NOT_DUE: 'green',
}

const annualReminderLabels: Record<
  AnnualReminderType,
  string
> = {
  ANNUAL_D15: '15 días',
  ANNUAL_D10: '10 días',
  ANNUAL_D5: '5 días',
}

type StatCard = {
  label: string
  value: number
  hint: string
  icon: LucideIcon
  iconClass: string
}

function formatFollowUp(value: boolean | null): string {
  if (value === null) {
    return '—'
  }

  return value ? 'Sí' : 'No'
}

function formatDays(days: number | null): string {
  if (days === null) {
    return '—'
  }

  if (days < 0) {
    return `${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'} vencido${Math.abs(days) === 1 ? '' : 's'}`
  }

  if (days === 0) {
    return 'Hoy'
  }

  return `${days} día${days === 1 ? '' : 's'}`
}

export function AnnualUpdatesPage() {
  const [searchParams] = useSearchParams()
  const codeFromNotification = searchParams.get('code') ?? ''
  const [fallbackYear] = useState(() =>
    new Date().getFullYear(),
  )

  const [summary, setSummary] = useState<AnnualUpdateSummary | null>(
    null,
  )
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState('')
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0)

  const [list, setList] =
    useState<AnnualUpdateListResponse | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [listRefreshKey, setListRefreshKey] = useState(0)
  const [page, setPage] = useState(1)

  const [due, setDue] = useState<AnnualUpdatesDueResponse | null>(
    null,
  )
  const [dueLoading, setDueLoading] = useState(true)
  const [dueError, setDueError] = useState('')
  const [dueRefreshKey, setDueRefreshKey] = useState(0)
  const [duePage, setDuePage] = useState(1)

  const [searchDraft, setSearchDraft] = useState(
    codeFromNotification,
  )
  const [filters, setFilters] = useState<AnnualUpdateListParams>({
    search: codeFromNotification,
    status: '',
    annualStatus: '',
    requiresSemiannualFollowUp: '',
  })

  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')

  const refreshSummary = () => {
    setSummaryLoading(true)
    setSummaryRefreshKey((value) => value + 1)
  }

  const refreshList = () => {
    setListLoading(true)
    setListRefreshKey((value) => value + 1)
  }

  const refreshDue = () => {
    setDueLoading(true)
    setDueRefreshKey((value) => value + 1)
  }

  const refreshAll = () => {
    refreshSummary()
    refreshList()
    refreshDue()
  }

  const {
    status: externalStatus,
    setStatus: setExternalStatus,
    connected,
  } = useExternalDataEvents(refreshAll)

  useEffect(() => {
    let active = true

    getExternalSummary()
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
              'No fue posible cargar el resumen anual externo',
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
  }, [summaryRefreshKey])

  useEffect(() => {
    let active = true

    getExternalUpdates({
      ...filters,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((data) => {
        if (!active) {
          return
        }

        setList(data)
        setExternalStatus(data.status)
        setListError('')
      })
      .catch((loadError) => {
        if (active) {
          setListError(
            getApiErrorMessage(
              loadError,
              'No fue posible cargar los puntos de venta anuales externos',
            ),
          )
        }
      })
      .finally(() => {
        if (active) {
          setListLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [filters, page, listRefreshKey, setExternalStatus])

  useEffect(() => {
    let active = true

    getExternalUpdatesDue({
      page: duePage,
      pageSize: DUE_PAGE_SIZE,
    })
      .then((data) => {
        if (!active) {
          return
        }

        setDue(data)
        setExternalStatus(data.status)
        setDueError('')
      })
      .catch((loadError) => {
        if (active) {
          setDueError(
            getApiErrorMessage(
              loadError,
              'No fue posible cargar las actualizaciones próximas a vencer',
            ),
          )
        }
      })
      .finally(() => {
        if (active) {
          setDueLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [duePage, dueRefreshKey, setExternalStatus])

  const currentYear = summary?.currentYear ?? fallbackYear
  const minimumDueYear = currentYear - 1

  const statCards: StatCard[] = summary
    ? [
        {
          label: 'Puntos de venta activos',
          value: summary.totals.active,
          hint: `${summary.totals.inactive} inactivos`,
          icon: Building2,
          iconClass: 'bg-slate-900 text-white',
        },
        {
          label: 'Puntos de venta inactivos',
          value: summary.totals.inactive,
          hint: 'Solo para conteo',
          icon: Ban,
          iconClass: 'bg-slate-100 text-slate-600',
        },
        {
          label: `Actualizados en ${currentYear}`,
          value: summary.annual.updatedThisYear,
          hint: `${summary.annual.active.updatedThisYear} activos / ${summary.annual.inactive.updatedThisYear} inactivos`,
          icon: CalendarCheck,
          iconClass: 'bg-emerald-50 text-emerald-600',
        },
        {
          label: 'Pendientes de actualizar',
          value: summary.annual.active.pendingUpdate,
          hint: `Diligenciamiento desde ${minimumDueYear}`,
          icon: CalendarClock,
          iconClass: 'bg-amber-50 text-amber-600',
        },
        {
          label: 'Contrapartes en seguimiento',
          value: summary.semiannual.totalWithFollowUp,
          hint: `${summary.semiannual.activeWithFollowUp} activos / ${summary.semiannual.inactiveWithFollowUp} inactivos`,
          icon: Users,
          iconClass: 'bg-blue-50 text-blue-600',
        },
      ]
    : []

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setListLoading(true)
    setPage(1)
    setFilters((current) => ({
      ...current,
      search: searchDraft.trim(),
    }))
  }

  const handleFilterChange = (
    field: 'status' | 'annualStatus' | 'requiresSemiannualFollowUp',
    value: string,
  ) => {
    const nextValue =
      field === 'requiresSemiannualFollowUp'
        ? value === ''
          ? ''
          : value === 'true'
        : value

    setListLoading(true)
    setPage(1)
    setFilters((current) => ({
      ...current,
      [field]: nextValue,
    }))
  }

  const handleClearFilters = () => {
    setListLoading(true)
    setSearchDraft('')
    setPage(1)
    setFilters({
      search: '',
      status: '',
      annualStatus: '',
      requiresSemiannualFollowUp: '',
    })
  }

  const handleManualSync = async () => {
    setSyncing(true)
    setSyncError('')

    try {
      const nextStatus = await syncExternalData()
      setExternalStatus(nextStatus)
      refreshAll()
    } catch (syncFailure) {
      setSyncError(
        getApiErrorMessage(
          syncFailure,
          'No fue posible sincronizar el libro externo',
        ),
      )
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Actualización anual
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Consulte el estado de la actualización anual de los puntos
            de venta y sus vencimientos desde el libro externo. Este
            proceso es independiente del seguimiento semestral.
          </p>
        </div>
        <ExternalDataStatusBadge
          status={externalStatus}
          connected={connected}
          syncing={syncing}
          onSync={() => {
            void handleManualSync()
          }}
        />
      </div>

      {syncError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          <span>{syncError}</span>
        </div>
      )}

      {summaryError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          <span>{summaryError}</span>
        </div>
      )}

      {summaryLoading && !summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {statCards.map(
            ({ label, value, hint, icon: Icon, iconClass }) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <span
                  className={`flex size-9 items-center justify-center rounded-lg ${iconClass}`}
                >
                  <Icon className="size-4" />
                </span>
                <p className="mt-4 text-2xl font-semibold text-slate-900">
                  {value}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {label}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {hint}
                </p>
              </div>
            ),
          )}
        </div>
      )}

      {summary && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p className="font-medium">
            Corte al {formatDate(summary.businessDate)} · Año{' '}
            {summary.currentYear}
          </p>
          <p className="mt-1 text-xs">
            Los puntos de venta inactivos se incluyen únicamente en
            los conteos. Los pendientes corresponden a puntos de
            venta activos sin actualización registrada en el año.
          </p>
        </div>
      )}

      {dueError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          <span>{dueError}</span>
        </div>
      )}

      <section className="rounded-xl border border-amber-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
              <CalendarClock className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Actualizaciones por vencer y vencidas
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Solo contrapartes activas con diligenciamiento desde{' '}
                {minimumDueYear}. La fecha límite es la fecha de
                diligenciamiento más un año; los recordatorios se envían
                a los 15, 10 y 5 días.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={refreshDue}
            disabled={dueLoading}
            className={secondaryButtonClass}
          >
            <RefreshCw
              className={`size-4 ${
                dueLoading ? 'animate-spin' : ''
              }`}
            />
            Actualizar
          </button>
        </div>

        {due && (
          <div className="grid grid-cols-2 gap-3 border-b border-slate-200 p-5 lg:grid-cols-4">
            {[
              [
                'Necesitan actualización',
                due.summary.needsUpdate,
              ],
              ['Vencidas', due.summary.overdue],
              ['Vencen hoy', due.summary.dueToday],
              ['Por vencer', due.summary.upcoming],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg bg-slate-50 p-3"
              >
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}

        {dueLoading && !due ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Cargando vencimientos anuales...
          </div>
        ) : !due || due.data.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="mx-auto size-8 text-emerald-500" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              No hay vencimientos anuales próximos
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Las contrapartes activas con fecha registrada
              aparecerán aquí 15 días antes del vencimiento.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[760px] divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Fecha límite</th>
                    <th className="px-4 py-3">Días</th>
                    <th className="px-4 py-3">Situación</th>
                    <th className="px-4 py-3">Alerta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {due.data.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.code}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.businessName}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDate(row.dueDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDays(row.daysUntilDue)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            annualSituationTones[row.situation]
                          }
                        >
                          {
                            annualSituationLabels[
                              row.situation
                            ]
                          }
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {row.reminderType
                          ? annualReminderLabels[row.reminderType]
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={due.meta.page}
              totalPages={due.meta.totalPages}
              total={due.meta.total}
              onPageChange={(nextPage) => {
                setDueLoading(true)
                setDuePage(nextPage)
              }}
            />
          </>
        )}
      </section>


      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Puntos de venta anuales
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Consulte el estado anual y el seguimiento registrado
              en el libro externo.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshList}
            disabled={listLoading}
            className={secondaryButtonClass}
          >
            <RefreshCw
              className={`size-4 ${
                listLoading ? 'animate-spin' : ''
              }`}
            />
            Actualizar
          </button>
        </div>

        <form
          onSubmit={handleFilterSubmit}
          className="grid gap-4 border-b border-slate-200 p-5 sm:grid-cols-2 lg:grid-cols-5"
        >
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="annual-search">
              Buscar
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                id="annual-search"
                type="search"
                value={searchDraft}
                onChange={(event) =>
                  setSearchDraft(event.target.value)
                }
                placeholder="Código o nombre"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="annual-status">
              Estado
            </label>
            <select
              id="annual-status"
              value={filters.status ?? ''}
              onChange={(event) =>
                handleFilterChange('status', event.target.value)
              }
              className={inputClass}
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Activas</option>
              <option value="INACTIVE">Inactivas</option>
            </select>
          </div>

          <div>
            <label
              className={labelClass}
              htmlFor="annual-update-status"
            >
              Actualización
            </label>
            <select
              id="annual-update-status"
              value={filters.annualStatus ?? ''}
              onChange={(event) =>
                handleFilterChange(
                  'annualStatus',
                  event.target.value,
                )
              }
              className={inputClass}
            >
              <option value="">Todas</option>
              <option value="UPDATED_THIS_YEAR">
                Actualizados este año
              </option>
              <option value="PENDING">
                Pendientes de actualizar
              </option>
              <option value="NO_DATE">Sin fecha</option>
            </select>
          </div>

          <div>
            <label
              className={labelClass}
              htmlFor="annual-follow-up"
            >
              Seguimiento
            </label>
            <select
              id="annual-follow-up"
              value={
                filters.requiresSemiannualFollowUp === ''
                  ? ''
                  : filters.requiresSemiannualFollowUp
                    ? 'true'
                    : 'false'
              }
              onChange={(event) =>
                handleFilterChange(
                  'requiresSemiannualFollowUp',
                  event.target.value,
                )
              }
              className={inputClass}
            >
              <option value="">Todos</option>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <button
              type="submit"
              className={primaryButtonClass}
            >
              <Search className="size-4" />
              Buscar
            </button>
            <button
              type="button"
              onClick={handleClearFilters}
              className={secondaryButtonClass}
            >
              Limpiar filtros
            </button>
          </div>
        </form>

        {listError && (
          <div className="m-5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <XCircle className="mt-0.5 size-4 shrink-0" />
            <span>{listError}</span>
          </div>
        )}

        {listLoading && !list ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Cargando puntos de venta...
          </div>
        ) : !list || list.data.length === 0 ? (
          <div className="p-10 text-center">
            <AlertTriangle className="mx-auto size-8 text-amber-500" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              No hay puntos de venta para mostrar
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Verifique la configuración y sincronización del libro
              externo para comenzar.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Año</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Seguimiento</th>
                    <th className="px-4 py-3">Observaciones</th>
                    <th className="px-4 py-3">Estado anual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.data.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.code}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.businessName}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={annualStatusTones[row.status]}
                        >
                          {annualStatusLabels[row.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDate(row.filingDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.filingYear ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.dueDiligenceType ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.requiresSemiannualFollowUp === null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <Badge
                            tone={
                              row.requiresSemiannualFollowUp
                                ? 'blue'
                                : 'slate'
                            }
                          >
                            {formatFollowUp(
                              row.requiresSemiannualFollowUp,
                            )}
                          </Badge>
                        )}
                      </td>
                      <td className="w-[420px] px-4 py-3 align-top text-slate-700">
                        <span className="block whitespace-pre-wrap break-words leading-relaxed">
                          {row.observations ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            updateFilterTones[row.annualStatus]
                          }
                        >
                          {updateFilterLabels[row.annualStatus]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={list.meta.page}
              totalPages={list.meta.totalPages}
              total={list.meta.total}
              onPageChange={(nextPage) => {
                setListLoading(true)
                setPage(nextPage)
              }}
            />
          </>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <ArrowRight className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Proceso independiente
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Los datos se leen desde el libro externo y no se escriben
              de vuelta en él. La actualización anual genera
              recordatorios propios y no modifica las fechas del
              calendario semestral; la marca de seguimiento solo se
              muestra para consulta en este módulo.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
