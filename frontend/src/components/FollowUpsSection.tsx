import {
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import {
  downloadFollowUpDocument,
  getFollowUps,
  uploadFollowUpDocument,
} from '../services/follow-ups'
import type { CounterpartyDetail } from '../types/counterparty'
import type { FollowUp } from '../types/follow-up'
import { getApiErrorMessage } from '../utils/api-error'
import {
  followUpStatusLabels,
  followUpStatusTones,
} from '../utils/follow-up'
import { formatDate, formatDateTime } from '../utils/labels'
import {
  secondaryButtonClass,
} from '../utils/styles'
import { Badge } from './Badge'
import { FollowUpFormModal } from './FollowUpFormModal'

const MAX_FILE_SIZE_MB = 10

type FollowUpFormState = {
  mode: 'create' | 'edit' | 'finalize'
  followUp?: FollowUp
}

type FollowUpsSectionProps = {
  counterparty: CounterpartyDetail
  onChanged: (message: string) => void
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FollowUpsSection({
  counterparty,
  onChanged,
}: FollowUpsSectionProps) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [formState, setFormState] = useState<FollowUpFormState | null>(
    null,
  )
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(
    null,
  )

  useEffect(() => {
    let active = true

    getFollowUps(counterparty.id)
      .then((data) => {
        if (active) {
          setFollowUps(data)
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(
            getApiErrorMessage(
              loadError,
              'No fue posible cargar los seguimientos',
            ),
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [counterparty.id, refreshKey])

  const refresh = (message: string) => {
    setError('')
    setRefreshKey((value) => value + 1)
    onChanged(message)
  }

  const handleUpload = async (followUpId: string, file: File) => {
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(
        `El archivo supera el límite de ${MAX_FILE_SIZE_MB} MB`,
      )
      return
    }

    setUploadingId(followUpId)
    setError('')

    try {
      await uploadFollowUpDocument(followUpId, file)
      refresh('Documento adjuntado correctamente')
    } catch (uploadError) {
      setError(
        getApiErrorMessage(
          uploadError,
          'No fue posible adjuntar el documento',
        ),
      )
    } finally {
      setUploadingId(null)
    }
  }

  const handleDownload = async (documentId: string, name: string) => {
    setDownloadingId(documentId)
    setError('')

    try {
      const blob = await downloadFollowUpDocument(documentId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (downloadError) {
      setError(
        getApiErrorMessage(
          downloadError,
          'No fue posible descargar el documento',
        ),
      )
    } finally {
      setDownloadingId(null)
    }
  }

  const canCreate = counterparty.status === 'ACTIVE'

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">
            Historial de seguimientos
          </h2>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setFormState({ mode: 'create' })}
            className={secondaryButtonClass}
          >
            <Plus className="size-4" />
            Nuevo seguimiento
          </button>
        )}
      </div>

      {!canCreate && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          La contraparte está archivada. Reactive la contraparte para
          registrar nuevos seguimientos.
        </p>
      )}

      {error && (
        <div className="mt-4 flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          {!isLoading && (
            <button
              type="button"
              onClick={() => {
                setError('')
                setRefreshKey((value) => value + 1)
              }}
              className="self-start rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 sm:self-auto"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-500">
          <Loader2 className="size-5 animate-spin" />
          Cargando seguimientos...
        </div>
      ) : followUps.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">
            No hay seguimientos registrados
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {canCreate
              ? 'Registre el primer seguimiento de esta contraparte.'
              : 'El historial se conserva, pero no se pueden agregar seguimientos mientras la contraparte esté archivada.'}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {followUps.map((followUp) => {
            const canEditDraft =
              followUp.status === 'DRAFT' &&
              counterparty.status === 'ACTIVE' &&
              (isAdmin || followUp.responsibleUser.id === user?.id)

            return (
              <article
                key={followUp.id}
                className="rounded-lg border border-slate-200 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Seguimiento del {formatDate(followUp.performedAt)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Responsable: {followUp.responsibleUser.name}
                      {followUp.finalizedAt
                        ? ` · Finalizado ${formatDateTime(followUp.finalizedAt)}`
                        : ''}
                    </p>
                  </div>
                  <Badge tone={followUpStatusTones[followUp.status]}>
                    {followUpStatusLabels[followUp.status]}
                  </Badge>
                </div>

                <dl className="mt-4 space-y-3">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Resultado
                    </dt>
                    <dd className="mt-1 whitespace-pre-line text-sm text-slate-700">
                      {followUp.result || 'Sin resultado registrado.'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Observaciones
                    </dt>
                    <dd className="mt-1 whitespace-pre-line text-sm text-slate-700">
                      {followUp.observations ||
                        'Sin observaciones registradas.'}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 border-t border-slate-100 pt-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Documentos de soporte
                    </p>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900">
                      {uploadingId === followUp.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Paperclip className="size-3.5" />
                      )}
                      Adjuntar documento
                      <input
                        type="file"
                        className="sr-only"
                        accept=".pdf,.docx,.xlsx,.jpg,.jpeg"
                        disabled={uploadingId === followUp.id}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          event.target.value = ''

                          if (file) {
                            void handleUpload(followUp.id, file)
                          }
                        }}
                      />
                    </label>
                  </div>

                  {followUp.documents.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      Sin documentos adjuntos.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {followUp.documents.map((document) => (
                        <li
                          key={document.id}
                          className="flex flex-col gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="flex min-w-0 items-center gap-2 text-slate-700">
                            <FileText className="size-4 shrink-0 text-slate-500" />
                            <span className="truncate">
                              {document.originalName}
                            </span>
                            <span className="shrink-0 text-xs text-slate-500">
                              {formatFileSize(document.size)}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void handleDownload(
                                document.id,
                                document.originalName,
                              )
                            }
                            disabled={
                              downloadingId === document.id
                            }
                            className="inline-flex items-center gap-1 self-start rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
                          >
                            {downloadingId === document.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Download className="size-3.5" />
                            )}
                            Descargar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="mt-2 text-xs text-slate-500">
                    Formatos permitidos: PDF, DOCX, XLSX y JPG. Tamaño
                    máximo: {MAX_FILE_SIZE_MB} MB.
                  </p>
                </div>

                {canEditDraft && (
                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        setFormState({
                          mode: 'edit',
                          followUp,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <Pencil className="size-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormState({
                          mode: 'finalize',
                          followUp,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
                    >
                      <CheckCircle2 className="size-3.5" />
                      Finalizar
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {formState && (
        <FollowUpFormModal
          mode={formState.mode}
          counterpartyId={counterparty.id}
          followUp={formState.followUp}
          onClose={() => setFormState(null)}
          onSaved={refresh}
        />
      )}
    </section>
  )
}
