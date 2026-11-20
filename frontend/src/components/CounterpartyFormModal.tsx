import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  createCounterparty,
  updateCounterparty,
} from '../services/counterparties'
import type {
  CounterpartyDetail,
} from '../types/counterparty'
import type { SubprocessOption } from '../types/subprocess'
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

const nitPattern = /^(?=(?:\D*\d){6,15}\D*$)[\d.\-\s]+$/

const counterpartyFormSchema = z.object({
  nit: z
    .string()
    .trim()
    .min(1, 'El NIT es obligatorio')
    .max(30, 'El NIT es demasiado largo')
    .regex(
      nitPattern,
      'El NIT debe contener entre 6 y 15 dígitos y solo puede incluir números, puntos, guiones y espacios',
    ),
  businessName: z
    .string()
    .trim()
    .min(2, 'La razón social debe tener al menos 2 caracteres')
    .max(200, 'La razón social es demasiado larga'),
  subprocessId: z.string().min(1, 'Seleccione un subproceso'),
  registrationDate: z.string().optional(),
  nextFollowUpDate: z.string().optional(),
  observations: z
    .string()
    .trim()
    .max(2000, 'Las observaciones son demasiado largas')
    .optional(),
})

type CounterpartyFormValues = z.infer<typeof counterpartyFormSchema>

type CounterpartyFormModalProps = {
  mode: 'create' | 'edit'
  counterparty?: CounterpartyDetail
  subprocesses: SubprocessOption[]
  onClose: () => void
  onSaved: (message: string) => void
}

export function CounterpartyFormModal({
  mode,
  counterparty,
  subprocesses,
  onClose,
  onSaved,
}: CounterpartyFormModalProps) {
  const [error, setError] = useState('')

  const options = useMemo(() => {
    const available = subprocesses.filter(
      (subprocess) =>
        subprocess.active || subprocess.id === counterparty?.subprocess.id,
    )

    if (
      counterparty &&
      !available.some(
        (subprocess) => subprocess.id === counterparty.subprocess.id,
      )
    ) {
      available.push(counterparty.subprocess)
    }

    return available
  }, [subprocesses, counterparty])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CounterpartyFormValues>({
    resolver: zodResolver(counterpartyFormSchema),
    defaultValues: {
      nit: counterparty?.nit ?? '',
      businessName: counterparty?.businessName ?? '',
      subprocessId: counterparty?.subprocess.id ?? '',
      registrationDate:
        mode === 'create' ? todayDateInput() : undefined,
      nextFollowUpDate: '',
      observations: counterparty?.observations ?? '',
    },
  })

  const submit = handleSubmit(async (values) => {
    setError('')
    const observations = values.observations?.trim()

    try {
      if (mode === 'create') {
        await createCounterparty({
          nit: values.nit,
          businessName: values.businessName,
          subprocessId: values.subprocessId,
          observations: observations || undefined,
          registrationDate: values.registrationDate || undefined,
          nextFollowUpDate: values.nextFollowUpDate || undefined,
        })
        onSaved('Contraparte creada correctamente')
      } else if (counterparty) {
        await updateCounterparty(counterparty.id, {
          nit: values.nit,
          businessName: values.businessName,
          subprocessId: values.subprocessId,
          observations: observations || null,
        })
        onSaved('Contraparte actualizada correctamente')
      }

      onClose()
    } catch (submitError) {
      setError(
        getApiErrorMessage(
          submitError,
          'No fue posible guardar la contraparte',
        ),
      )
    }
  })

  return (
    <Modal
      open
      size="lg"
      title={mode === 'create' ? 'Nueva contraparte' : 'Editar contraparte'}
      description={
        mode === 'create'
          ? 'Registre la contraparte y su programación inicial.'
          : 'Actualice los datos generales de la contraparte.'
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="counterparty-nit" className={labelClass}>
              NIT
            </label>
            <input
              id="counterparty-nit"
              type="text"
              inputMode="numeric"
              className={inputClass}
              {...register('nit')}
            />
            {errors.nit && (
              <p className={fieldErrorClass}>{errors.nit.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="counterparty-subprocess"
              className={labelClass}
            >
              Subproceso
            </label>
            <select
              id="counterparty-subprocess"
              className={inputClass}
              disabled={options.length === 0}
              {...register('subprocessId')}
            >
              <option value="">Seleccione un subproceso</option>
              {options.map((subprocess) => (
                <option key={subprocess.id} value={subprocess.id}>
                  {subprocess.name}
                  {subprocess.active ? '' : ' (inactivo)'}
                </option>
              ))}
            </select>
            {errors.subprocessId && (
              <p className={fieldErrorClass}>
                {errors.subprocessId.message}
              </p>
            )}
            {options.length === 0 && (
              <p className="mt-1 text-xs text-red-600">
                No hay subprocesos activos. Cree uno antes de registrar
                contrapartes.
              </p>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="counterparty-business-name"
            className={labelClass}
          >
            Razón social
          </label>
          <input
            id="counterparty-business-name"
            type="text"
            className={inputClass}
            {...register('businessName')}
          />
          {errors.businessName && (
            <p className={fieldErrorClass}>
              {errors.businessName.message}
            </p>
          )}
        </div>

        {mode === 'create' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="counterparty-registration-date"
                className={labelClass}
              >
                Fecha de registro
              </label>
              <input
                id="counterparty-registration-date"
                type="date"
                className={inputClass}
                {...register('registrationDate')}
              />
              {errors.registrationDate && (
                <p className={fieldErrorClass}>
                  {errors.registrationDate.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="counterparty-next-date"
                className={labelClass}
              >
                Próximo seguimiento (opcional)
              </label>
              <input
                id="counterparty-next-date"
                type="date"
                className={inputClass}
                {...register('nextFollowUpDate')}
              />
              {errors.nextFollowUpDate && (
                <p className={fieldErrorClass}>
                  {errors.nextFollowUpDate.message}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Si se deja vacía, se programará a los 6 meses de la fecha
                de registro.
              </p>
            </div>
          </div>
        )}

        <div>
          <label
            htmlFor="counterparty-observations"
            className={labelClass}
          >
            Observaciones (opcional)
          </label>
          <textarea
            id="counterparty-observations"
            rows={4}
            className={inputClass}
            {...register('observations')}
          />
          {errors.observations && (
            <p className={fieldErrorClass}>
              {errors.observations.message}
            </p>
          )}
        </div>

        {mode === 'edit' && (
          <p className="text-xs text-slate-500">
            Las fechas de seguimiento se actualizan al finalizar un
            seguimiento o al reactivar la contraparte.
          </p>
        )}

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
            disabled={isSubmitting || options.length === 0}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {mode === 'create' ? 'Crear contraparte' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
