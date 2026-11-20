import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  createSubprocess,
  updateSubprocess,
} from '../services/subprocesses'
import type { Subprocess } from '../types/subprocess'
import { getApiErrorMessage } from '../utils/api-error'
import {
  fieldErrorClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../utils/styles'
import { Modal } from './Modal'

const subprocessFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(150, 'El nombre es demasiado largo'),
  description: z
    .string()
    .trim()
    .max(500, 'La descripción es demasiado larga')
    .optional(),
})

type SubprocessFormValues = z.infer<typeof subprocessFormSchema>

type SubprocessFormModalProps = {
  mode: 'create' | 'edit'
  subprocess?: Subprocess
  onClose: () => void
  onSaved: (message: string) => void
}

export function SubprocessFormModal({
  mode,
  subprocess,
  onClose,
  onSaved,
}: SubprocessFormModalProps) {
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SubprocessFormValues>({
    resolver: zodResolver(subprocessFormSchema),
    defaultValues: {
      name: subprocess?.name ?? '',
      description: subprocess?.description ?? '',
    },
  })

  const submit = handleSubmit(async (values) => {
    setError('')
    const description = values.description?.trim()

    try {
      if (mode === 'create') {
        await createSubprocess({
          name: values.name,
          description: description || undefined,
        })
        onSaved('Subproceso creado correctamente')
      } else if (subprocess) {
        await updateSubprocess(subprocess.id, {
          name: values.name,
          description: description || null,
        })
        onSaved('Subproceso actualizado correctamente')
      }

      onClose()
    } catch (submitError) {
      setError(
        getApiErrorMessage(
          submitError,
          'No fue posible guardar el subproceso',
        ),
      )
    }
  })

  return (
    <Modal
      open
      title={mode === 'create' ? 'Nuevo subproceso' : 'Editar subproceso'}
      description={
        mode === 'create'
          ? 'Agregue un subproceso al catálogo del área.'
          : 'Actualice el nombre o la descripción del subproceso.'
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
          <label htmlFor="subprocess-name" className={labelClass}>
            Nombre
          </label>
          <input
            id="subprocess-name"
            type="text"
            className={inputClass}
            {...register('name')}
          />
          {errors.name && (
            <p className={fieldErrorClass}>{errors.name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="subprocess-description" className={labelClass}>
            Descripción (opcional)
          </label>
          <textarea
            id="subprocess-description"
            rows={3}
            className={inputClass}
            {...register('description')}
          />
          {errors.description && (
            <p className={fieldErrorClass}>
              {errors.description.message}
            </p>
          )}
        </div>

        <p className="text-xs text-slate-500">
          {mode === 'edit'
            ? 'Para cambiar el estado del subproceso, use la acción Activar o Desactivar en la lista.'
            : 'Los subprocesos inactivos no se podrán asignar a nuevas contrapartes.'}
        </p>

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
            {mode === 'create' ? 'Crear subproceso' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
