import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation } from 'react-router-dom'
import { z } from 'zod'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { useAuth } from '../hooks/useAuth'
import { getApiErrorMessage } from '../utils/api-error'
import {
  fieldErrorClass,
  inputClass,
  labelClass,
  primaryButtonClass,
} from '../utils/styles'

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'El correo electrónico es obligatorio')
    .email('El correo electrónico no es válido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { user, isLoading, login } = useAuth()
  const location = useLocation()
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const state = location.state as { from?: { pathname?: string } } | null
  const from = state?.from?.pathname ?? '/'

  if (isLoading) {
    return <FullScreenLoader />
  }

  if (user) {
    return <Navigate to={from} replace />
  }

  const submit = handleSubmit(async (values) => {
    setError('')

    try {
      await login(values.email, values.password)
    } catch (submitError) {
      setError(
        getApiErrorMessage(submitError, 'No fue posible iniciar sesión'),
      )
    }
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <ShieldCheck className="size-6" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Seguimiento de Contrapartes
            </h1>
            <p className="text-xs text-slate-500">Área de Cumplimiento</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900">
            Iniciar sesión
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Ingrese con las credenciales asignadas por el administrador.
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="login-email" className={labelClass}>
                Correo electrónico
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                className={inputClass}
                {...register('email')}
              />
              {errors.email && (
                <p className={fieldErrorClass}>{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="login-password" className={labelClass}>
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`${inputClass} pr-10`}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 mt-1 flex items-center px-3 text-slate-500"
                  aria-label={
                    showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                  }
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className={fieldErrorClass}>{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              className={`${primaryButtonClass} w-full`}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Ingresar
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Sistema interno. El acceso está restringido a usuarios autorizados.
          </p>
        </div>
      </div>
    </div>
  )
}
