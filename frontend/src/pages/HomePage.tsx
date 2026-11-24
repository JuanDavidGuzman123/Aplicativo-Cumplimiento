import {
  ArrowRight,
  CalendarCheck,
  ClipboardCheck,
  FileSpreadsheet,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { roleLabels } from '../utils/labels'

type ModuleLink = {
  to: string
  title: string
  description: string
  icon: LucideIcon
}

export function HomePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const modules: ModuleLink[] = [
    {
      to: '/actualizacion-anual',
      title: 'Actualizacion Anual Arriendos',
      description:
        'Consulte las contrapartes activas e inactivas y su estado de actualización anual.',
      icon: CalendarCheck,
    },
    {
      to: '/actualizacion-anual/clientes',
      title: 'Actualizacion Anual Clientes',
      description:
        'Consulte las actualizaciones anuales de clientes corporativos y sus vencimientos desde FR-SG-80.',
      icon: CalendarCheck,
    },
    {
      to: '/contrapartes',
      title: 'Contrapartes en seguimiento',
      description:
        'Evalúe si la contraparte continúa con riesgo, programe el próximo seguimiento o archive la decisión.',
      icon: ClipboardCheck,
    },
    ...(isAdmin
      ? [
          {
            to: '/importar',
            title: 'Importar Excel',
            description:
              'Cargue archivos .xlsx o .xlsm, valide el mapeo y confirme la importación.',
            icon: FileSpreadsheet,
          },
          {
            to: '/usuarios',
            title: 'Usuarios',
            description:
              'Cree cuentas, asigne roles y controle el acceso al sistema.',
            icon: Users,
          },
        ]
      : []),
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 sm:p-8">
        <div className="absolute -right-16 -top-16 size-64 rounded-full bg-amber-100/70 blur-2xl" />
        <div className="absolute -bottom-24 left-1/3 size-64 rounded-full bg-emerald-100/40 blur-3xl" />
        <div className="relative">
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
            Panel de control
          </span>
          <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">
            Hola, {user?.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Sesión iniciada como{' '}
            {user ? roleLabels[user.role] : ''}. Estas son las opciones
            disponibles para tu perfil.
          </p>
          <div className="mt-5 h-1 w-16 rounded-full bg-amber-400" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
        <h2 className="text-base font-semibold text-slate-900">
          Accesos rápidos
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Seleccione un módulo para continuar. Las alertas de actualización
          anual y de seguimiento están separadas en dos campanas del
          encabezado.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map(({ to, title, description, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-amber-200 hover:bg-amber-50/40 hover:shadow-md hover:shadow-slate-900/5"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-md bg-amber-100 text-emerald-900 transition group-hover:bg-amber-200">
                  <Icon className="size-4" />
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {title}
                </span>
                <ArrowRight className="ml-auto size-4 text-amber-600 transition group-hover:translate-x-0.5" />
              </div>
              <p className="mt-3 text-sm text-slate-600">{description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
