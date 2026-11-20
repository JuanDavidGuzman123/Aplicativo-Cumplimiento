import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  archiveCounterparty,
  reactivateCounterparty,
} from '../services/counterparties'
import type { CounterpartyDetail } from '../types/counterparty'
import { getApiErrorMessage } from '../utils/api-error'
import { formatDate } from '../utils/labels'
import {
  dangerButtonClass,
  fieldErrorClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../utils/styles'
import { Modal } from './Modal'

const actionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'La justificación debe tener al menos 5 caracteres')
    .max(1000, 'La justificación es demasiado larga'),
  nextFollowUpDate: z.string().optional(),
})

type ActionValues = z.infer<typeof actionSchema>

type CounterpartyStatusTarget = Pick<
  CounterpartyDetail,
  'id' | 'nit' | 'businessName' | 'nextFollowUpDate'
>

type CounterpartyStatusModalProps = {
  mode: 'archive' | 'reactivate'
  counterparty: CounterpartyStatusTarget
  onClose: () => void
  onSaved: (message: string) => void
}

export function CounterpartyStatusModal({
  mode,
  counterparty,
  onClose,
  onSaved,
}: CounterpartyStatusModalProps) {
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ActionValues>({
    resolver: zodResolver(actionSchema),
    defaultValues: {
      reason: '',
      nextFollowUpDate: '',
    },
  })

  const submit = handleSubmit(async (values) => {
    setError('')

    try {
      if (mode === 'archive') {
        await archiveCounterparty(counterparty.id, values.reason)
        onSaved('Contraparte archivada correctamente')
      } else {
        await reactivateCounterparty(
          counterparty.id,
          values.reason,
          values.nextFollowUpDate || undefined,
        )
        onSaved('Contraparte reactivada correctamente')
      }

      onClose()
    } catch (submitError) {
      setError(
        getApiErrorMessage(
          submitError,
          'No fue posible actualizar la contraparte',
        ),
      )
    }
  })

  return (
    <Modal
      open
      title={
        mode === 'archive'
          ? 'Archivar contraparte'
          : 'Reactivar contraparte'
      }
      description={`${counterparty.businessName} · NIT ${counterparty.nit}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            mode === 'archive'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-blue-200 bg-blue-50 text-blue-800'
          }`}
        >
          {mode === 'archive'
            ? 'La contraparte dejará de generar recordatorios y no aparecerá en los listados activos. Sus datos e historial se conservarán.'
            : 'La contraparte volverá a estar activa y conservará todo su historial. Se recomienda revisar la fecha de próximo seguimiento.'}
        </div>

        {mode === 'reactivate' && (
          <div>
            <label
              htmlFor="reactivation-next-date"
              className={labelClass}
            >
              Nueva fecha de próximo seguimiento (opcional)
            </label>
            <input
              id="reactivation-next-date"
              type="date"
              className={inputClass}
              {...register('nextFollowUpDate')}
            />
            <p className="mt-1 text-xs text-slate-500">
              Fecha actual:{' '}
              {formatDate(counterparty.nextFollowUpDate)}. Si no indica
              una nueva fecha, se conservará la actual.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="action-reason" className={labelClass}>
            Justificación
          </label>
          <textarea
            id="action-reason"
            rows={4}
            className={inputClass}
            placeholder="Describa el motivo de la acción"
            {...register('reason')}
          />
          {errors.reason && (
            <p className={fieldErrorClass}>{errors.reason.message}</p>
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
            className={
              mode === 'archive'
                ? dangerButtonClass
                : primaryButtonClass
            }
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {mode === 'archive'
              ? 'Archivar contraparte'
              : 'Reactivar contraparte'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
