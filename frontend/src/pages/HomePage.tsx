import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  FileSpreadsheet,
  RefreshCw,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  getAnnualNotifications,
} from '../services/annual-notifications'
import {
  getExternalSummary,
  getExternalUpdatesDue,
} from '../services/external-data'
import { getNotifications } from '../services/notifications'
import type {
  ExternalSummary,
  ExternalDueListResponse,
} from '../types/external-data'
import type {
  AnnualNotificationsResponse,
  FollowUpNotificationsResponse,
} from '../types/notification'
import { formatDate, roleLabels } from '../utils/labels'
import { secondaryButtonClass } from '../utils/styles'

type ModuleLink = {
  to: string
  title: string
  description: string
  icon: LucideIcon
  iconClass: string
}

type SourceCard = {
  key: string
  title: string
  description: string
  to: string
  active: number
  pending: number
  updated: number
}

type DashboardData = {
  pendingAnnual: number
  dueSoon: number
  overdue: number
  followUpTotal: number
  unreadAlerts: number
  businessDate: string
  sources: SourceCard[]
}

type StatCardProps = {
  label: string
  value: number
  detail: string
  icon: LucideIcon
  iconClass: string
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  iconClass,
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
            {value}
          </p>
        </div>
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
        >
          <Icon className="size-5" />
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-500">{detail}</p>
    </div>
  )
}

function buildSourceCard(
  key: string,
  title: string,
  description: string,
  to: string,
  summary: ExternalSummary,
): SourceCard {
  return {
    key,
    title,
    description,
    to,
    active: summary.totals.active,
    pending: summary.annual.active.pendingUpdate,
    updated: summary.annual.updatedThisYear,
  }
}

