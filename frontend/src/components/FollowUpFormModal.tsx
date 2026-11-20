import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  createFollowUp,
  finalizeFollowUp,
  updateFollowUp,
} from '../services/follow-ups'
import type { FollowUp } from '../types/follow-up'
import { getApiErrorMessage } from '../utils/api-error'
import { todayDateInput } from '../utils/labels'
import {
  fieldErrorClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../utils/styles'
import { Modal } from './Modal'

type FollowUpFormMode = 'create' | 'edit' | 'finalize'

function buildSchema(requireResult: boolean) {
  return z
    .object({
      performedAt: z.string().optional(),
      result: z
        .string()
        .trim()
        .max(5000, 'El resultado es demasiado largo')
        .optional(),
      observations: z
        .string()
        .trim()
        .max(5000, 'Las observaciones son demasiado largas')
        .optional(),
    })
    .superRefine((values, context) => {
      if (requireResult && !values.result?.trim()) {
        context.addIssue({
          code: 'custom',
          path: ['result'],
          message:
            'Registre el resultado del seguimiento antes de finalizarlo',
        })
      }
    })
}

type FollowUpFormValues = z.infer<ReturnType<typeof buildSchema>>

type FollowUpFormModalProps = {
  mode: FollowUpFormMode
  counterpartyId: string
  followUp?: FollowUp
  onClose: () => void
  onSaved: (message: string) => void
}

const titles: Record<FollowUpFormMode, string> = {
  create: 'Nuevo seguimiento',
  edit: 'Editar seguimiento',
  finalize: 'Finalizar seguimiento',
}

const submitLabels: Record<FollowUpFormMode, string> = {
  create: 'Guardar borrador',
  edit: 'Guardar cambios',
  finalize: 'Finalizar seguimiento',
}

export function FollowUpFormModal({
  mode,
  counterpartyId,
  followUp,
  onClose,
  onSaved,
}: FollowUpFormModalProps) {
  const [error, setError] = useState('')
  const schema = useMemo(
    () => buildSchema(mode === 'finalize'),
    [mode],
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FollowUpFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      performedAt: followUp?.performedAt ?? todayDateInput(),
      result: followUp?.result ?? '',
      observations: followUp?.observations ?? '',
    },
  })

  const submit = handleSubmit(async (values) => {
    setError('')
    const result = values.result?.trim() || null
    const observations = values.observations?.trim() || null

    try {
      if (mode === 'create') {
        await createFollowUp(counterpartyId, {
          performedAt: values.performedAt || undefined,
          result,
          observations,
        })
        onSaved('Seguimiento guardado como borrador')
      } else if (mode === 'edit' && followUp) {
        await updateFollowUp(followUp.id, {
          performedAt: values.performedAt || undefined,
          result,
          observations,
        })
        onSaved('Seguimiento actualizado correctamente')
      } else if (mode === 'finalize' && followUp) {
        await finalizeFollowUp(followUp.id, {
          performedAt: values.performedAt || undefined,
          result: result ?? '',
          observations,
        })
        onSaved(
          'Seguimiento finalizado. El próximo se programó a seis meses.',
        )
      }

      onClose()
    } catch (submitError) {
      setError(
        getApiErrorMessage(
          submitError,
          'No fue posible guardar el seguimiento',
        ),
      )
    }
  })

  return (
    <Modal
      open
      size="lg"
      title={titles[mode]}
      description={
        mode === 'finalize'
          ? 'Al finalizar, el seguimiento queda bloqueado y se actualiza la fecha del próximo seguimiento a seis meses de la fecha de realización.'
          : mode === 'edit'
            ? 'Actualice el borrador del seguimiento.'
            : 'Registre la fecha, el resultado y las observaciones del seguimiento.'
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
          <label htmlFor="follow-up-date" className={labelClass}>
            Fecha de realización
          </label>
          <input
            id="follow-up-date"
            type="date"
            className={inputClass}
            max={todayDateInput()}
            {...register('performedAt')}
          />
          {errors.performedAt && (
            <p className={fieldErrorClass}>{errors.performedAt.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="follow-up-result" className={labelClass}>
            Resultado
            {mode === 'finalize' ? '' : ' (opcional en borrador)'}
          </label>
          <textarea
            id="follow-up-result"
            rows={5}
            className={inputClass}
            placeholder="Describa el resultado del seguimiento"
            {...register('result')}
          />
          {errors.result && (
            <p className={fieldErrorClass}>{errors.result.message}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="follow-up-observations"
            className={labelClass}
          >
            Observaciones (opcional)
          </label>
          <textarea
            id="follow-up-observations"
            rows={3}
            className={inputClass}
            placeholder="Observaciones adicionales"
            {...register('observations')}
          />
          {errors.observations && (
            <p className={fieldErrorClass}>
              {errors.observations.message}
            </p>
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
            {submitLabels[mode]}
          </button>
        </div>
      </form>
    </Modal>
  )
}
