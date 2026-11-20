import {
  Archive,
  ArrowLeft,
  Loader2,
  Pencil,
  RotateCcw,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { CounterpartyFormModal } from '../components/CounterpartyFormModal'
import { CounterpartyStatusModal } from '../components/CounterpartyStatusModal'
import { FollowUpsSection } from '../components/FollowUpsSection'
import { useAuth } from '../hooks/useAuth'
import { getCounterparty } from '../services/counterparties'
import { getSubprocesses } from '../services/subprocesses'
import type { CounterpartyDetail } from '../types/counterparty'
import type { Subprocess } from '../types/subprocess'
import { getApiErrorMessage } from '../utils/api-error'
import {
  calendarStatusLabels,
  calendarStatusTones,
  counterpartyStatusLabels,
} from '../utils/counterparty'
import {
  formatDate,
  formatDateTime,
} from '../utils/labels'
import {
  primaryButtonClass,
  secondaryButtonClass,
} from '../utils/styles'

export function CounterpartyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [counterparty, setCounterparty] =
    useState<CounterpartyDetail | null>(null)
  const [subprocesses, setSubprocesses] = useState<Subprocess[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [actionMode, setActionMode] = useState<
    'archive' | 'reactivate' | null
  >(null)

  useEffect(() => {
    if (!id) {
      return
    }

    let active = true

    getCounterparty(id)
      .then((data) => {
        if (active) {
          setCounterparty(data)
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(
            getApiErrorMessage(
              loadError,
              'No fue posible cargar la contraparte',
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
  }, [id, refreshKey])

  useEffect(() => {
    if (!success) {
      return
    }

    const timeout = window.setTimeout(() => setSuccess(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [success])

  useEffect(() => {
    let active = true

    getSubprocesses()
      .then((data) => {
        if (active) {
          setSubprocesses(data)
        }
      })
      .catch(() => {
        if (active) {
          setSubprocesses([])
        }
      })

    return () => {
      active = false
    }
  }, [])

  const handleSaved = (message: string) => {
    setError('')
    setSuccess(message)
    setRefreshKey((value) => value + 1)
  }

  if (!id) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No fue posible identificar la contraparte solicitada.
        </div>
        <Link
          to="/contrapartes"
          className={`${secondaryButtonClass} mt-4`}
        >
          <ArrowLeft className="size-4" />
          Volver a contrapartes
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-500">
        <Loader2 className="size-5 animate-spin" />
        Cargando contraparte...
      </div>
    )
  }

  if (!counterparty) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || 'Contraparte no encontrada'}
        </div>
        <div className="flex gap-3">
          <Link to="/contrapartes" className={secondaryButtonClass}>
            <ArrowLeft className="size-4" />
            Volver a contrapartes
          </Link>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true)
              setError('')
              setRefreshKey((value) => value + 1)
            }}
            className={primaryButtonClass}
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          to="/contrapartes"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 transition hover:text-slate-900"
        >
          <ArrowLeft className="size-4" />
          Contrapartes
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {counterparty.businessName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            NIT {counterparty.nit}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge
              tone={
                counterparty.status === 'ACTIVE' ? 'green' : 'slate'
              }
            >
              {counterpartyStatusLabels[counterparty.status]}
            </Badge>
            <Badge
              tone={
                calendarStatusTones[counterparty.calendarStatus]
              }
            >
              {calendarStatusLabels[counterparty.calendarStatus]}
            </Badge>
          </div>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className={secondaryButtonClass}
            >
              <Pencil className="size-4" />
              Editar
            </button>
            <button
              type="button"
              onClick={() =>
                setActionMode(
                  counterparty.status === 'ACTIVE'
                    ? 'archive'
                    : 'reactivate',
                )
              }
              className={
                counterparty.status === 'ACTIVE'
                  ? 'inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700'
                  : primaryButtonClass
              }
            >
              {counterparty.status === 'ACTIVE' ? (
                <Archive className="size-4" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              {counterparty.status === 'ACTIVE'
                ? 'Archivar'
                : 'Reactivar'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">
          Información general
        </h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Subproceso
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {counterparty.subprocess.name}
              {!counterparty.subprocess.active && (
                <span className="ml-1 text-xs text-slate-500">
                  (inactivo)
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Fecha de registro
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {formatDate(counterparty.registrationDate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Último seguimiento
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {formatDate(counterparty.lastFollowUpDate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Próximo seguimiento
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {formatDate(counterparty.nextFollowUpDate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Seguimientos registrados
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {counterparty.followUpCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Última actualización
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {formatDateTime(counterparty.updatedAt)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">
          Observaciones
        </h2>
        <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
          {counterparty.observations || 'Sin observaciones registradas.'}
        </p>
      </section>

      {(counterparty.archivedAt ||
        counterparty.reactivatedAt) && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">
            Archivo y reactivación
          </h2>
          <div className="mt-4 space-y-5">
            {counterparty.archivedAt && (
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Archivo
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {formatDateTime(counterparty.archivedAt)}
                  {counterparty.archivedBy
                    ? ` · ${counterparty.archivedBy.name}`
                    : ''}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                  {counterparty.archiveReason}
                </p>
              </div>
            )}

            {counterparty.reactivatedAt && (
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Reactivación
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {formatDateTime(counterparty.reactivatedAt)}
                  {counterparty.reactivatedBy
                    ? ` · ${counterparty.reactivatedBy.name}`
                    : ''}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                  {counterparty.reactivationReason}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      <FollowUpsSection
        counterparty={counterparty}
        onChanged={handleSaved}
      />

      {editOpen && (
        <CounterpartyFormModal
          mode="edit"
          counterparty={counterparty}
          subprocesses={
            subprocesses.length > 0
              ? subprocesses
              : [counterparty.subprocess]
          }
          onClose={() => setEditOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {actionMode && (
        <CounterpartyStatusModal
          mode={actionMode}
          counterparty={counterparty}
          onClose={() => setActionMode(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
