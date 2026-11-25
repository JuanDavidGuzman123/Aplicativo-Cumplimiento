import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Building2,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Download,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, type BadgeTone } from '../components/Badge'
import { ExternalDataStatusBadge } from '../components/ExternalDataStatusBadge'
import { Pagination } from '../components/Pagination'
import { useToast } from '../components/toast-context'
import { useExternalDataEvents } from '../hooks/useExternalDataEvents'
import {
  downloadExternalReport,
  getExternalSummary,
  getExternalUpdates,
  getExternalUpdatesDue,
  syncExternalData,
} from '../services/external-data'
import {
  EXTERNAL_DUE_SORT_FIELDS,
  EXTERNAL_SORT_FIELDS,
  SORT_DIRECTIONS,
  type ExternalAnnualStatus as AnnualStatus,
  type ExternalDueListResponse as AnnualUpdatesDueResponse,
  type ExternalDueSortField,
  type ExternalListParams as AnnualUpdateListParams,
  type ExternalAnnualListResponse as AnnualUpdateListResponse,
  type ExternalReportMetric,
  type ExternalSortField,
  type ExternalSource,
  type ExternalSummary as AnnualUpdateSummary,
  type ExternalUpdateFilter as AnnualUpdateFilter,
  type ExternalUpdateSituation as AnnualUpdateSituation,
  type SortDirection,
} from '../types/external-data'
import { getApiErrorMessage } from '../utils/api-error'
import { formatDate } from '../utils/labels'
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  successButtonClass,
  successButtonSmallClass,
} from '../utils/styles'

const PAGE_SIZE = 15
const DUE_PAGE_SIZE = 10

const sourceCopy: Record<
  ExternalSource,
  {
    title: string
    description: string
    entity: string
    entityLower: string
    followUpLabel: string
  }
> = {
  arriendos: {
    title: 'Actualización Anual Arriendos',
    description:
      'Consulte el estado de la actualización anual de los puntos de venta y sus vencimientos desde el libro externo. Este proceso es independiente del seguimiento semestral.',
    entity: 'Puntos de venta',
    entityLower: 'puntos de venta',
    followUpLabel: 'Contrapartes en seguimiento',
  },
  clientes: {
    title: 'Actualización Anual Clientes',
    description:
      'Consulte el estado de la actualización anual de los clientes corporativos y sus vencimientos desde FR-SG-80. El seguimiento semestral se gestiona por separado.',
    entity: 'Clientes',
    entityLower: 'clientes',
    followUpLabel: 'Clientes en seguimiento',
  },
  proveedores: {
    title: 'Actualización Anual Proveedores',
    description:
      'Consulte el estado de la actualización anual de los proveedores y sus vencimientos desde FR-SG-83. El seguimiento semestral se gestiona por separado.',
    entity: 'Proveedores',
    entityLower: 'proveedores',
    followUpLabel: 'Proveedores en seguimiento',
  },
}

const reportLabels: Record<ExternalReportMetric, string> = {
  active: 'Descargar activos',
  inactive: 'Descargar inactivos',
  'updated-this-year': 'Descargar actualizados',
  'pending-active': 'Descargar pendientes',
  'follow-up': 'Descargar seguimiento',
  'updates-due': 'Descargar vencimientos',
}

const sectionClass =
  'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5'

const sectionHeaderClass =
  'flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between'

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

