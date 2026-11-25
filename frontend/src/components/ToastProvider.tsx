import {
  CheckCircle2,
  Info,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ToastContext,
  type ToastContextValue,
  type ToastTone,
} from './toast-context'

type Toast = {
  id: number
  message: string
  tone: ToastTone
}

const toneConfig: Record<
  ToastTone,
  {
    icon: LucideIcon
    container: string
    iconClass: string
  }
> = {
  success: {
    icon: CheckCircle2,
    container: 'border-emerald-200 bg-white text-slate-800',
    iconClass: 'text-emerald-600',
  },
  error: {
    icon: XCircle,
    container: 'border-red-200 bg-white text-slate-800',
    iconClass: 'text-red-600',
  },
  info: {
    icon: Info,
    container: 'border-amber-200 bg-white text-slate-800',
    iconClass: 'text-amber-600',
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current
      nextId.current += 1

      setToasts((current) => [...current.slice(-3), { id, message, tone }])

      const timer = window.setTimeout(() => {
        setToasts((current) =>
          current.filter((toast) => toast.id !== id),
        )
        timers.current.delete(id)
      }, 4500)

      timers.current.set(id, timer)
    },
    [],
  )

  useEffect(() => {
    const activeTimers = timers.current

    return () => {
      activeTimers.forEach((timer) => window.clearTimeout(timer))
      activeTimers.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({ showToast }),
    [showToast],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-stretch gap-2 sm:left-auto sm:w-96"
      >
        {toasts.map((toast) => {
          const config = toneConfig[toast.tone]
          const Icon = config.icon

          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className={`toast-enter pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-xl shadow-slate-950/15 ${config.container}`}
            >
              <Icon
                className={`mt-0.5 size-5 shrink-0 ${config.iconClass}`}
              />
              <p className="min-w-0 flex-1 text-sm font-medium leading-relaxed">
                {toast.message}
              </p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Cerrar notificación"
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
