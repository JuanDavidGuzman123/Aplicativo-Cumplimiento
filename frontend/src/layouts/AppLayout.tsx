import {
  Building2,
  CalendarCheck,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { roleLabels } from '../utils/labels'
import {
  AnnualUpdatesAlertsButton,
  FollowUpAlertsButton,
} from '../components/AlertCenter'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

type NavGroup = {
  label: string
  items: NavItem[]
}

function getInitials(name?: string) {
  if (!name) {
    return 'U'
  }

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(() =>
    window.matchMedia('(min-width: 1024px)').matches,
  )
  const drawerRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const closeDrawer = useCallback(() => {
    setMobileOpen(false)
    if (!isDesktop) {
      window.requestAnimationFrame(() => menuButtonRef.current?.focus())
    }
  }, [isDesktop])

  const navigation: NavGroup[] = [
    {
      label: 'General',
      items: [
        { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
      ],
    },
    {
      label: 'Actualización anual',
      items: [
        {
          to: '/actualizacion-anual',
          label: 'Arriendos',
          icon: CalendarCheck,
          end: true,
        },
        {
          to: '/actualizacion-anual/clientes',
          label: 'Clientes',
          icon: Building2,
        },
      ],
    },
    {
      label: 'Seguimiento',
      items: [
        {
          to: '/contrapartes',
          label: 'Contrapartes',
          icon: ClipboardCheck,
        },
      ],
    },
    ...(user?.role === 'ADMIN'
      ? [
          {
            label: 'Administración',
            items: [
              {
                to: '/importar',
                label: 'Importar Excel',
                icon: FileSpreadsheet,
              },
              { to: '/usuarios', label: 'Usuarios', icon: Users },
            ],
          },
        ]
      : []),
  ]

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const syncDesktop = () => {
      setIsDesktop(media.matches)
      if (media.matches) {
        setMobileOpen(false)
      }
    }

    media.addEventListener('change', syncDesktop)

    return () => media.removeEventListener('change', syncDesktop)
  }, [])

  useEffect(() => {
    if (!mobileOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDrawer()
        return
      }

      if (event.key !== 'Tab' || !drawerRef.current) {
        return
      }

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)

      if (focusable.length === 0) {
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    const focusFrame = window.requestAnimationFrame(() =>
      closeButtonRef.current?.focus(),
    )

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOpen, closeDrawer])

  return (
    <div className="min-h-screen">
      <a
        href="#contenido-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-emerald-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Saltar al contenido
      </a>

      {mobileOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden"
          onClick={closeDrawer}
        />
      )}

      <aside
        ref={drawerRef}
        id="menu-lateral"
        role={isDesktop ? undefined : 'dialog'}
        aria-modal={isDesktop ? undefined : mobileOpen}
        aria-hidden={!isDesktop && !mobileOpen}
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white shadow-2xl shadow-slate-950/20 transition-transform lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-900 text-amber-300 shadow-sm shadow-emerald-950/20">
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
            ref={closeButtonRef}
            type="button"
            onClick={closeDrawer}
            className="inline-flex size-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav
          aria-label="Navegación principal"
          className="scrollbar-thin flex-1 overflow-y-auto p-3"
        >
          {navigation.map((group) => (
            <div key={group.label} className="py-2 first:pt-0 last:pb-0">
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map(
                  ({ to, label, icon: Icon, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                          isActive
                            ? 'bg-emerald-900 text-white shadow-sm shadow-emerald-950/20'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            className={`size-4 shrink-0 ${
                              isActive
                                ? 'text-amber-300'
                                : 'text-slate-400 group-hover:text-slate-600'
                            }`}
                          />
                          <span className="truncate">{label}</span>
                          {isActive && (
                            <span className="ml-auto size-1.5 rounded-full bg-amber-300" />
                          )}
                        </>
                      )}
                    </NavLink>
                  ),
                )}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-slate-700">
              Sistema interno
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Área de Cumplimiento
            </p>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-slate-200 bg-white/85 px-4 shadow-sm shadow-slate-900/5 backdrop-blur-md lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex size-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 lg:hidden"
              aria-label="Abrir menú"
              aria-expanded={mobileOpen}
              aria-controls="menu-lateral"
            >
              <Menu className="size-5" />
            </button>
            <div className="hidden items-center gap-2 xl:flex">
              <span className="size-1.5 rounded-full bg-amber-400" />
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Área de Cumplimiento
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <AnnualUpdatesAlertsButton />
            <FollowUpAlertsButton />
            <div className="mx-1 hidden h-8 w-px bg-slate-200 sm:block" />
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-sm shadow-slate-900/5 sm:flex">
              <span className="flex size-7 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-emerald-900">
                {getInitials(user?.name)}
              </span>
              <div className="max-w-32 text-left">
                <p className="truncate text-xs font-semibold leading-tight text-slate-900">
                  {user?.name}
                </p>
                <p className="truncate text-[11px] leading-tight text-slate-500">
                  {user ? roleLabels[user.role] : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm shadow-slate-900/5 transition hover:border-amber-300 hover:bg-amber-50 hover:text-slate-950 sm:size-auto sm:min-h-10 sm:gap-2 sm:px-3"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut className="size-4" />
              <span className="hidden text-sm font-semibold sm:inline">
                Salir
              </span>
            </button>
          </div>
        </header>

        <main
          id="contenido-principal"
          className="scroll-mt-20 p-4 sm:p-6 lg:p-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
