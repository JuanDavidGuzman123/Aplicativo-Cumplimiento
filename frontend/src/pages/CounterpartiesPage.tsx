import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  ClipboardCheck,
  LayoutGrid,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  Badge,
  type BadgeTone,
} from '../components/Badge'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { useToast } from '../components/toast-context'
import {
  evaluateRisk,
  getCategories,
  getCounterparties,
  syncArriendosFromExternal,
  syncClientesFromExternal,
  syncColocadoresFromExternal,
  syncProveedoresFromExternal,
  getCounterparty,
  reactivateCounterparty,
} from '../services/counterparties'
import {
  COUNTERPARTY_SORT_FIELDS,
  type CalendarStatus,
  type CategorySummary,
  type CounterpartyDetail,
  type CounterpartyListItem,
  type CounterpartyListResponse,
  type CounterpartySortField,
  type CounterpartyStatus,
  type SortDirection,
} from '../types/counterparty'
import { getApiErrorMessage } from '../utils/api-error'
import {
  formatDate,
  formatDateTime,
  todayDateInput,
} from '../utils/labels'
import {
  dangerButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  successButtonClass,
} from '../utils/styles'

const PAGE_SIZE = 15

const statusLabels: Record<CounterpartyStatus, string> = {
  ACTIVE: 'En seguimiento',
  ARCHIVED: 'Archivada',
}

const statusTones: Record<CounterpartyStatus, BadgeTone> = {
  ACTIVE: 'green',
  ARCHIVED: 'slate',
}

const calendarLabels: Record<CalendarStatus, string> = {
  OVERDUE: 'Vencido',
  PENDING: 'Por vencer',
  UPCOMING: 'Próximo',
  ON_TIME: 'Al día',
  UNSCHEDULED: 'Sin fecha',
}

const calendarTones: Record<CalendarStatus, BadgeTone> = {
  OVERDUE: 'red',
  PENDING: 'amber',
  UPCOMING: 'blue',
  ON_TIME: 'green',
  UNSCHEDULED: 'slate',
}

const decisionLabels = {
  CONTINUE: 'Continúa con riesgo',
  ARCHIVE: 'Archivada por no presentar riesgo',
  REACTIVATE: 'Reactivada',
} as const

const decisionTones = {
  CONTINUE: 'amber',
  ARCHIVE: 'slate',
  REACTIVATE: 'green',
} as const

function colocadoresBadge(item: CounterpartyListItem): {
  label: string
  tone: BadgeTone
} {
  if (item.status === 'ARCHIVED') {
    return { label: 'Archivada', tone: 'slate' }
  }

  if (item.calendarStatus === 'OVERDUE') {
    return { label: 'Vencida', tone: 'red' }
  }

  if (item.evaluated) {
    return { label: 'Revisada', tone: 'green' }
  }

  return { label: 'Al día', tone: 'blue' }
}

type ModalMode = 'evaluate' | 'reactivate' | 'history'

function addSixMonths(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  const targetMonth = month - 1 + 6
  const lastDay = new Date(
    Date.UTC(year, targetMonth + 1, 0),
  ).getUTCDate()
  const next = new Date(
    Date.UTC(year, targetMonth, Math.min(day, lastDay)),
  )

  return next.toISOString().slice(0, 10)
}

type CounterpartyUrlState = {
  category: string
  search: string
  status: CounterpartyStatus
  sort: CounterpartySortField
  dir: SortDirection
  page: number
}

