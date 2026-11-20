import {
  Loader2,
  Pencil,
  Plus,
  Power,
  PowerOff,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '../components/Badge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SubprocessFormModal } from '../components/SubprocessFormModal'
import {
  getSubprocesses,
  updateSubprocess,
} from '../services/subprocesses'
import type { Subprocess } from '../types/subprocess'
import { getApiErrorMessage } from '../utils/api-error'
import { formatDate } from '../utils/labels'
import { primaryButtonClass } from '../utils/styles'

export function SubprocessesPage() {
  const [subprocesses, setSubprocesses] = useState<Subprocess[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Subprocess | null>(null)
  const [statusTarget, setStatusTarget] = useState<Subprocess | null>(
    null,
  )
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  const loadSubprocesses = useCallback(async () => {
    try {
      setSubprocesses(await getSubprocesses())
    } catch (loadError) {
      setError(
        getApiErrorMessage(
          loadError,
          'No fue posible cargar los subprocesos',
        ),
      )
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
          setError(
            getApiErrorMessage(
              loadError,
              'No fue posible cargar los subprocesos',
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
  }, [])

  useEffect(() => {
    if (!success) {
      return
    }

    const timeout = window.setTimeout(() => setSuccess(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [success])

  const handleSaved = (message: string) => {
    setError('')
    setSuccess(message)
    void loadSubprocesses()
  }

  const confirmStatusChange = async () => {
    if (!statusTarget) {
      return
    }

    setIsUpdatingStatus(true)
    setError('')

    try {
      await updateSubprocess(statusTarget.id, {
        active: !statusTarget.active,
      })
      setSuccess(
        statusTarget.active
          ? 'Subproceso desactivado correctamente'
          : 'Subproceso activado correctamente',
      )
      setStatusTarget(null)
      await loadSubprocesses()
    } catch (statusError) {
      setError(
        getApiErrorMessage(
          statusError,
          'No fue posible actualizar el subproceso',
        ),
      )
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Subprocesos
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Administre el catálogo que se asigna a las contrapartes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className={primaryButtonClass}
        >
          <Plus className="size-4" />
          Nuevo subproceso
        </button>
      </div>

      <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        Los subprocesos inactivos no se ofrecen al crear nuevas
        contrapartes. Las contrapartes que ya los tienen asignados
        conservan la relación.
      </div>

      {error && (
        <div className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError('')
              setIsLoading(true)
              void loadSubprocesses()
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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <Loader2 className="size-5 animate-spin" />
            Cargando subprocesos...
          </div>
        ) : subprocesses.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-900">
              No hay subprocesos registrados
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Cree el primer subproceso para poder registrar
              contrapartes.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    Descripción
                  </th>
                  <th className="px-4 py-3 font-medium">Contrapartes</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {subprocesses.map((subprocess) => (
                  <tr
                    key={subprocess.id}
                    className="hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {subprocess.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        Creado {formatDate(subprocess.createdAt)}
                      </p>
                    </td>
                    <td className="hidden max-w-xs px-4 py-3 text-slate-600 md:table-cell">
                      {subprocess.description || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {subprocess._count.counterparties}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={subprocess.active ? 'green' : 'slate'}
                      >
                        {subprocess.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(subprocess)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          <Pencil className="size-3.5" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatusTarget(subprocess)}
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                            subprocess.active
                              ? 'border-red-200 text-red-700 hover:bg-red-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {subprocess.active ? (
                            <PowerOff className="size-3.5" />
                          ) : (
                            <Power className="size-3.5" />
                          )}
                          {subprocess.active
                            ? 'Desactivar'
                            : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen && (
        <SubprocessFormModal
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {editing && (
        <SubprocessFormModal
          mode="edit"
          subprocess={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={
          statusTarget?.active
            ? 'Desactivar subproceso'
            : 'Activar subproceso'
        }
        message={
          statusTarget
            ? statusTarget.active
              ? `¿Confirma que desea desactivar "${statusTarget.name}"? No estará disponible para nuevas contrapartes, pero las ${statusTarget._count.counterparties} contrapartes asociadas conservarán el subproceso.`
              : `¿Confirma que desea activar "${statusTarget.name}"? Volverá a estar disponible para nuevas contrapartes.`
            : ''
        }
        confirmLabel={statusTarget?.active ? 'Desactivar' : 'Activar'}
        tone={statusTarget?.active ? 'danger' : 'primary'}
        isLoading={isUpdatingStatus}
        onConfirm={confirmStatusChange}
        onClose={() => {
          if (!isUpdatingStatus) {
            setStatusTarget(null)
          }
        }}
      />
    </div>
  )
}
