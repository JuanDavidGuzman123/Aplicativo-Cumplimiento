import {
  Building2,
  CalendarCheck,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { roleLabels } from '../utils/labels'
import { NotificationBell } from '../components/NotificationBell'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navigation: NavItem[] = [
    { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
    {
      to: '/contrapartes',
      label: 'Contrapartes',
      icon: Building2,
    },
    {
      to: '/actualizacion-anual',
      label: 'Actualización anual',
      icon: CalendarCheck,
    },
    ...(user?.role === 'ADMIN'
      ? [
          {
            to: '/subprocesos',
            label: 'Subprocesos',
            icon: Layers,
          },
          {
            to: '/importar',
            label: 'Importar Excel',
            icon: FileSpreadsheet,
          },
          { to: '/auditoria', label: 'Auditoría', icon: History },
          { to: '/usuarios', label: 'Usuarios', icon: Users },
        ]
      : []),
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight text-slate-900">
                Seguimiento
              </p>
              <p className="text-xs leading-tight text-slate-500">
                de Contrapartes
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <p className="text-xs text-slate-500">Sistema interno</p>
          <p className="text-xs text-slate-500">Área de Cumplimiento</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>

          <div className="ml-auto flex items-center gap-4">
            <NotificationBell />
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">
                {user?.name}
              </p>
              <p className="text-xs text-slate-500">
                {user ? roleLabels[user.role] : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </header>

        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
