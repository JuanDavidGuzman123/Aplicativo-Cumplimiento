import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Loader2,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '../components/Badge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useToast } from '../components/toast-context'
import { UserFormModal } from '../components/UserFormModal'
import { useAuth } from '../hooks/useAuth'
import { getUsers, updateUserStatus } from '../services/users'
import type { User } from '../types/user'
import { getApiErrorMessage } from '../utils/api-error'
import { formatDate, roleLabels } from '../utils/labels'
import { inputClass, primaryButtonClass } from '../utils/styles'

type UserActionsProps = {
  user: User
  isSelf: boolean
  onEdit: () => void
  onToggleStatus: () => void
}

function UserActions({
  user,
  isSelf,
  onEdit,
  onToggleStatus,
}: UserActionsProps) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-amber-300 hover:bg-amber-50"
      >
        <Pencil className="size-3.5" />
        Editar
      </button>
      <button
        type="button"
        onClick={onToggleStatus}
        disabled={isSelf}
        title={
          isSelf
            ? 'No puede desactivar su propio usuario'
            : undefined
        }
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
          user.active
            ? 'border-red-200 text-red-700 hover:bg-red-50'
            : 'border-slate-300 text-slate-600 hover:bg-slate-50'
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
  )
}

type UserSortField = 'name' | 'role' | 'active' | 'createdAt'
type SortDirection = 'asc' | 'desc'

type SortableHeaderProps = {
  label: string
  field: UserSortField
  sort: UserSortField
  dir: SortDirection
  onSort: (field: UserSortField) => void
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

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const { showToast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<UserSortField>('name')
  const [dir, setDir] = useState<SortDirection>('asc')
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

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = term
      ? users.filter((user) =>
          `${user.name} ${user.email}`.toLowerCase().includes(term),
        )
      : users

    const valueFor = (user: User): string | number => {
      switch (sort) {
        case 'role':
          return user.role
        case 'active':
          return user.active ? 1 : 0
        case 'createdAt':
          return user.createdAt ?? ''
        default:
          return user.name
      }
    }

    return [...filtered].sort((a, b) => {
      const first = valueFor(a)
      const second = valueFor(b)
      const result =
        typeof first === 'number' && typeof second === 'number'
          ? first - second
          : String(first).localeCompare(String(second), 'es')

      return dir === 'asc' ? result : -result
    })
  }, [users, search, sort, dir])

  const handleSort = (field: UserSortField) => {
    const nextDir: SortDirection =
      sort === field && dir === 'asc' ? 'desc' : 'asc'

    setSort(field)
    setDir(nextDir)
  }

  const handleSaved = (message: string) => {
    setError('')
    showToast(message)
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
      showToast(
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
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
            <Users className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Administración
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold text-slate-900">
              Usuarios
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Administre las cuentas y los roles con acceso al sistema.
            </p>
          </div>
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar usuarios por nombre o correo"
            className={`${inputClass} pl-9`}
          />
        </div>
        <p className="text-xs text-slate-500">
          Mostrando {filteredUsers.length} de {users.length} usuarios
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
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
          <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {filteredUsers.map((user) => {
                const isSelf = user.id === currentUser?.id

                return (
                  <li key={user.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">
                          {user.name}
                          {isSelf && (
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              (tú)
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 break-all text-xs text-slate-500">
                          {user.email}
                        </p>
                      </div>
                      <Badge tone={user.active ? 'green' : 'red'}>
                        {user.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge
                        tone={user.role === 'ADMIN' ? 'blue' : 'slate'}
                      >
                        {roleLabels[user.role]}
                      </Badge>
                      <span className="text-[11px] text-slate-500">
                        Creado el {formatDate(user.createdAt)}
                      </span>
                    </div>
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <UserActions
                        user={user}
                        isSelf={isSelf}
                        onEdit={() => setEditingUser(user)}
                        onToggleStatus={() => setStatusTarget(user)}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>

            <div
              role="region"
              aria-label="Tabla de usuarios, desplazable horizontalmente"
              tabIndex={0}
              className="scrollbar-thin hidden max-h-[34rem] overflow-auto md:block"
            >
              <table
                aria-label="Usuarios del sistema"
                className="min-w-full divide-y divide-slate-200 text-left text-sm"
              >
                <caption className="sr-only">
                  Usuarios registrados, su rol, estado y acciones
                  disponibles
                </caption>
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-600 backdrop-blur-sm">
                  <tr>
                    <SortableHeader
                      label="Usuario"
                      field="name"
                      sort={sort}
                      dir={dir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Rol"
                      field="role"
                      sort={sort}
                      dir={dir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Estado"
                      field="active"
                      sort={sort}
                      dir={dir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Creado"
                      field="createdAt"
                      sort={sort}
                      dir={dir}
                      onSort={handleSort}
                    />
                    <th
                      scope="col"
                      className="px-4 py-3 text-right font-semibold"
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredUsers.map((user) => {
                    const isSelf = user.id === currentUser?.id

                    return (
                      <tr
                        key={user.id}
                        className="transition hover:bg-amber-50/40"
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">
                            {user.name}
                            {isSelf && (
                              <span className="ml-2 text-xs font-normal text-slate-500">
                                (tú)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {user.email}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              user.role === 'ADMIN' ? 'blue' : 'slate'
                            }
                          >
                            {roleLabels[user.role]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={user.active ? 'green' : 'red'}>
                            {user.active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <UserActions
                            user={user}
                            isSelf={isSelf}
                            onEdit={() => setEditingUser(user)}
                            onToggleStatus={() => setStatusTarget(user)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
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
