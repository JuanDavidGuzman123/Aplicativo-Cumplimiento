import { Loader2, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '../components/Badge'
import { Pagination } from '../components/Pagination'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { getAuditLogs } from '../services/audit'
import type { AuditListResponse } from '../types/audit'
import { getApiErrorMessage } from '../utils/api-error'
import { formatDateTime } from '../utils/labels'
import {
  inputClass,
  labelClass,
  secondaryButtonClass,
} from '../utils/styles'

const PAGE_SIZE = 20

const actionLabels: Record<string, string> = {
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario actualizado',
  USER_ACTIVATED: 'Usuario activado',
  USER_DEACTIVATED: 'Usuario desactivado',
  SUBPROCESS_CREATED: 'Subproceso creado',
  SUBPROCESS_UPDATED: 'Subproceso actualizado',
  COUNTERPARTY_CREATED: 'Contraparte creada',
  COUNTERPARTY_UPDATED: 'Contraparte actualizada',
  COUNTERPARTY_ARCHIVED: 'Contraparte archivada',
  COUNTERPARTY_REACTIVATED: 'Contraparte reactivada',
  FOLLOW_UP_CREATED: 'Seguimiento creado',
  FOLLOW_UP_UPDATED: 'Seguimiento actualizado',
  FOLLOW_UP_FINALIZED: 'Seguimiento finalizado',
  DOCUMENT_UPLOADED: 'Documento adjuntado',
  IMPORT_UPLOADED: 'Importación cargada',
  IMPORT_CONFIRMED: 'Importación confirmada',
}

const entityLabels: Record<string, string> = {
  User: 'Usuario',
  Subprocess: 'Subproceso',
  Counterparty: 'Contraparte',
  FollowUp: 'Seguimiento',
  Document: 'Documento',
  ImportBatch: 'Importación',
}

function formatDetails(details: unknown): string {
  if (details === null || details === undefined) {
    return 'Sin detalle'
  }

  try {
    return JSON.stringify(details, null, 2)
  } catch {
    return String(details)
  }
}

export function AuditPage() {
  const [entityFilter, setEntityFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const debouncedEntity = useDebouncedValue(entityFilter)
  const debouncedAction = useDebouncedValue(actionFilter)
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)

  const [result, setResult] = useState<AuditListResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    getAuditLogs({
      entity: debouncedEntity.trim() || undefined,
      action: debouncedAction.trim() || undefined,
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
              'No fue posible cargar la auditoría',
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
  }, [debouncedEntity, debouncedAction, page, refreshKey])

  const refresh = () => {
    setIsLoading(true)
    setRefreshKey((value) => value + 1)
  }

  const clearFilters = () => {
    setEntityFilter('')
    setActionFilter('')
    setPage(1)
  }

  const hasFilters = Boolean(entityFilter.trim() || actionFilter.trim())

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Auditoría
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Consulte las acciones críticas registradas por usuario,
            entidad y fecha.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isLoading}
          className={secondaryButtonClass}
        >
          <RefreshCw
            className={`size-4 ${isLoading ? 'animate-spin' : ''}`}
          />
          Actualizar
        </button>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div>
            <label htmlFor="audit-entity" className={labelClass}>
              Entidad
            </label>
            <input
              id="audit-entity"
              type="search"
              value={entityFilter}
              onChange={(event) => {
                setEntityFilter(event.target.value)
                setPage(1)
              }}
              placeholder="Ej. Counterparty"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="audit-action" className={labelClass}>
              Acción
            </label>
            <input
              id="audit-action"
              type="search"
              value={actionFilter}
              onChange={(event) => {
                setActionFilter(event.target.value)
                setPage(1)
              }}
              placeholder="Ej. FOLLOW_UP_FINALIZED"
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className={secondaryButtonClass}
          >
            <X className="size-4" />
            Limpiar
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Registro de acciones
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {result
                ? `${result.meta.total} registro${result.meta.total === 1 ? '' : 's'}`
                : 'Cargando registros'}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Cargando auditoría
          </div>
        ) : result && result.data.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            No hay registros de auditoría para los filtros seleccionados.
          </div>
        ) : result ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                  <th className="px-4 py-3 font-medium">Entidad</th>
                  <th className="px-4 py-3 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {entry.user?.name ?? 'Sistema'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {entry.user?.email ?? 'Sin usuario asociado'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="blue">
                        {actionLabels[entry.action] ?? entry.action}
                      </Badge>
                      <p className="mt-1 font-mono text-[11px] text-slate-500">
                        {entry.action}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {entityLabels[entry.entity] ?? entry.entity}
                      </p>
                      {entry.entityId && (
                        <p className="mt-0.5 max-w-48 truncate font-mono text-[11px] text-slate-500">
                          {entry.entityId}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <details>
                        <summary className="cursor-pointer text-xs font-medium text-slate-600">
                          Ver detalle
                        </summary>
                        <pre className="mt-2 max-w-md overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 text-xs text-slate-700">
                          {formatDetails(entry.details)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {result && (
          <Pagination
            page={result.meta.page}
            totalPages={result.meta.totalPages}
            total={result.meta.total}
            onPageChange={setPage}
          />
        )}
      </section>
    </div>
  )
}
