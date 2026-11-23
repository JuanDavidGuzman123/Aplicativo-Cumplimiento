import {
  Loader2,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserX,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '../components/Badge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { UserFormModal } from '../components/UserFormModal'
import { useAuth } from '../hooks/useAuth'
import { getUsers, updateUserStatus } from '../services/users'
import type { User } from '../types/user'
import { getApiErrorMessage } from '../utils/api-error'
import { formatDate, roleLabels } from '../utils/labels'
import { primaryButtonClass } from '../utils/styles'

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [statusTarget, setStatusTarget] = useState<User | null>(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await getUsers())
    } catch (loadError) {
      setError(
        getApiErrorMessage(
          loadError,
          'No fue posible cargar los usuarios',
        ),
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    getUsers()
      .then((data) => {
        if (active) {
          setUsers(data)
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(
            getApiErrorMessage(
              loadError,
              'No fue posible cargar los usuarios',
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

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) {
      return users
    }

    return users.filter((user) =>
      `${user.name} ${user.email}`.toLowerCase().includes(term),
    )
  }, [users, search])

  const handleSaved = (message: string) => {
    setError('')
    setSuccess(message)
    void loadUsers()
  }

  const confirmStatusChange = async () => {
    if (!statusTarget) {
      return
    }

    setIsUpdatingStatus(true)
    setError('')

    try {
      await updateUserStatus(statusTarget.id, !statusTarget.active)
      setSuccess(
        statusTarget.active
          ? 'Usuario desactivado correctamente'
          : 'Usuario activado correctamente',
      )
      setStatusTarget(null)
      await loadUsers()
    } catch (statusError) {
      setError(
        getApiErrorMessage(
          statusError,
          'No fue posible actualizar el usuario',
        ),
      )
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Usuarios
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Administre las cuentas y los roles con acceso al sistema.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className={primaryButtonClass}
        >
          <Plus className="size-4" />
          Nuevo usuario
        </button>
      </div>

      {error && (
        <div className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError('')
              setIsLoading(true)
              void loadUsers()
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o correo"
            className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <p className="text-xs text-slate-500">
          Mostrando {filteredUsers.length} de {users.length} usuarios
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <Loader2 className="size-5 animate-spin" />
            Cargando usuarios...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-900">
              {users.length === 0
                ? 'No hay usuarios registrados'
                : 'No se encontraron usuarios'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {users.length === 0
                ? 'Cree el primer usuario para permitir el acceso al sistema.'
                : 'Pruebe con otro nombre o correo electrónico.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    Creado
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredUsers.map((user) => {
                  const isSelf = user.id === currentUser?.id

                  return (
                    <tr key={user.id} className="hover:bg-amber-50/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {user.name}
                          {isSelf && (
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              (tú)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={user.role === 'ADMIN' ? 'blue' : 'slate'}>
                          {roleLabels[user.role]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={user.active ? 'green' : 'red'}>
                          {user.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingUser(user)}
                            className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-amber-50"
                          >
                            <Pencil className="size-3.5" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatusTarget(user)}
                            disabled={isSelf}
                            title={
                              isSelf
                                ? 'No puede desactivar su propio usuario'
                                : undefined
                            }
                            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              user.active
                                ? 'border-red-200 text-red-700 hover:bg-red-50'
                                : 'border-slate-200 text-slate-600 hover:bg-amber-50'
                            }`}
                          >
                            {user.active ? (
                              <UserX className="size-3.5" />
                            ) : (
                              <UserCheck className="size-3.5" />
                            )}
                            {user.active ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen && (
        <UserFormModal
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {editingUser && (
        <UserFormModal
          mode="edit"
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={
          statusTarget?.active ? 'Desactivar usuario' : 'Activar usuario'
        }
        message={
          statusTarget
            ? statusTarget.active
              ? `¿Confirma que desea desactivar a ${statusTarget.name}? No podrá iniciar sesión hasta que sea activado nuevamente.`
              : `¿Confirma que desea activar a ${statusTarget.name}? Podrá iniciar sesión nuevamente.`
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
