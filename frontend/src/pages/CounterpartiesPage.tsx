import {
  Archive,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { CounterpartyFormModal } from '../components/CounterpartyFormModal'
import { CounterpartyStatusModal } from '../components/CounterpartyStatusModal'
import { Pagination } from '../components/Pagination'
import { useAuth } from '../hooks/useAuth'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import {
  getCounterparties,
  getCounterparty,
} from '../services/counterparties'
import { getSubprocesses } from '../services/subprocesses'
import type {
  CalendarStatus,
  CounterpartyDetail,
  CounterpartyListItem,
  CounterpartyListResponse,
  CounterpartyStatus,
} from '../types/counterparty'
import type { Subprocess } from '../types/subprocess'
import { getApiErrorMessage } from '../utils/api-error'
import {
  calendarStatusLabels,
  calendarStatusTones,
  counterpartyStatusLabels,
} from '../utils/counterparty'
import { formatDate } from '../utils/labels'
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../utils/styles'

const PAGE_SIZE = 10

function isCalendarStatus(value: string | null): value is CalendarStatus {
  return (
    value === 'OVERDUE' ||
    value === 'PENDING' ||
    value === 'UPCOMING' ||
    value === 'ON_TIME' ||
    value === 'UNSCHEDULED'
  )
}

function isCounterpartyStatus(
  value: string | null,
): value is CounterpartyStatus {
  return value === 'ACTIVE' || value === 'ARCHIVED'
}

type StatusTarget = {
  counterparty: CounterpartyListItem
  mode: 'archive' | 'reactivate'
}

export function CounterpartiesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [searchParams] = useSearchParams()
  const calendarStatusFromUrl = searchParams.get('calendarStatus')
  const counterpartyStatusFromUrl = searchParams.get('status')

  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebouncedValue(searchTerm)
  const [subprocessFilter, setSubprocessFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    CounterpartyStatus | ''
  >(
    isCounterpartyStatus(counterpartyStatusFromUrl)
      ? counterpartyStatusFromUrl
      : '',
  )
  const [calendarFilter, setCalendarFilter] = useState<
    CalendarStatus | ''
  >(
    isCalendarStatus(calendarStatusFromUrl)
      ? calendarStatusFromUrl
      : '',
  )
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)

  const [result, setResult] =
    useState<CounterpartyListResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [subprocesses, setSubprocesses] = useState<Subprocess[]>([])
  const [subprocessesLoading, setSubprocessesLoading] = useState(true)
  const [subprocessError, setSubprocessError] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<CounterpartyDetail | null>(
    null,
  )
  const [loadingEditId, setLoadingEditId] = useState<string | null>(
    null,
  )
  const [statusTarget, setStatusTarget] = useState<StatusTarget | null>(
    null,
  )

  const loadSubprocesses = useCallback(async () => {
    try {
      setSubprocesses(await getSubprocesses())
      setSubprocessError('')
    } catch (loadError) {
      setSubprocessError(
        getApiErrorMessage(
          loadError,
          'No fue posible cargar los subprocesos',
        ),
      )
    } finally {
      setSubprocessesLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    getSubprocesses()
      .then((data) => {
        if (active) {
          setSubprocesses(data)
        }
      })
      .catch((loadError) => {
        if (active) {
          setSubprocessError(
            getApiErrorMessage(
              loadError,
              'No fue posible cargar los subprocesos',
            ),
          )
        }
      })
      .finally(() => {
        if (active) {
          setSubprocessesLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    getCounterparties({
      search: debouncedSearch.trim() || undefined,
      subprocessId: subprocessFilter || undefined,
      status: statusFilter || undefined,
      calendarStatus: calendarFilter || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((data) => {
        if (!active) {
          return
        }

        setResult(data)
        setError('')

        if (
          data.meta.totalPages > 0 &&
          data.meta.page > data.meta.totalPages
        ) {
          setPage(data.meta.totalPages)
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(
            getApiErrorMessage(
              loadError,
              'No fue posible cargar las contrapartes',
            ),
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [
    debouncedSearch,
    subprocessFilter,
    statusFilter,
    calendarFilter,
    page,
    refreshKey,
  ])

  useEffect(() => {
    if (!success) {
      return
    }

    const timeout = window.setTimeout(() => setSuccess(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [success])

  const activeSubprocesses = useMemo(
    () => subprocesses.filter((subprocess) => subprocess.active),
    [subprocesses],
  )

  const hasFilters = Boolean(
    searchTerm.trim() ||
      subprocessFilter ||
      statusFilter ||
      calendarFilter,
  )

  const refresh = () => setRefreshKey((value) => value + 1)

  const handleSaved = (message: string) => {
    setError('')
    setSuccess(message)
    refresh()
  }

  const clearFilters = () => {
    setSearchTerm('')
    setSubprocessFilter('')
    setStatusFilter('')
    setCalendarFilter('')
    setPage(1)
  }

  const openEdit = async (id: string) => {
    setLoadingEditId(id)
    setError('')

    try {
      setEditing(await getCounterparty(id))
    } catch (loadError) {
      setError(
        getApiErrorMessage(
          loadError,
          'No fue posible cargar la contraparte',
        ),
      )
    } finally {
      setLoadingEditId(null)
    }
  }

  const total = result?.meta.total ?? 0
  const totalPages = result?.meta.totalPages ?? 0
  const canCreate = activeSubprocesses.length > 0

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Contrapartes
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Consulte el calendario semestral y administre las
            contrapartes del área.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={!canCreate}
            title={
              canCreate
                ? undefined
                : 'Debe existir al menos un subproceso activo'
            }
            className={primaryButtonClass}
          >
            <Plus className="size-4" />
            Nueva contraparte
          </button>
        )}
      </div>

      {isAdmin && !subprocessesLoading && !canCreate && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No hay subprocesos activos.{' '}
          <Link
            to="/subprocesos"
            className="font-medium underline underline-offset-2"
          >
            Cree o active un subproceso
          </Link>{' '}
          antes de registrar contrapartes.
        </div>
      )}

      {subprocessError && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{subprocessError}</span>
          <button
            type="button"
            onClick={() => {
              setSubprocessesLoading(true)
              setSubprocessError('')
              void loadSubprocesses()
            }}
            className="self-start rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 sm:self-auto"
          >
            Reintentar
          </button>
        </div>
      )}

      {error && (
        <div className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true)
              setError('')
              refresh()
            }}
            className="self-start rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 sm:self-auto"
          >
            Reintentar
          </button>
        </div>
      )}

      {success && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="counterparty-search" className={labelClass}>
              Buscar
            </label>
            <input
              id="counterparty-search"
              type="search"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value)
                setPage(1)
              }}
              placeholder="NIT o razón social"
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="counterparty-subprocess-filter"
              className={labelClass}
            >
              Subproceso
            </label>
            <select
              id="counterparty-subprocess-filter"
              value={subprocessFilter}
              onChange={(event) => {
                setSubprocessFilter(event.target.value)
                setPage(1)
              }}
              className={inputClass}
            >
              <option value="">Todos</option>
              {subprocesses.map((subprocess) => (
                <option key={subprocess.id} value={subprocess.id}>
                  {subprocess.name}
                  {subprocess.active ? '' : ' (inactivo)'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="counterparty-status-filter"
              className={labelClass}
            >
              Estado del registro
            </label>
            <select
              id="counterparty-status-filter"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(
                  event.target.value as CounterpartyStatus | '',
                )
                setPage(1)
              }}
              className={inputClass}
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Activas</option>
              <option value="ARCHIVED">Archivadas</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="counterparty-calendar-filter"
              className={labelClass}
            >
              Estado del calendario
            </label>
            <select
              id="counterparty-calendar-filter"
              value={calendarFilter}
              onChange={(event) => {
                setCalendarFilter(
                  event.target.value as CalendarStatus | '',
                )
                setPage(1)
              }}
              className={inputClass}
            >
              <option value="">Todos</option>
              <option value="OVERDUE">Vencido</option>
              <option value="PENDING">Pendiente (0 a 15 días)</option>
              <option value="UPCOMING">Próximo (16 a 30 días)</option>
              <option value="ON_TIME">Al día (más de 30 días)</option>
              <option value="UNSCHEDULED">Sin programar</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {total} contraparte{total === 1 ? '' : 's'} encontrada
            {total === 1 ? '' : 's'}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className={`${secondaryButtonClass} px-3 py-1.5 text-xs`}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <Loader2 className="size-5 animate-spin" />
            Cargando contrapartes...
          </div>
        ) : !result || result.data.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-900">
              {hasFilters
                ? 'No se encontraron contrapartes'
                : 'No hay contrapartes registradas'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {hasFilters
                ? 'Ajuste la búsqueda o los filtros seleccionados.'
                : isAdmin
                  ? 'Cree la primera contraparte para iniciar el seguimiento.'
                  : 'Aún no hay contrapartes disponibles.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">NIT</th>
                    <th className="px-4 py-3 font-medium">
                      Razón social
                    </th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">
                      Subproceso
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Próximo seguimiento
                    </th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {result.data.map((counterparty) => (
                    <tr
                      key={counterparty.id}
                      className="hover:bg-slate-50/60"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {counterparty.nit}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/contrapartes/${counterparty.id}`}
                          className="font-medium text-slate-900 hover:text-slate-700 hover:underline"
                        >
                          {counterparty.businessName}
                        </Link>
                        <p className="text-xs text-slate-500 lg:hidden">
                          {counterparty.subprocess.name}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <span className="text-slate-600">
                          {counterparty.subprocess.name}
                        </span>
                        {!counterparty.subprocess.active && (
                          <span className="ml-1 text-xs text-slate-500">
                            (inactivo)
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="text-slate-700">
                          {formatDate(counterparty.nextFollowUpDate)}
                        </p>
                        <Badge
                          tone={
                            calendarStatusTones[
                              counterparty.calendarStatus
                            ]
                          }
                        >
                          {
                            calendarStatusLabels[
                              counterparty.calendarStatus
                            ]
                          }
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            counterparty.status === 'ACTIVE'
                              ? 'green'
                              : 'slate'
                          }
                        >
                          {counterpartyStatusLabels[counterparty.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Link
                            to={`/contrapartes/${counterparty.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            <Eye className="size-3.5" />
                            Ver
                          </Link>

                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  void openEdit(counterparty.id)
                                }
                                disabled={
                                  loadingEditId === counterparty.id
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {loadingEditId ===
                                counterparty.id ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Pencil className="size-3.5" />
                                )}
                                Editar
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setStatusTarget({
                                    counterparty,
                                    mode:
                                      counterparty.status === 'ACTIVE'
                                        ? 'archive'
                                        : 'reactivate',
                                  })
                                }
                                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                                  counterparty.status === 'ACTIVE'
                                    ? 'border-red-200 text-red-700 hover:bg-red-50'
                                    : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                }`}
                              >
                                {counterparty.status === 'ACTIVE' ? (
                                  <Archive className="size-3.5" />
                                ) : (
                                  <RotateCcw className="size-3.5" />
                                )}
                                {counterparty.status === 'ACTIVE'
                                  ? 'Archivar'
                                  : 'Reactivar'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={result.meta.page}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {createOpen && (
        <CounterpartyFormModal
          mode="create"
          subprocesses={subprocesses}
          onClose={() => setCreateOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {editing && (
        <CounterpartyFormModal
          mode="edit"
          counterparty={editing}
          subprocesses={subprocesses}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {statusTarget && (
        <CounterpartyStatusModal
          mode={statusTarget.mode}
          counterparty={statusTarget.counterparty}
          onClose={() => setStatusTarget(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
