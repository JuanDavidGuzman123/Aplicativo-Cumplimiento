import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { createUser, updateUser } from '../services/users'
import type { User, UserRole } from '../types/user'
import { getApiErrorMessage } from '../utils/api-error'
import { roleLabels } from '../utils/labels'
import {
  fieldErrorClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../utils/styles'
import { Modal } from './Modal'

const userFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(120, 'El nombre es demasiado largo'),
  email: z
    .string()
    .trim()
    .min(1, 'El correo electrónico es obligatorio')
    .email('El correo electrónico no es válido'),
  password: z.string().optional(),
  role: z.enum(['ADMIN', 'ANALYST']),
})

type UserFormValues = z.infer<typeof userFormSchema>

type UserFormModalProps = {
  mode: 'create' | 'edit'
  user?: User
  onClose: () => void
  onSaved: (message: string) => void
}

export function UserFormModal({
  mode,
  user,
  onClose,
  onSaved,
}: UserFormModalProps) {
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      password: '',
      role: user?.role ?? 'ANALYST',
    },
  })

  const submit = handleSubmit(async (values) => {
    setError('')

    if (mode === 'create') {
      const password = values.password ?? ''

      if (password.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres')
        return
      }

      if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(password)) {
        setError('La contraseña debe incluir al menos una letra y un número')
        return
      }
    }

    try {
      if (mode === 'create') {
        await createUser({
          name: values.name,
          email: values.email,
          password: values.password ?? '',
          role: values.role,
        })
        onSaved('Usuario creado correctamente')
      } else if (user) {
        await updateUser(user.id, {
          name: values.name,
          role: values.role,
        })
        onSaved('Usuario actualizado correctamente')
      }

      onClose()
    } catch (submitError) {
      setError(
        getApiErrorMessage(submitError, 'No fue posible guardar el usuario'),
      )
    }
  })

  return (
    <Modal
      open
      title={mode === 'create' ? 'Nuevo usuario' : 'Editar usuario'}
      description={
        mode === 'create'
          ? 'Cree una cuenta con acceso al sistema.'
          : 'Actualice el nombre o el rol del usuario.'
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="user-name" className={labelClass}>
            Nombre
          </label>
          <input
            id="user-name"
            type="text"
            autoComplete="name"
            className={inputClass}
            {...register('name')}
          />
          {errors.name && (
            <p className={fieldErrorClass}>{errors.name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="user-email" className={labelClass}>
            Correo electrónico
          </label>
          <input
            id="user-email"
            type="email"
            autoComplete="email"
            readOnly={mode === 'edit'}
            className={`${inputClass} ${mode === 'edit' ? 'bg-slate-50 text-slate-700' : ''}`}
            {...register('email')}
          />
          {errors.email && (
            <p className={fieldErrorClass}>{errors.email.message}</p>
          )}
          {mode === 'edit' && (
            <p className="mt-1 text-xs text-slate-500">
              El correo electrónico no se puede modificar.
            </p>
          )}
        </div>

        {mode === 'create' && (
          <div>
            <label htmlFor="user-password" className={labelClass}>
              Contraseña
            </label>
            <div className="relative">
              <input
                id="user-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className={`${inputClass} pr-10`}
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 mt-1 flex items-center px-3 text-slate-400"
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
            <p className="mt-1 text-xs text-slate-500">
              Mínimo 8 caracteres, con al menos una letra y un número.
            </p>
            {errors.password && (
              <p className={fieldErrorClass}>{errors.password.message}</p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="user-role" className={labelClass}>
            Rol
          </label>
          <select id="user-role" className={inputClass} {...register('role')}>
            {(Object.keys(roleLabels) as UserRole[]).map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
          {errors.role && (
            <p className={fieldErrorClass}>{errors.role.message}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className={secondaryButtonClass}
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className={primaryButtonClass}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {mode === 'create' ? 'Crear usuario' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