type StatCard = {
  label: string
  value: number
  hint: string
  icon: LucideIcon
  iconClass: string
  reports?: ExternalReportMetric[]
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

const annualStatusValues: AnnualStatus[] = ['ACTIVE', 'INACTIVE']
const updateFilterValues: AnnualUpdateFilter[] = [
  'UPDATED_THIS_YEAR',
  'PENDING',
  'NO_DATE',
]

function parsePositiveParam(value: string | null, fallback = 1) {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseEnumParam<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | '' {
  return value && allowed.includes(value as T) ? (value as T) : ''
}

type AnnualUrlState = {
  code: string
  search: string
  filters: AnnualUpdateListParams
  sort: ExternalSortField
  dir: SortDirection
  dueSort: ExternalDueSortField
  dueDir: SortDirection
  page: number
  duePage: number
}

function readAnnualUrlState(searchParamsKey: string): AnnualUrlState {
  const params = new URLSearchParams(searchParamsKey)
  const code = params.get('code') ?? ''
  const followUp = params.get('followUp')

  return {
    code,
    search: code || params.get('search') || '',
    filters: {
      code: code || undefined,
      search: code ? '' : params.get('search') || '',
      status: parseEnumParam(params.get('status'), annualStatusValues),
      annualStatus: parseEnumParam(
        params.get('annualStatus'),
        updateFilterValues,
      ),
      requiresSemiannualFollowUp:
        followUp === 'true' ? true : followUp === 'false' ? false : '',
    },
    sort: parseEnumParam(params.get('sort'), EXTERNAL_SORT_FIELDS) || 'status',
    dir: parseEnumParam(params.get('dir'), SORT_DIRECTIONS) || 'asc',
    dueSort:
      parseEnumParam(params.get('dueSort'), EXTERNAL_DUE_SORT_FIELDS) ||
      'daysUntilDue',
    dueDir: parseEnumParam(params.get('dueDir'), SORT_DIRECTIONS) || 'asc',
    page: code ? 1 : parsePositiveParam(params.get('page')),
    duePage: parsePositiveParam(params.get('duePage')),
  }
}

function setOrDeleteParam(
  params: URLSearchParams,
  key: string,
  value: string | number,
) {
  const normalized = String(value)

  if (normalized) {
    params.set(key, normalized)
  } else {
    params.delete(key)
  }
}

type SortableHeaderProps = {
  label: string
  field: string
  sort: string
  dir: SortDirection
  onSort: (field: string) => void
}

function SortableHeader({
  label,
  field,
  sort,
  dir,
  onSort,
}: SortableHeaderProps) {
  const isActive = sort === field
  const Icon = isActive
    ? dir === 'asc'
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown

  return (
    <th scope="col" className="px-4 py-3">
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:bg-slate-200/70 hover:text-slate-900 ${
          isActive ? 'text-emerald-800' : ''
        }`}
        aria-label={`Ordenar por ${label}`}
      >
        {label}
        <Icon className="size-3.5" />
      </button>
    </th>
  )
}

type AnnualUpdatesPageProps = {
  source?: ExternalSource
}

export function AnnualUpdatesPage({
  source = 'arriendos',
}: AnnualUpdatesPageProps) {
  const pageCopy = sourceCopy[source]
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const [initialUrlState] = useState<AnnualUrlState>(() =>
    readAnnualUrlState(searchParamsKey),
  )
  const lastSyncedParamsRef = useRef(searchParamsKey)
  const codeFromNotification = searchParams.get('code') ?? ''
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
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
  const [page, setPage] = useState(initialUrlState.page)

  const [due, setDue] = useState<AnnualUpdatesDueResponse | null>(
    null,
  )
  const [dueLoading, setDueLoading] = useState(true)
  const [dueError, setDueError] = useState('')
  const [dueRefreshKey, setDueRefreshKey] = useState(0)
  const [duePage, setDuePage] = useState(
    initialUrlState.duePage,
  )

  const [searchDraft, setSearchDraft] = useState(
    initialUrlState.search,
  )
  const [filters, setFilters] = useState<AnnualUpdateListParams>(
    initialUrlState.filters,
  )
  const [sort, setSort] = useState<ExternalSortField>(
    initialUrlState.sort,
  )
  const [dir, setDir] = useState<SortDirection>(
    initialUrlState.dir,
  )
  const [dueSort, setDueSort] = useState<ExternalDueSortField>(
    initialUrlState.dueSort,
  )
  const [dueDir, setDueDir] = useState<SortDirection>(
    initialUrlState.dueDir,
  )

  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')

  const writeUrlState = (
    updates: Partial<AnnualUrlState> & { clearCode?: boolean },
  ) => {
    const next = new URLSearchParams(searchParamsKey)

    if (updates.clearCode) {
      next.delete('code')
    }
    if (updates.search !== undefined) {
      setOrDeleteParam(next, 'search', updates.search.trim())
    }
    if (updates.filters) {
      setOrDeleteParam(next, 'status', updates.filters.status ?? '')
      setOrDeleteParam(
        next,
        'annualStatus',
        updates.filters.annualStatus ?? '',
      )
      setOrDeleteParam(
        next,
        'followUp',
        updates.filters.requiresSemiannualFollowUp === ''
          ? ''
          : String(updates.filters.requiresSemiannualFollowUp),
      )
    }
    if (updates.sort !== undefined) {
      setOrDeleteParam(next, 'sort', updates.sort)
    }
    if (updates.dir !== undefined) {
      setOrDeleteParam(next, 'dir', updates.dir)
    }
    if (updates.dueSort !== undefined) {
      setOrDeleteParam(next, 'dueSort', updates.dueSort)
    }
    if (updates.dueDir !== undefined) {
      setOrDeleteParam(next, 'dueDir', updates.dueDir)
    }
    if (updates.page !== undefined) {
      setOrDeleteParam(next, 'page', updates.page === 1 ? '' : updates.page)
    }
    if (updates.duePage !== undefined) {
      setOrDeleteParam(
        next,
        'duePage',
        updates.duePage === 1 ? '' : updates.duePage,
      )
    }

    const nextKey = next.toString()
    lastSyncedParamsRef.current = nextKey
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (searchParamsKey === lastSyncedParamsRef.current) {
      return
    }

    lastSyncedParamsRef.current = searchParamsKey
    const next = readAnnualUrlState(searchParamsKey)

    setSearchDraft(next.search)
    setFilters(next.filters)
    setSort(next.sort)
    setDir(next.dir)
    setDueSort(next.dueSort)
    setDueDir(next.dueDir)
    setPage(next.page)
    setDuePage(next.duePage)
    setListLoading(true)
    setDueLoading(true)
  }, [searchParamsKey])

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
  } = useExternalDataEvents(refreshAll, source)

  useEffect(() => {
    let active = true

    getExternalSummary(source)
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
  }, [source, summaryRefreshKey])

  const effectiveListParams = useMemo(
    () =>
      codeFromNotification
        ? {
            ...filters,
            code: codeFromNotification,
            search: '',
            sort,
            dir,
            page: 1,
          }
        : { ...filters, sort, dir, page },
    [codeFromNotification, filters, page, sort, dir],
  )

  useEffect(() => {
    let active = true

    getExternalUpdates(
      {
        ...effectiveListParams,
        pageSize: PAGE_SIZE,
      },
      source,
    )
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
              `No fue posible cargar los ${pageCopy.entityLower} anuales externos`,
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
  }, [
    effectiveListParams,
    listRefreshKey,
    pageCopy.entityLower,
    setExternalStatus,
    source,
  ])

  useEffect(() => {
    let active = true

    getExternalUpdatesDue(
      {
        page: duePage,
        pageSize: DUE_PAGE_SIZE,
        sort: dueSort,
        dir: dueDir,
      },
      source,
    )
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
  }, [
    duePage,
    dueRefreshKey,
    dueSort,
    dueDir,
    setExternalStatus,
    source,
  ])

  useEffect(() => {
    if (!codeFromNotification) {
      return
    }

    document
      .getElementById('puntos-anuales')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [codeFromNotification])

  const currentYear = summary?.currentYear ?? fallbackYear
  const minimumDueYear = currentYear - 1
  const compactSummary = summary
    ? [
        {
          label: 'Activos',
          value: summary.totals.active,
        },
        {
          label: 'Actualizados',
          value: summary.annual.updatedThisYear,
        },
        {
          label: 'Pendientes',
          value: summary.annual.active.pendingUpdate,
        },
      ]
    : []
  const activeFilterCount = [
    (codeFromNotification || searchDraft).trim(),
    filters.status ?? '',
    filters.annualStatus ?? '',
    filters.requiresSemiannualFollowUp === '' ||
    filters.requiresSemiannualFollowUp === undefined
      ? ''
      : String(filters.requiresSemiannualFollowUp),
  ].filter(Boolean).length

  const handleReport = async (metric: ExternalReportMetric) => {
    setReportLoading(true)
    setReportError('')

    try {
      await downloadExternalReport(metric, source)
      showToast('Reporte generado y descargado correctamente.')
    } catch (reportFailure) {
      setReportError(
        getApiErrorMessage(
          reportFailure,
          'No fue posible generar el reporte solicitado',
        ),
      )
    } finally {
      setReportLoading(false)
    }
  }

  const statCards: StatCard[] = summary
    ? [
        {
          label: `${pageCopy.entity} activos`,
          value: summary.totals.active,
          hint: `${summary.totals.inactive} inactivos`,
          icon: Building2,
          iconClass: 'bg-emerald-900 text-white',
          reports: ['active'],
        },
        {
          label: `${pageCopy.entity} inactivos`,
          value: summary.totals.inactive,
          hint: 'Solo para conteo',
          icon: Ban,
          iconClass: 'bg-amber-50 text-amber-700',
          reports: ['inactive'],
        },
        {
          label: `Actualizados en ${currentYear}`,
          value: summary.annual.updatedThisYear,
          hint: `${summary.annual.active.updatedThisYear} activos / ${summary.annual.inactive.updatedThisYear} inactivos`,
          icon: CalendarCheck,
          iconClass: 'bg-amber-100 text-emerald-900',
          reports: ['updated-this-year'],
        },
          {
            label: 'Pendientes de actualizar',
            value: summary.annual.active.pendingUpdate,
            hint: `Diligenciamiento desde ${minimumDueYear}`,
            icon: CalendarClock,
            iconClass: 'bg-amber-50 text-amber-600',
            reports: ['pending-active'],
          },
        {
          label: pageCopy.followUpLabel,
          value: summary.semiannual.totalWithFollowUp,
          hint: `${summary.semiannual.activeWithFollowUp} activos / ${summary.semiannual.inactiveWithFollowUp} inactivos`,
          icon: Users,
          iconClass: 'bg-amber-100 text-emerald-900',
          reports: ['follow-up'],
        },
      ]
    : []

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextSearch = (codeFromNotification || searchDraft).trim()
    const nextFilters: AnnualUpdateListParams = {
      ...filters,
      code: undefined,
      search: nextSearch,
    }

    setListLoading(true)
    setSearchDraft(nextSearch)
    setPage(1)
    setFilters(nextFilters)
    writeUrlState({
      clearCode: true,
      search: nextSearch,
      filters: nextFilters,
      page: 1,
    })
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

    const nextFilters: AnnualUpdateListParams = {
      ...filters,
      [field]: nextValue,
    }

    setListLoading(true)
    setPage(1)
    setFilters(nextFilters)
    writeUrlState({
      clearCode: true,
      search: codeFromNotification || searchDraft,
      filters: nextFilters,
      page: 1,
    })
  }

  const handleClearFilters = () => {
    const emptyFilters: AnnualUpdateListParams = {
      code: undefined,
      search: '',
      status: '',
      annualStatus: '',
      requiresSemiannualFollowUp: '',
    }

    setListLoading(true)
    setSearchDraft('')
    setPage(1)
    setDuePage(1)
    setFilters(emptyFilters)
    writeUrlState({
      clearCode: true,
      search: '',
      filters: emptyFilters,
      page: 1,
      duePage: 1,
    })
  }

  const handleListSort = (field: string) => {
    const nextSort = field as ExternalSortField
    const nextDir: SortDirection =
      sort === nextSort && dir === 'asc' ? 'desc' : 'asc'

    setListLoading(true)
    setPage(1)
    setSort(nextSort)
    setDir(nextDir)
    writeUrlState({
      sort: nextSort,
      dir: nextDir,
      page: 1,
    })
  }

  const handleDueSort = (field: string) => {
    const nextSort = field as ExternalDueSortField
    const nextDir: SortDirection =
      dueSort === nextSort && dueDir === 'asc' ? 'desc' : 'asc'

    setDueLoading(true)
    setDueSort(nextSort)
    setDueDir(nextDir)
    writeUrlState({
      dueSort: nextSort,
      dueDir: nextDir,
    })
  }

  const handleManualSync = async () => {
    setSyncing(true)
    setSyncError('')

    try {
      const nextStatus = await syncExternalData(source)
      setExternalStatus(nextStatus)
      showToast('Libro externo sincronizado correctamente.')
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
    <div className="mx-auto max-w-6xl space-y-8 pb-10">
      <section className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {pageCopy.title}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              {pageCopy.description}
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

        {summary && (
          <div className="space-y-2 sm:hidden">
            <div className="grid grid-cols-3 gap-2">
              {compactSummary.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSummaryExpanded((value) => !value)}
              className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-amber-300 hover:bg-amber-50"
              aria-expanded={summaryExpanded}
            >
              {summaryExpanded
                ? 'Ocultar indicadores'
                : 'Ver todos los indicadores'}
              <ChevronDown
                className={`size-4 transition-transform ${
                  summaryExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        )}

        {summaryLoading && !summary ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {statCards.map(
              ({
                label,
                value,
                hint,
                icon: Icon,
                iconClass,
                reports,
              }) => (
                <div
                  key={label}
                  className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5"
                >
                  <span
                    className={`flex size-9 items-center justify-center rounded-lg ${iconClass}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <p className="mt-4 text-2xl font-semibold text-slate-900">
                    {value}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {label}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {hint}
                  </p>
                  {reports && (
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                      {reports.map((metric) => (
                        <button
                          key={metric}
                          type="button"
                          onClick={() => {
                            void handleReport(metric)
                          }}
                          disabled={reportLoading}
                          className={successButtonSmallClass}
                        >
                          <Download
                            className={`size-3.5 ${
                              reportLoading ? 'animate-pulse' : ''
                            }`}
                          />
                          {reportLoading
                            ? 'Generando...'
                            : reportLabels[metric]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
        )}

        {reportError && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <XCircle className="mt-0.5 size-4 shrink-0" />
            <span>{reportError}</span>
          </div>
        )}

        {summary && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">
              Corte al {formatDate(summary.businessDate)} · Año{' '}
              {summary.currentYear}
            </p>
            <p className="mt-1 text-xs">
              Los {pageCopy.entityLower} inactivos se incluyen
              únicamente en los conteos. Los pendientes corresponden a{' '}
              {pageCopy.entityLower} activos sin actualización registrada
              en el año.
            </p>
          </div>
        )}
      </section>

      <section id="puntos-anuales" className={`${sectionClass} scroll-mt-6`}>
        <div className={sectionHeaderClass}>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-emerald-900">
              <Building2 className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {pageCopy.entity} anuales
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Consulte el estado anual y el seguimiento registrado
                en el libro externo.
              </p>
            </div>
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

        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 sm:hidden">
          <button
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-amber-300 hover:bg-amber-50"
            aria-expanded={filtersOpen}
            aria-controls="annual-filters"
          >
            <SlidersHorizontal className="size-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown
              className={`size-4 transition-transform ${
                filtersOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-xs font-semibold text-slate-500 underline transition hover:text-slate-900"
            >
              Limpiar
            </button>
          )}
        </div>

        <form
          id="annual-filters"
          onSubmit={handleFilterSubmit}
          className={`${filtersOpen ? 'grid' : 'hidden'} gap-4 border-b border-slate-200 p-5 sm:grid sm:grid-cols-2 lg:grid-cols-5`}
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
                value={codeFromNotification || searchDraft}
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
            Cargando {pageCopy.entityLower}...
          </div>
        ) : !list || list.data.length === 0 ? (
          <div className="p-10 text-center">
            <AlertTriangle className="mx-auto size-8 text-amber-500" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              No hay {pageCopy.entityLower} para mostrar
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Verifique la configuración y sincronización del libro
              externo para comenzar.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 xl:hidden">
              {list.data.map((row) => (
                <li
                  key={row.id}
                  className={`p-4 ${
                    row.code === codeFromNotification
                      ? 'bg-blue-50/60'
                      : ''
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {row.code}
                      </p>
                      <p className="mt-0.5 font-semibold text-slate-900">
                        {row.businessName}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={annualStatusTones[row.status]}>
                        {annualStatusLabels[row.status]}
                      </Badge>
                      <Badge
                        tone={updateFilterTones[row.annualStatus]}
                      >
                        {updateFilterLabels[row.annualStatus]}
                      </Badge>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="font-medium text-slate-500">
                        Fecha
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {formatDate(row.filingDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">
                        Año
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {row.filingYear ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">
                        Tipo
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {row.dueDiligenceType ?? '—'}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">
                      Seguimiento:
                    </span>
                    {row.requiresSemiannualFollowUp === null ? (
                      <span className="text-xs text-slate-400">
                        Sin dato
                      </span>
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
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-medium text-slate-500">
                      Observaciones
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">
                      {row.observations || 'Sin observaciones registradas.'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div
              role="region"
              aria-label={`Tabla de ${pageCopy.entityLower} anuales, desplazable horizontalmente`}
              tabIndex={0}
              className="scrollbar-thin hidden max-h-[34rem] overflow-auto xl:block"
            >
              <table
                aria-label={`${pageCopy.entity} con actualización anual`}
                className="min-w-[1100px] divide-y divide-slate-200 text-sm"
              >
                <caption className="sr-only">
                  {pageCopy.entity} con estado, fecha, año, tipo,
                  seguimiento, observaciones y estado anual
                </caption>
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 backdrop-blur-sm">
                  <tr>
                    <SortableHeader
                      label="Código"
                      field="code"
                      sort={sort}
                      dir={dir}
                      onSort={handleListSort}
                    />
                    <SortableHeader
                      label="Nombre"
                      field="businessName"
                      sort={sort}
                      dir={dir}
                      onSort={handleListSort}
                    />
                    <SortableHeader
                      label="Estado"
                      field="status"
                      sort={sort}
                      dir={dir}
                      onSort={handleListSort}
                    />
                    <SortableHeader
                      label="Fecha"
                      field="filingDate"
                      sort={sort}
                      dir={dir}
                      onSort={handleListSort}
                    />
                    <SortableHeader
                      label="Año"
                      field="filingYear"
                      sort={sort}
                      dir={dir}
                      onSort={handleListSort}
                    />
                    <th scope="col" className="px-4 py-3">
                      Tipo
                    </th>
                    <SortableHeader
                      label="Seguimiento"
                      field="followUp"
                      sort={sort}
                      dir={dir}
                      onSort={handleListSort}
                    />
                    <th scope="col" className="px-4 py-3">
                      Observaciones
                    </th>
                    <SortableHeader
                      label="Estado anual"
                      field="annualStatus"
                      sort={sort}
                      dir={dir}
                      onSort={handleListSort}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.data.map((row) => (
                    <tr
                      key={row.id}
                      className={
                        row.code === codeFromNotification
                          ? 'bg-blue-50/60'
                          : 'transition hover:bg-amber-50/40'
                      }
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.code}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.businessName}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={annualStatusTones[row.status]}>
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
                          tone={updateFilterTones[row.annualStatus]}
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
                writeUrlState({ page: nextPage })
              }}
            />
          </>
        )}
      </section>

      <section className={sectionClass}>
        <div className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
              <CalendarClock className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Actualizaciones vencidas y por vencer
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Solo contrapartes activas con diligenciamiento desde{' '}
                {minimumDueYear}. La fecha límite es la fecha de
                diligenciamiento más un año; los recordatorios se envían
                a los 15, 5, 1 y 0 días.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void handleReport('updates-due')
              }}
              disabled={reportLoading}
              className={successButtonClass}
            >
              <Download
                className={`size-4 ${
                  reportLoading ? 'animate-pulse' : ''
                }`}
              />
              {reportLoading ? 'Generando...' : 'Descargar reporte'}
            </button>
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
        </div>

        {dueError && (
          <div className="m-5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <XCircle className="mt-0.5 size-4 shrink-0" />
            <span>{dueError}</span>
          </div>
        )}

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
                className="rounded-lg bg-amber-50 p-3"
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
              aparecerán aquí cuando se acerque su vencimiento.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 xl:hidden">
              {due.data.map((row) => (
                <li key={row.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {row.code}
                      </p>
                      <p className="mt-0.5 font-semibold text-slate-900">
                        {row.businessName}
                      </p>
                    </div>
                    <Badge
                      tone={annualSituationTones[row.situation]}
                    >
                      {annualSituationLabels[row.situation]}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-amber-50/60 p-3 text-xs">
                    <div>
                      <dt className="font-medium text-slate-500">
                        Fecha límite
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {formatDate(row.dueDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">
                        Días
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {formatDays(row.daysUntilDue)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>

            <div
              role="region"
              aria-label="Tabla de vencimientos anuales, desplazable horizontalmente"
              tabIndex={0}
              className="scrollbar-thin hidden max-h-[34rem] overflow-auto xl:block"
            >
              <table
                aria-label="Actualizaciones anuales vencidas y por vencer"
                className="min-w-[760px] divide-y divide-slate-200 text-sm"
              >
                <caption className="sr-only">
                  Contrapartes con actualización anual vencida o próxima,
                  fecha límite, días restantes y situación
                </caption>
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 backdrop-blur-sm">
                  <tr>
                    <SortableHeader
                      label="Código"
                      field="code"
                      sort={dueSort}
                      dir={dueDir}
                      onSort={handleDueSort}
                    />
                    <SortableHeader
                      label="Nombre"
                      field="businessName"
                      sort={dueSort}
                      dir={dueDir}
                      onSort={handleDueSort}
                    />
                    <SortableHeader
                      label="Fecha límite"
                      field="dueDate"
                      sort={dueSort}
                      dir={dueDir}
                      onSort={handleDueSort}
                    />
                    <SortableHeader
                      label="Días"
                      field="daysUntilDue"
                      sort={dueSort}
                      dir={dueDir}
                      onSort={handleDueSort}
                    />
                    <SortableHeader
                      label="Situación"
                      field="situation"
                      sort={dueSort}
                      dir={dueDir}
                      onSort={handleDueSort}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {due.data.map((row) => (
                    <tr
                      key={row.id}
                      className="transition hover:bg-amber-50/40"
                    >
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
                          tone={annualSituationTones[row.situation]}
                        >
                          {annualSituationLabels[row.situation]}
                        </Badge>
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
                writeUrlState({ duePage: nextPage })
              }}
            />
          </>
        )}
      </section>

      <section className={`${sectionClass} p-5`}>
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-emerald-900">
            <ArrowRight className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Proceso independiente
            </h2>
            <p className="mt-1 text-sm text-slate-500">
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