function parsePositiveParam(value: string | null, fallback = 1) {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function readCounterpartyUrlState(
  searchParamsKey: string,
): CounterpartyUrlState {
  const params = new URLSearchParams(searchParamsKey)
  const status = params.get('status')
  const sort = params.get('sort')

  return {
    category: params.get('category') ?? '',
    search: params.get('search') ?? '',
    status: status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    sort: COUNTERPARTY_SORT_FIELDS.includes(
      sort as CounterpartySortField,
    )
      ? (sort as CounterpartySortField)
      : 'status',
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
    page: parsePositiveParam(params.get('page')),
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
  field: CounterpartySortField
  sort: CounterpartySortField
  dir: SortDirection
  onSort: (field: CounterpartySortField) => void
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
    <th scope="col" className="px-4 py-3 font-semibold">
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

export function CounterpartiesPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { id: notificationCounterpartyId } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const [initialUrlState] = useState<CounterpartyUrlState>(() =>
    readCounterpartyUrlState(searchParamsKey),
  )
  const lastSyncedParamsRef = useRef(searchParamsKey)

  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesError, setCategoriesError] = useState('')
  const [syncingArriendos, setSyncingArriendos] = useState(false)
  const [syncingColocadores, setSyncingColocadores] = useState(false)
  const [syncingClientes, setSyncingClientes] = useState(false)
  const [syncingProveedores, setSyncingProveedores] = useState(false)
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<
    string | null
  >(initialUrlState.category || null)

  const [searchDraft, setSearchDraft] = useState(
    initialUrlState.search,
  )
  const [query, setQuery] = useState<{
    search: string
    category: string
    status: CounterpartyStatus
    page: number
  }>({
    search: initialUrlState.search,
    category: initialUrlState.category,
    status: initialUrlState.status,
    page: initialUrlState.page,
  })
  const [sort, setSort] = useState<CounterpartySortField>(
    initialUrlState.sort,
  )
  const [dir, setDir] = useState<SortDirection>(
    initialUrlState.dir,
  )
  const [list, setList] = useState<CounterpartyListResponse | null>(
    null,
  )
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const writeUrlState = (
    updates: Partial<CounterpartyUrlState>,
  ) => {
    const next = new URLSearchParams(searchParamsKey)

    if (updates.category !== undefined) {
      setOrDeleteParam(next, 'category', updates.category)
    }
    if (updates.search !== undefined) {
      setOrDeleteParam(next, 'search', updates.search.trim())
    }
    if (updates.status !== undefined) {
      setOrDeleteParam(next, 'status', updates.status)
    }
    if (updates.sort !== undefined) {
      setOrDeleteParam(next, 'sort', updates.sort)
    }
    if (updates.dir !== undefined) {
      setOrDeleteParam(next, 'dir', updates.dir)
    }
    if (updates.page !== undefined) {
      setOrDeleteParam(next, 'page', updates.page === 1 ? '' : updates.page)
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
    const next = readCounterpartyUrlState(searchParamsKey)

    setSelectedCategoryKey(next.category || null)
    setSearchDraft(next.search)
    setSort(next.sort)
    setDir(next.dir)
    setQuery({
      search: next.search,
      category: next.category,
      status: next.status,
      page: next.page,
    })
    setListLoading(true)
  }, [searchParamsKey])

  const [modal, setModal] = useState<{
    mode: ModalMode
    item: CounterpartyListItem
  } | null>(null)
  const [detail, setDetail] = useState<CounterpartyDetail | null>(
    null,
  )
  const [detailLoading, setDetailLoading] = useState(
    Boolean(notificationCounterpartyId),
  )
  const [modalError, setModalError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [decision, setDecision] = useState<
    'CONTINUE' | 'ARCHIVE'
  >('CONTINUE')
  const [notes, setNotes] = useState('')
  const [reactivateDate, setReactivateDate] = useState(
    addSixMonths(todayDateInput()),
  )

  const evaluationDate = useMemo(() => todayDateInput(), [])
  const followUpPreview = useMemo(
    () => addSixMonths(evaluationDate),
    [evaluationDate],
  )

  useEffect(() => {
    let active = true

    getCategories()
      .then((data) => {
        if (!active) {
          return
        }

        setCategories(data)
        setCategoriesError('')
      })
      .catch((loadError) => {
        if (active) {
          setCategoriesError(
            getApiErrorMessage(
              loadError,
              'No fue posible cargar las categorías',
            ),
          )
        }
      })
      .finally(() => {
        if (active) {
          setCategoriesLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [refreshKey])

  useEffect(() => {
    if (!query.category) {
      return
    }

    let active = true

    getCounterparties({
      search: query.search || undefined,
      category: query.category,
      status: query.status,
      sort,
      dir,
      page: query.page,
      pageSize: PAGE_SIZE,
    })
      .then((data) => {
        if (!active) {
          return
        }

        setList(data)
        setListError('')
      })
      .catch((loadError) => {
        if (active) {
          setListError(
            getApiErrorMessage(
              loadError,
              'No fue posible cargar las contrapartes',
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
    query.category,
    query.search,
    query.status,
    query.page,
    sort,
    dir,
    refreshKey,
  ])

  useEffect(() => {
    if (!notificationCounterpartyId) {
      return
    }

    let active = true

    getCounterparty(notificationCounterpartyId)
      .then((data) => {
        if (!active) {
          return
        }

        setDetail(data)
        setModal({
          mode: 'history',
          item: data,
        })
        setModalError('')
      })
      .catch((loadError) => {
        if (active) {
          setModalError(
            getApiErrorMessage(
              loadError,
              'No fue posible cargar la contraparte',
            ),
          )
        }
      })
      .finally(() => {
        if (active) {
          setDetailLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [notificationCounterpartyId])

  const selectCategory = (category: CategorySummary) => {
    setSelectedCategoryKey(category.key)
    setSearchDraft('')
    setList(null)
    setListLoading(true)
    setListError('')
    setQuery({
      search: '',
      category: category.key,
      status: 'ACTIVE',
      page: 1,
    })
    writeUrlState({
      category: category.key,
      search: '',
      status: 'ACTIVE',
      page: 1,
    })
  }

  const backToCategories = () => {
    setSelectedCategoryKey(null)
    setSearchDraft('')
    setList(null)
    setListLoading(false)
    setListError('')
    setQuery({
      search: '',
      category: '',
      status: 'ACTIVE',
      page: 1,
    })
    writeUrlState({
      category: '',
      search: '',
      status: 'ACTIVE',
      page: 1,
    })
  }

  const changeStatus = (next: CounterpartyStatus) => {
    if (next === query.status) {
      return
    }

    setListLoading(true)
    setQuery((current) => ({ ...current, status: next, page: 1 }))
    writeUrlState({ status: next, page: 1 })
  }

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextSearch = searchDraft.trim()

    setListLoading(true)
    setQuery((current) => ({
      ...current,
      search: nextSearch,
      page: 1,
    }))
    writeUrlState({ search: nextSearch, page: 1 })
  }

  const handleSort = (field: CounterpartySortField) => {
    const nextDir: SortDirection =
      sort === field && dir === 'asc' ? 'desc' : 'asc'

    setListLoading(true)
    setSort(field)
    setDir(nextDir)
    writeUrlState({ sort: field, dir: nextDir, page: 1 })
  }

  const openModal = async (
    mode: ModalMode,
    item: CounterpartyListItem,
  ) => {
    setModal({ mode, item })
    setDetail(null)
    setDetailLoading(true)
    setModalError('')

    if (mode === 'evaluate') {
      setDecision('CONTINUE')
      setNotes('')
    }

    if (mode === 'reactivate') {
      setReactivateDate(addSixMonths(todayDateInput()))
      setNotes('')
    }

    try {
      const data = await getCounterparty(item.id)
      setDetail(data)
    } catch (loadError) {
      setModalError(
        getApiErrorMessage(
          loadError,
          'No fue posible cargar el detalle de la contraparte',
        ),
      )
    } finally {
      setDetailLoading(false)
    }
  }

  const refresh = () => {
    setCategoriesLoading(true)
    setListLoading(Boolean(query.category))
    setRefreshKey((value) => value + 1)
  }

  const syncArriendos = async () => {
    if (syncingArriendos) {
      return
    }

    setSyncingArriendos(true)
    setCategoriesError('')

    try {
      const result = await syncArriendosFromExternal()
      showToast(
        `Sincronización completada: ${result.created} nuevas contrapartes de Arriendos, ${result.updated} actualizadas, ${result.alreadyExisting} ya existían.`,
      )
      refresh()
    } catch (syncError) {
      setCategoriesError(
        getApiErrorMessage(
          syncError,
          'No fue posible sincronizar las contrapartes desde FR-SG-79',
        ),
      )
    } finally {
      setSyncingArriendos(false)
    }
  }

  const syncColocadores = async () => {
    if (syncingColocadores) {
      return
    }

    setSyncingColocadores(true)
    setCategoriesError('')

    try {
      const result = await syncColocadoresFromExternal()
      showToast(
        `Sincronización completada: ${result.created} nuevas contrapartes de Colocadores independientes, ${result.updated} actualizadas, ${result.alreadyExisting} ya existían.`,
      )
      refresh()
    } catch (syncError) {
      setCategoriesError(
        getApiErrorMessage(
          syncError,
          'No fue posible sincronizar las contrapartes desde FR-SG-81',
        ),
      )
    } finally {
      setSyncingColocadores(false)
    }
  }

  const syncClientes = async () => {
    if (syncingClientes) {
      return
    }

    setSyncingClientes(true)
    setCategoriesError('')

    try {
      const result = await syncClientesFromExternal()
      showToast(
        `Sincronización completada: ${result.created} nuevas contrapartes de Clientes, ${result.updated} actualizadas, ${result.alreadyExisting} ya existían.`,
      )
      refresh()
    } catch (syncError) {
      setCategoriesError(
        getApiErrorMessage(
          syncError,
          'No fue posible sincronizar las contrapartes desde FR-SG-80',
        ),
      )
    } finally {
      setSyncingClientes(false)
    }
  }

  const syncProveedores = async () => {
    if (syncingProveedores) {
      return
    }

    setSyncingProveedores(true)
    setCategoriesError('')

    try {
      const result = await syncProveedoresFromExternal()
      showToast(
        `Sincronización completada: ${result.created} nuevas contrapartes de Proveedores, ${result.updated} actualizadas, ${result.alreadyExisting} ya existían.`,
      )
      refresh()
    } catch (syncError) {
      setCategoriesError(
        getApiErrorMessage(
          syncError,
          'No fue posible sincronizar las contrapartes desde FR-SG-83',
        ),
      )
    } finally {
      setSyncingProveedores(false)
    }
  }

  const closeModal = () => {
    setModal(null)
    setDetail(null)
    setModalError('')

    if (notificationCounterpartyId) {
      navigate('/contrapartes', { replace: true })
    }
  }

  const handleSubmit = async () => {
    if (!modal || submitting) {
      return
    }

    if (
      modal.mode === 'reactivate' &&
      notes.trim().length < 5
    ) {
      setModalError(
        'Ingrese el motivo de la reactivación (mínimo 5 caracteres).',
      )
      return
    }

    setSubmitting(true)
    setModalError('')

    try {
      if (modal.mode === 'evaluate') {
        const result = await evaluateRisk(modal.item.id, {
          decision,
          evaluatedAt: evaluationDate,
          notes: notes.trim() || undefined,
        })

        showToast(
          decision === 'CONTINUE'
            ? `Evaluación registrada. Próximo seguimiento: ${formatDate(result.nextFollowUpDate)}.`
            : `Contraparte ${modal.item.businessName} archivada.`,
        )
      } else if (modal.mode === 'reactivate') {
        await reactivateCounterparty(modal.item.id, {
          reason: notes.trim(),
          nextFollowUpDate: reactivateDate || undefined,
        })

        showToast(
          `Contraparte ${modal.item.businessName} reactivada.`,
        )
      } else {
        closeModal()
        return
      }

      refresh()
      closeModal()
    } catch (submitError) {
      setModalError(
        getApiErrorMessage(
          submitError,
          'No fue posible guardar la evaluación',
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const rows = list?.data ?? []
  const selectedCategory =
    categories.find(
      (category) => category.key === selectedCategoryKey,
    ) ?? null
  const isColocadores =
    selectedCategoryKey === 'COLOCADORES_INDEPENDIENTES'
  const documentLabel = isColocadores ? 'CC' : 'NIT'
  const searchPlaceholder = isColocadores
    ? 'Buscar por CC o nombre'
    : 'Buscar por NIT o razón social'

  const renderStatusBadges = (item: CounterpartyListItem) =>
    isColocadores ? (
      <Badge tone={colocadoresBadge(item).tone}>
        {colocadoresBadge(item).label}
      </Badge>
    ) : (
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={statusTones[item.status]}>
          {statusLabels[item.status]}
        </Badge>
        <Badge tone={calendarTones[item.calendarStatus]}>
          {calendarLabels[item.calendarStatus]}
        </Badge>
      </div>
    )

  const renderActions = (item: CounterpartyListItem) => (
    <div className="flex flex-nowrap gap-1.5">
      <button
        type="button"
        onClick={() => openModal('history', item)}
        className={`${secondaryButtonClass} min-h-9 whitespace-nowrap px-2.5 py-1.5 text-xs`}
      >
        <History className="size-4" />
        Historial
      </button>
      {item.status === 'ACTIVE' ? (
        <button
          type="button"
          onClick={() => openModal('evaluate', item)}
          className={`${successButtonClass} min-h-9 whitespace-nowrap px-2.5 py-1.5 text-xs`}
        >
          Evaluar
        </button>
      ) : (
        <button
          type="button"
          onClick={() => openModal('reactivate', item)}
          className={`${primaryButtonClass} min-h-9 whitespace-nowrap px-2.5 py-1.5 text-xs`}
        >
          <RotateCcw className="size-4" />
          Reactivar
        </button>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-amber-100 text-emerald-900">
              <ClipboardCheck className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Contrapartes
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {selectedCategory
                  ? `Gestione las contrapartes de ${selectedCategory.name} y conserve el historial de decisiones.`
                  : 'Seleccione una categoría para gestionar sus contrapartes en seguimiento.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedCategoryKey && (
              <button
                type="button"
                onClick={backToCategories}
                className={secondaryButtonClass}
              >
                <ArrowLeft className="size-4" />
                Volver a categorías
              </button>
            )}
            <button
              type="button"
              onClick={refresh}
              className={secondaryButtonClass}
            >
              <RefreshCw className="size-4" />
              Actualizar
            </button>
          </div>
        </div>

        {selectedCategoryKey && (
          <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200">
            {(
              [
                ['ACTIVE', 'En seguimiento'],
                ['ARCHIVED', 'Contrapartes archivadas'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeStatus(value)}
                className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
                  query.status === value
                    ? 'border-amber-400 text-emerald-900'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </section>

      {listError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {listError}
        </div>
      )}

      {!selectedCategoryKey && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <LayoutGrid className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Seleccione una categoría
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Cada categoría mantiene sus contrapartes, subprocesos e
                historial de evaluaciones de forma independiente.
              </p>
            </div>
          </div>

          {categoriesError && (
            <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {categoriesError}
            </div>
          )}

          {categoriesLoading ? (
            <div className="mt-6 flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
              <Loader2 className="size-5 animate-spin" />
              Cargando categorías...
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => selectCategory(category)}
                  className="group rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-amber-300 hover:bg-amber-50/50 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">
                      {category.name}
                    </p>
                    <LayoutGrid className="size-5 text-slate-400 group-hover:text-amber-600" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <Badge tone="slate">
                      {category.activeCount} en seguimiento
                    </Badge>
                    <Badge tone="amber">
                      {category.archivedCount} archivadas
                    </Badge>
                  </div>
                  <p className="mt-4 text-sm font-medium text-emerald-700">
                    Ver contrapartes
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {selectedCategoryKey && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <form onSubmit={handleSearch} className="flex flex-1 gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
              <input
                value={searchDraft}
                onChange={(event) =>
                  setSearchDraft(event.target.value)
                }
                placeholder={searchPlaceholder}
                aria-label="Buscar contraparte"
                className={`${inputClass} pl-9`}
              />
            </div>
            <button type="submit" className={secondaryButtonClass}>
              Buscar
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-3">
            {selectedCategoryKey === 'ARRIENDOS' && (
              <button
                type="button"
                onClick={syncArriendos}
                disabled={syncingArriendos}
                className={secondaryButtonClass}
              >
                {syncingArriendos ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Traer de FR-SG-79
              </button>
            )}
            {selectedCategoryKey === 'COLOCADORES_INDEPENDIENTES' && (
              <button
                type="button"
                onClick={syncColocadores}
                disabled={syncingColocadores}
                className={secondaryButtonClass}
              >
                {syncingColocadores ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Traer de FR-SG-81
              </button>
            )}
            {selectedCategoryKey === 'CLIENTES' && (
              <button
                type="button"
                onClick={syncClientes}
                disabled={syncingClientes}
                className={secondaryButtonClass}
              >
                {syncingClientes ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Traer de FR-SG-80
              </button>
            )}
            {selectedCategoryKey === 'PROVEEDORES' && (
              <button
                type="button"
                onClick={syncProveedores}
                disabled={syncingProveedores}
                className={secondaryButtonClass}
              >
                {syncingProveedores ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Traer de FR-SG-83
              </button>
            )}
            <p className="text-sm text-slate-500">
              {list?.meta.total ?? 0} registro
              {list?.meta.total === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {listLoading ? (
          <div className="flex items-center justify-center gap-3 px-4 py-20 text-sm text-slate-500">
            <Loader2 className="size-5 animate-spin" />
            Cargando contrapartes...
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-20 text-center">
            <p className="text-sm font-medium text-slate-900">
              No hay contrapartes para mostrar
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Ajuste la búsqueda o cambie de sección.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 xl:hidden">
              {rows.map((item) => (
                <li key={item.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {item.businessName}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {documentLabel} {item.nit}
                      </p>
                    </div>
                    {renderStatusBadges(item)}
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
                    <div>
                      <dt className="font-medium text-slate-500">
                        Último seguimiento
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {formatDate(item.lastFollowUpDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">
                        Próximo seguimiento
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {formatDate(item.nextFollowUpDate)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3">
                    <p className="text-xs font-medium text-slate-500">
                      Motivo de seguimiento
                    </p>
                    <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-slate-600">
                      {item.observations || 'Sin observaciones registradas.'}
                    </p>
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-3">
                    {renderActions(item)}
                  </div>
                </li>
              ))}
            </ul>

            <div
              role="region"
              aria-label="Tabla de contrapartes, desplazable horizontalmente"
              tabIndex={0}
              className="scrollbar-thin hidden max-h-[34rem] overflow-auto xl:block"
            >
              <table
                aria-label="Contrapartes en seguimiento"
                className="w-full min-w-[1100px] text-left text-sm"
              >
                <caption className="sr-only">
                  Contrapartes, estado, fechas de seguimiento,
                  observaciones y acciones disponibles
                </caption>
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-600 backdrop-blur-sm">
                  <tr>
                    <SortableHeader
                      label="Contraparte"
                      field="businessName"
                      sort={sort}
                      dir={dir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Estado"
                      field="status"
                      sort={sort}
                      dir={dir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Último seguimiento"
                      field="lastFollowUpDate"
                      sort={sort}
                      dir={dir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Próximo seguimiento"
                      field="nextFollowUpDate"
                      sort={sort}
                      dir={dir}
                      onSort={handleSort}
                    />
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Motivo de seguimiento
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right font-semibold"
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((item) => (
                    <tr
                      key={item.id}
                      className="transition hover:bg-amber-50/40"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">
                          {item.businessName}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {documentLabel} {item.nit}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {renderStatusBadges(item)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(item.lastFollowUpDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(item.nextFollowUpDate)}
                      </td>
                      <td className="px-4 py-3">
                        {item.observations ? (
                          <p
                            className="line-clamp-2 max-w-sm text-xs text-slate-600"
                            title={item.observations}
                          >
                            {item.observations}
                          </p>
                        ) : (
                          <span className="text-xs text-slate-400">
                            —
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex justify-end">
                          {renderActions(item)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {list && (
          <Pagination
            page={query.page}
            totalPages={list.meta.totalPages}
            total={list.meta.total}
            onPageChange={(page) => {
              setListLoading(true)
              setQuery((current) => ({ ...current, page }))
              writeUrlState({ page })
            }}
          />
        )}
        </section>
      )}

      <Modal
        open={Boolean(modal)}
        size={modal?.mode === 'history' ? 'lg' : 'md'}
        title={
          modal?.mode === 'evaluate'
            ? 'Evaluación de riesgo'
            : modal?.mode === 'reactivate'
              ? 'Reactivar contraparte'
              : 'Historial de evaluaciones'
        }
        description={modal?.item.businessName}
        onClose={closeModal}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-500">
            <Loader2 className="size-5 animate-spin" />
            Cargando detalle...
          </div>
        ) : (
          <div className="space-y-5">
            {modalError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {modalError}
              </div>
            )}

            {detail && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {documentLabel}
                    </p>
                    <p className="mt-1 font-medium text-slate-900">
                      {detail.nit}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Categoría
                    </p>
                    <p className="mt-1 font-medium text-slate-900">
                      {detail.category.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Último seguimiento
                    </p>
                    <p className="mt-1 font-medium text-slate-900">
                      {formatDate(detail.lastFollowUpDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Próximo seguimiento
                    </p>
                    <p className="mt-1 font-medium text-slate-900">
                      {formatDate(detail.nextFollowUpDate)}
                    </p>
                  </div>
                </div>
                {detail.observations && (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-amber-800">
                      Motivo de seguimiento
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-800">
                      {detail.observations}
                    </p>
                  </div>
                )}
              </div>
            )}

            {modal?.mode === 'evaluate' && (
              <>
                <p className="text-sm font-medium text-slate-900">
                  ¿La contraparte continúa presentando riesgo?
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setDecision('CONTINUE')}
                    className={`rounded-lg border p-4 text-left text-sm transition ${
                      decision === 'CONTINUE'
                        ? 'border-amber-300 bg-amber-50 text-slate-900 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <p className="font-semibold">Sí</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Permanece en seguimiento; próxima evaluación en
                      6 meses.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision('ARCHIVE')}
                    className={`rounded-lg border p-4 text-left text-sm transition ${
                      decision === 'ARCHIVE'
                        ? 'border-amber-300 bg-amber-50 text-slate-900 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <p className="font-semibold">No</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Se archiva y conserva su historial.
                    </p>
                  </button>
                </div>

                {decision === 'CONTINUE' && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    Próximo seguimiento programado:{' '}
                    <span className="font-semibold">
                      {formatDate(followUpPreview)}
                    </span>
                  </div>
                )}

                <div>
                  <label className={labelClass} htmlFor="risk-notes">
                    Observaciones (opcional)
                  </label>
                  <textarea
                    id="risk-notes"
                    rows={3}
                    value={notes}
                    onChange={(event) =>
                      setNotes(event.target.value)
                    }
                    className={inputClass}
                    placeholder="Detalle de la evaluación"
                  />
                </div>
              </>
            )}

            {modal?.mode === 'reactivate' && (
              <>
                <div>
                  <label
                    className={labelClass}
                    htmlFor="reactivate-date"
                  >
                    Nueva fecha de seguimiento
                  </label>
                  <input
                    id="reactivate-date"
                    type="date"
                    value={reactivateDate}
                    onChange={(event) =>
                      setReactivateDate(event.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label
                    className={labelClass}
                    htmlFor="reactivate-reason"
                  >
                    Motivo de la reactivación
                  </label>
                  <textarea
                    id="reactivate-reason"
                    rows={3}
                    required
                    value={notes}
                    onChange={(event) =>
                      setNotes(event.target.value)
                    }
                    className={inputClass}
                    placeholder="Explique por qué vuelve a seguimiento"
                  />
                </div>
              </>
            )}

            {modal?.mode === 'history' && detail && (
              <>
                {detail.archiveReason && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                    <p className="font-medium text-slate-900">
                      Motivo del archivado
                    </p>
                    <p className="mt-1 whitespace-pre-line text-slate-600">
                      {detail.archiveReason}
                    </p>
                    {detail.archivedAt && (
                      <p className="mt-2 text-xs text-slate-500">
                        {formatDateTime(detail.archivedAt)}
                      </p>
                    )}
                  </div>
                )}

                {detail.riskEvaluations.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    Aún no hay evaluaciones de riesgo registradas.
                  </p>
                ) : (
                  <div className="scrollbar-thin overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">
                            Decisión
                          </th>
                          <th className="px-3 py-2 font-medium">
                            Fecha
                          </th>
                          <th className="px-3 py-2 font-medium">
                            Próximo seguimiento
                          </th>
                          <th className="px-3 py-2 font-medium">
                            Registrado por
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.riskEvaluations.map((evaluation) => (
                          <tr key={evaluation.id}>
                            <td className="px-3 py-2">
                              <Badge
                                tone={
                                  decisionTones[
                                    evaluation.decision
                                  ]
                                }
                              >
                                {decisionLabels[evaluation.decision]}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {formatDate(evaluation.evaluatedAt)}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {formatDate(
                                evaluation.nextFollowUpDate,
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {evaluation.createdBy.name}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {modal && modal.mode !== 'history' && (
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className={secondaryButtonClass}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className={
                    modal.mode === 'evaluate' &&
                    decision === 'ARCHIVE'
                      ? dangerButtonClass
                      : primaryButtonClass
                  }
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : modal.mode === 'evaluate' ? (
                    <ClipboardCheck className="size-4" />
                  ) : (
                    <Archive className="size-4" />
                  )}
                  {modal.mode === 'evaluate'
                    ? 'Guardar evaluación'
                    : 'Confirmar reactivación'}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