export function HomePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading')
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    const load = async () => {
      const [
        arriendosResult,
        clientesResult,
        dueArriendosResult,
        dueClientesResult,
        followResult,
        annualResult,
      ] = await Promise.allSettled([
        getExternalSummary('arriendos'),
        getExternalSummary('clientes'),
        getExternalUpdatesDue({}, 'arriendos'),
        getExternalUpdatesDue({}, 'clientes'),
        getNotifications(),
        getAnnualNotifications(),
      ])

      if (!active) {
        return
      }

      if (
        arriendosResult.status !== 'fulfilled' ||
        clientesResult.status !== 'fulfilled' ||
        dueArriendosResult.status !== 'fulfilled' ||
        dueClientesResult.status !== 'fulfilled' ||
        followResult.status !== 'fulfilled' ||
        annualResult.status !== 'fulfilled'
      ) {
        setError(
          'No fue posible cargar las métricas del panel. Intente nuevamente.',
        )
        setStatus('error')
        return
      }

      const arriendos = arriendosResult.value
      const clientes = clientesResult.value
      const dueArriendos: ExternalDueListResponse =
        dueArriendosResult.value
      const dueClientes: ExternalDueListResponse =
        dueClientesResult.value
      const followNotifications: FollowUpNotificationsResponse =
        followResult.value
      const annualNotifications: AnnualNotificationsResponse =
        annualResult.value

      const pendingAnnual = annualNotifications.unreadCount
      const followUpTotal = followNotifications.unreadCount
      const dueSoon =
        dueArriendos.summary.upcoming +
        dueClientes.summary.upcoming +
        dueArriendos.summary.dueToday +
        dueClientes.summary.dueToday
      const overdue =
        dueArriendos.summary.overdue + dueClientes.summary.overdue

      setData({
        pendingAnnual,
        dueSoon,
        overdue,
        followUpTotal,
        unreadAlerts: pendingAnnual + followUpTotal,
        businessDate: arriendos.businessDate,
        sources: [
          buildSourceCard(
            'arriendos',
            'Arriendos',
            'Actualización anual y vencimientos de puntos de venta.',
            '/actualizacion-anual',
            arriendos,
          ),
          buildSourceCard(
            'clientes',
            'Clientes',
            'Actualización anual corporativa y vencimientos.',
            '/actualizacion-anual/clientes',
            clientes,
          ),
        ],
      })
      setStatus('ready')
    }

    void load()

    return () => {
      active = false
    }
  }, [refreshKey])

  const refresh = () => {
    setStatus('loading')
    setError('')
    setRefreshKey((value) => value + 1)
  }

  const modules: ModuleLink[] = [
    {
      to: '/actualizacion-anual',
      title: 'Actualización Anual Arriendos',
      description:
        'Consulte las contrapartes activas e inactivas y su estado de actualización anual.',
      icon: CalendarCheck,
      iconClass: 'bg-amber-100 text-amber-800',
    },
    {
      to: '/actualizacion-anual/clientes',
      title: 'Actualización Anual Clientes',
      description:
        'Consulte las actualizaciones anuales de clientes corporativos y sus vencimientos desde FR-SG-80.',
      icon: CalendarCheck,
      iconClass: 'bg-blue-50 text-blue-700',
    },
    {
      to: '/contrapartes',
      title: 'Contrapartes en seguimiento',
      description:
        'Evalúe si la contraparte continúa con riesgo, programe el próximo seguimiento o archive la decisión.',
      icon: ClipboardCheck,
      iconClass: 'bg-emerald-50 text-emerald-800',
    },
    ...(isAdmin
      ? [
          {
            to: '/importar',
            title: 'Importar Excel',
            description:
              'Cargue archivos .xlsx o .xlsm, valide el mapeo y confirme la importación.',
            icon: FileSpreadsheet,
            iconClass: 'bg-violet-50 text-violet-700',
          },
          {
            to: '/usuarios',
            title: 'Usuarios',
            description:
              'Cree cuentas, asigne roles y controle el acceso al sistema.',
            icon: Users,
            iconClass: 'bg-slate-100 text-slate-700',
          },
        ]
      : []),
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 sm:p-8">
        <div className="absolute -right-16 -top-16 size-64 rounded-full bg-amber-100/70 blur-2xl" />
        <div className="absolute -bottom-24 left-1/3 size-64 rounded-full bg-emerald-100/40 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
              Panel de control
            </span>
            <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">
              Hola, {user?.name}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Sesión iniciada como{' '}
              {user ? roleLabels[user.role] : ''}.{' '}
              {data
                ? `Corte al ${formatDate(data.businessDate)}.`
                : 'Estas son las opciones disponibles para tu perfil.'}
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={status === 'loading'}
            className={`${secondaryButtonClass} self-start disabled:opacity-60`}
          >
            <RefreshCw
              className={`size-4 ${status === 'loading' ? 'animate-spin' : ''}`}
            />
            Actualizar métricas
          </button>
        </div>
      </section>

      {status === 'error' && (
        <section
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm shadow-red-900/5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">{error}</p>
                <p className="mt-1 text-red-700">
                  Los accesos rápidos siguen disponibles.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={refresh}
              className={secondaryButtonClass}
            >
              Reintentar
            </button>
          </div>
        </section>
      )}

      {status === 'loading' && (
        <section
          aria-label="Cargando métricas"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-xl border border-slate-200 bg-slate-100/70"
            />
          ))}
        </section>
      )}

      {status === 'ready' && data && (
        <>
          <section aria-label="Métricas del panel">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label="Alertas anuales"
                value={data.pendingAnnual}
                detail="Actualizaciones anuales sin leer"
                icon={CalendarCheck}
                iconClass="bg-amber-100 text-amber-800"
              />
              <StatCard
                label="Próximos a vencer"
                value={data.dueSoon}
                detail="Recordatorios de actualización anual"
                icon={CalendarClock}
                iconClass="bg-blue-50 text-blue-700"
              />
              <StatCard
                label="Vencimientos"
                value={data.overdue}
                detail="Actualizaciones anuales vencidas"
                icon={AlertTriangle}
                iconClass="bg-red-50 text-red-700"
              />
              <StatCard
                label="Seguimiento"
                value={data.followUpTotal}
                detail="Alertas de seguimiento semestral sin leer"
                icon={ClipboardCheck}
                iconClass="bg-emerald-50 text-emerald-800"
              />
              <StatCard
                label="Alertas sin leer"
                value={data.unreadAlerts}
                detail="Anuales y seguimiento"
                icon={Users}
                iconClass="bg-slate-100 text-slate-700"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
            <h2 className="text-base font-semibold text-slate-900">
              Fuentes de información
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Los conteos se leen desde los libros externos oficiales; no
              se escriben de vuelta en ellos.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {data.sources.map((source) => (
                <Link
                  key={source.key}
                  to={source.to}
                  className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 transition group-hover:scale-105">
                      <FileSpreadsheet className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {source.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {source.description}
                      </p>
                    </div>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-amber-600" />
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 text-center">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                        Activos
                      </dt>
                      <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                        {source.active}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                        Actualizados
                      </dt>
                      <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                        {source.updated}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                        Pendientes
                      </dt>
                      <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                        {source.pending}
                      </dd>
                    </div>
                  </dl>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
        <h2 className="text-base font-semibold text-slate-900">
          Accesos rápidos
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Seleccione un módulo para continuar. Las alertas de actualización
          anual y de seguimiento están separadas en dos botones del
          encabezado.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map(
            ({ to, title, description, icon: Icon, iconClass }) => (
              <Link
                key={to}
                to={to}
                className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105 ${iconClass}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5 text-sm font-semibold leading-snug text-slate-900">
                    {title}
                  </span>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-amber-600" />
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {description}
                </p>
              </Link>
            ),
          )}
        </div>
      </section>
    </div>
  )
}
