import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { Badge } from '../components/Badge'
import { Pagination } from '../components/Pagination'
import {
  confirmImport,
  getImport,
  getImports,
  previewImport,
  uploadImportFiles,
} from '../services/imports'
import type {
  ImportBatch,
  ImportDetail,
  ImportListResponse,
  ImportMapping,
  ImportResultSummary,
  ImportRowValidation,
  ImportValidation,
} from '../types/import'
import { getApiErrorMessage } from '../utils/api-error'
import {
  importFieldLabels,
  importFieldOrder,
  importRowStatusLabels,
  importRowStatusTones,
  importStatusLabels,
  importStatusTones,
} from '../utils/import'
import { formatDate, formatDateTime } from '../utils/labels'
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../utils/styles'

const MAX_FILES = 10
const MAX_FILE_SIZE_MB = 10
const MAX_TOTAL_SIZE_MB = 25
const PREVIEW_PAGE_SIZE = 25
const HISTORY_PAGE_SIZE = 10

function validateFiles(files: File[]): string {
  if (files.length === 0) {
    return 'Seleccione al menos un archivo de Excel'
  }

  if (files.length > MAX_FILES) {
    return `Solo se permiten hasta ${MAX_FILES} archivos por importación`
  }

  let totalSize = 0

  for (const file of files) {
    const extension = file.name
      .slice(file.name.lastIndexOf('.'))
      .toLowerCase()

    if (extension === '.xls') {
      return `"${file.name}" está en formato .xls. Guárdelo como .xlsx o .xlsm`
    }

    if (extension !== '.xlsx' && extension !== '.xlsm') {
      return `"${file.name}" no es un archivo .xlsx o .xlsm`
    }

    if (file.size === 0) {
      return `"${file.name}" está vacío`
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `"${file.name}" supera el límite de ${MAX_FILE_SIZE_MB} MB`
    }

    totalSize += file.size
  }

  if (totalSize > MAX_TOTAL_SIZE_MB * 1024 * 1024) {
    return `El tamaño total supera el límite de ${MAX_TOTAL_SIZE_MB} MB`
  }

  return ''
}

function rowHasDetails(row: ImportRowValidation) {
  return row.errors.length > 0 || row.warnings.length > 0
}

export function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [batch, setBatch] = useState<ImportDetail | null>(null)
  const [mapping, setMapping] = useState<ImportMapping>({})
  const [validation, setValidation] =
    useState<ImportValidation | null>(null)
  const [result, setResult] =
    useState<ImportResultSummary | null>(null)
  const [createMissingSubprocesses, setCreateMissingSubprocesses] =
    useState(false)
  const [authorizeDateChanges, setAuthorizeDateChanges] =
    useState(false)
  const [validationStale, setValidationStale] = useState(false)
  const [previewPage, setPreviewPage] = useState(1)
  const [isUploading, setIsUploading] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [openingBatchId, setOpeningBatchId] = useState<string | null>(
    null,
  )
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [history, setHistory] = useState<ImportListResponse | null>(
    null,
  )
  const [historyPage, setHistoryPage] = useState(1)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')

  const isConfirmed = batch?.status === 'CONFIRMED'
  const isFailed = batch?.status === 'FAILED'

  useEffect(() => {
    let active = true

    getImports(historyPage, HISTORY_PAGE_SIZE)
      .then((data) => {
        if (!active) {
          return
        }

        setHistory(data)
        setHistoryError('')
      })
      .catch((loadError) => {
        if (!active) {
          return
        }

        setHistoryError(
          getApiErrorMessage(
            loadError,
            'No fue posible cargar el historial de importaciones',
          ),
        )
      })
      .finally(() => {
        if (active) {
          setHistoryLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [historyPage, historyRefreshKey])

  useEffect(() => {
    if (!success) {
      return
    }

    const timeout = window.setTimeout(() => setSuccess(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [success])

  const previewRows = validation?.rows ?? []
  const previewTotalPages = Math.max(
    1,
    Math.ceil(previewRows.length / PREVIEW_PAGE_SIZE),
  )
  const visiblePreviewRows = previewRows.slice(
    (previewPage - 1) * PREVIEW_PAGE_SIZE,
    previewPage * PREVIEW_PAGE_SIZE,
  )

  const refreshHistory = () => {
    setHistoryLoading(true)
    setHistoryRefreshKey((key) => key + 1)
  }

  const resetBatchState = (nextBatch: ImportDetail) => {
    setBatch(nextBatch)
    setMapping(nextBatch.mapping ?? {})
    setValidation(nextBatch.validation)
    setValidationStale(false)
    setPreviewPage(1)
    setResult(
      nextBatch.status === 'CONFIRMED'
        ? nextBatch.resultSummary
        : null,
    )
    setCreateMissingSubprocesses(
      nextBatch.validation?.options.createMissingSubprocesses ??
        false,
    )
    setAuthorizeDateChanges(
      nextBatch.validation?.options.authorizeDateChanges ?? false,
    )
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    const validationError = validateFiles(files)

    if (validationError) {
      setError(validationError)
      setSelectedFiles([])
      event.target.value = ''
      return
    }

    setError('')
    setSuccess('')
    setSelectedFiles(files)
  }

  const handleUpload = async () => {
    const validationError = validateFiles(selectedFiles)

    if (validationError) {
      setError(validationError)
      return
    }

    setIsUploading(true)
    setError('')
    setSuccess('')

    try {
      const data = await uploadImportFiles(selectedFiles)
      resetBatchState(data)
      setSelectedFiles([])

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      refreshHistory()
      setSuccess(
        'Archivos cargados. Revise el mapeo y valide la vista previa.',
      )
    } catch (uploadError) {
      setError(
        getApiErrorMessage(
          uploadError,
          'No fue posible cargar los archivos',
        ),
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handleMappingChange = (field: keyof ImportMapping, value: string) => {
    setMapping((current) => ({
      ...current,
      [field]: value || null,
    }))
    setValidationStale(true)
  }

  const handlePreview = async () => {
    if (!batch) {
      return
    }

    setIsPreviewing(true)
    setError('')
    setSuccess('')

    try {
      const data = await previewImport(batch.id, {
        mapping,
        createMissingSubprocesses,
        authorizeDateChanges,
      })
      resetBatchState(data)
      setSuccess(
        'Vista previa actualizada. Revise los resultados antes de confirmar.',
      )
    } catch (previewError) {
      setError(
        getApiErrorMessage(
          previewError,
          'No fue posible generar la vista previa',
        ),
      )
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleConfirm = async () => {
    if (!batch || !validation || validationStale) {
      return
    }

    setIsConfirming(true)
    setError('')
    setSuccess('')

    try {
      const data = await confirmImport(batch.id, {
        mapping,
        createMissingSubprocesses,
        authorizeDateChanges,
      })
      setBatch(data)
      setValidation(data.validation)
      setResult(data.result)
      setValidationStale(false)
      setSuccess('Importación confirmada correctamente.')
      refreshHistory()
    } catch (confirmError) {
      setError(
        getApiErrorMessage(
          confirmError,
          'No fue posible confirmar la importación',
        ),
      )

      await getImport(batch.id)
        .then((refreshed) => {
          setBatch(refreshed)
          setValidation(refreshed.validation)
        })
        .catch(() => undefined)
    } finally {
      setIsConfirming(false)
    }
  }

  const handleOpenBatch = async (item: ImportBatch) => {
    setOpeningBatchId(item.id)
    setError('')
    setSuccess('')

    try {
      const data = await getImport(item.id)
      resetBatchState(data)
      setSelectedFiles([])

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (openError) {
      setError(
        getApiErrorMessage(
          openError,
          'No fue posible abrir la importación',
        ),
      )
    } finally {
      setOpeningBatchId(null)
    }
  }

  const handleOptionsChange = (
    field: 'createMissingSubprocesses' | 'authorizeDateChanges',
    value: boolean,
  ) => {
    if (field === 'createMissingSubprocesses') {
      setCreateMissingSubprocesses(value)
    } else {
      setAuthorizeDateChanges(value)
    }

    setValidationStale(true)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Importación de Excel
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Cargue uno o varios archivos, revise el mapeo de columnas y
          confirme la importación. Nada se guarda hasta la confirmación.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 p-6">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="size-5 text-amber-600" />
          <h2 className="text-base font-semibold text-slate-900">
            Cargar archivos
          </h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Formatos admitidos: .xlsx y .xlsm. Puede cargar hasta{' '}
          {MAX_FILES} archivos y {MAX_FILE_SIZE_MB} MB por archivo.
          Los .xls antiguos deben guardarse como .xlsx.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            id="import-files"
            type="file"
            accept=".xlsx,.xlsm"
            multiple
            onChange={handleFileChange}
            className="block w-full cursor-pointer rounded-md border border-slate-200 bg-white text-sm text-slate-600 file:mr-4 file:border-0 file:bg-emerald-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-950"
          />
          <button
            type="button"
            onClick={() => {
              void handleUpload()
            }}
            disabled={isUploading || selectedFiles.length === 0}
            className={primaryButtonClass}
          >
            {isUploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {isUploading ? 'Cargando...' : 'Cargar archivos'}
          </button>
        </div>

        {selectedFiles.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {selectedFiles.length} archivo
            {selectedFiles.length === 1 ? '' : 's'} seleccionado
            {selectedFiles.length === 1 ? '' : 's'}:{' '}
            {selectedFiles.map((file) => file.name).join(', ')}
          </p>
        )}
      </section>

      {batch && (
        <>
          {isFailed && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">
                  La confirmación anterior falló. No se guardaron
                  cambios.
                </p>
                <p className="mt-1 text-xs">
                  Revise la vista previa y vuelva a confirmar.
                </p>
              </div>
            </div>
          )}

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900">
                    {batch.fileName}
                  </h2>
                  <Badge tone={importStatusTones[batch.status]}>
                    {importStatusLabels[batch.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {batch.totalRows} fila
                  {batch.totalRows === 1 ? '' : 's'} leída
                  {batch.totalRows === 1 ? '' : 's'} ·{' '}
                  {batch.files.length} archivo
                  {batch.files.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-lg bg-amber-50 p-3 text-xs text-slate-600">
              {batch.files.map((file) => (
                <div key={file.fileName}>
                  <p className="font-medium text-slate-700">
                    {file.fileName}
                  </p>
                  <p>
                    {file.sheets
                      .map(
                        (sheet) =>
                          `${sheet.name} (${sheet.rowCount} filas)`,
                      )
                      .join(' · ')}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">
                Mapeo de columnas
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Asocie cada campo del sistema con una columna del
                Excel. Los campos NIT, razón social y subproceso son
                obligatorios.
              </p>

              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {importFieldOrder.map((field) => (
                  <div key={field}>
                    <label
                      htmlFor={`mapping-${field}`}
                      className={labelClass}
                    >
                      {importFieldLabels[field]}
                      {field === 'nit' ||
                      field === 'businessName' ||
                      field === 'subprocess' ? (
                        <span className="ml-1 text-red-600">*</span>
                      ) : null}
                    </label>
                    <select
                      id={`mapping-${field}`}
                      value={mapping[field] ?? ''}
                      onChange={(event) =>
                        handleMappingChange(field, event.target.value)
                      }
                      disabled={isConfirmed || isConfirming}
                      className={inputClass}
                    >
                      <option value="">— No importar —</option>
                      {batch.headers.map((header) => (
                        <option
                          key={header.value}
                          value={header.value}
                        >
                          {header.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3">
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={createMissingSubprocesses}
                    onChange={(event) =>
                      handleOptionsChange(
                        'createMissingSubprocesses',
                        event.target.checked,
                      )
                    }
                    disabled={isConfirmed || isConfirming}
                    className="mt-0.5 size-4 rounded border-slate-200"
                  />
                  <span>
                    Crear los subprocesos que no existan en el catálogo
                    al confirmar
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={authorizeDateChanges}
                    onChange={(event) =>
                      handleOptionsChange(
                        'authorizeDateChanges',
                        event.target.checked,
                      )
                    }
                    disabled={isConfirmed || isConfirming}
                    className="mt-0.5 size-4 rounded border-slate-200"
                  />
                  <span>
                    Autorizar la actualización de fechas en
                    contrapartes existentes cuando el Excel tenga
                    fechas diferentes
                  </span>
                </label>
              </div>

              {validationStale && (
                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Cambió el mapeo o las opciones. Vuelva a validar la
                  vista previa antes de confirmar.
                </p>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    void handlePreview()
                  }}
                  disabled={isPreviewing || isConfirming || isConfirmed}
                  className={secondaryButtonClass}
                >
                  {isPreviewing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {isPreviewing
                    ? 'Validando...'
                    : 'Validar vista previa'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleConfirm()
                  }}
                  disabled={
                    isConfirming ||
                    isConfirmed ||
                    !validation ||
                    validationStale ||
                    !validation.summary.canConfirm
                  }
                  className={primaryButtonClass}
                >
                  {isConfirming ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {isConfirming
                    ? 'Confirmando...'
                    : 'Confirmar importación'}
                </button>
              </div>
            </div>
          </section>

          {validation && (
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
              <div className="border-b border-slate-200 p-5">
                <h2 className="text-base font-semibold text-slate-900">
                  Vista previa
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    {
                      label: 'Total',
                      value: validation.summary.totalRows,
                    },
                    {
                      label: 'Válidas',
                      value: validation.summary.validRows,
                    },
                    {
                      label: 'Nuevas',
                      value: validation.summary.newRows,
                    },
                    {
                      label: 'Existentes',
                      value: validation.summary.existingRows,
                    },
                    {
                      label: 'Conflictos',
                      value: validation.summary.conflictRows,
                    },
                    {
                      label: 'Errores',
                      value: validation.summary.errorRows,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg bg-amber-50 p-3"
                    >
                      <p className="text-xs text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {validation.summary.subprocessesToCreate.length >
                  0 && (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Se crearán los subprocesos:{' '}
                    {validation.summary.subprocessesToCreate.join(
                      ', ',
                    )}
                  </p>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                    <tr>
                      <th className="px-4 py-3">Ubicación</th>
                      <th className="px-4 py-3">NIT</th>
                      <th className="px-4 py-3">Razón social</th>
                      <th className="px-4 py-3">Subproceso</th>
                      <th className="px-4 py-3">Fechas</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visiblePreviewRows.map((row) => (
                      <tr
                        key={row.key}
                        className={
                          row.status === 'ERROR'
                            ? 'bg-red-50/40'
                            : row.status === 'CONFLICT'
                              ? 'bg-amber-50/40'
                              : undefined
                        }
                      >
                        <td className="px-4 py-3 text-xs text-slate-500">
                          <p className="font-medium text-slate-700">
                            {row.file}
                          </p>
                          <p>
                            {row.sheet} · fila {row.rowNumber}
                          </p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.values.nit ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          {row.values.businessName ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          {row.values.subprocess ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p>
                            Registro:{' '}
                            {formatDate(
                              row.values.registrationDate,
                            )}
                          </p>
                          <p>
                            Último:{' '}
                            {formatDate(
                              row.values.lastFollowUpDate,
                            )}
                          </p>
                          <p>
                            Próximo:{' '}
                            {formatDate(
                              row.values.nextFollowUpDate,
                            )}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              importRowStatusTones[row.status]
                            }
                          >
                            {importRowStatusLabels[row.status]}
                          </Badge>
                        </td>
                        <td className="max-w-sm px-4 py-3 text-xs">
                          {!rowHasDetails(row) ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <div className="space-y-1">
                              {row.errors.map((message) => (
                                <p
                                  key={message}
                                  className="text-red-700"
                                >
                                  {message}
                                </p>
                              ))}
                              {row.warnings.map((message) => (
                                <p
                                  key={message}
                                  className="text-amber-700"
                                >
                                  {message}
                                </p>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={previewPage}
                totalPages={previewTotalPages}
                total={previewRows.length}
                onPageChange={setPreviewPage}
              />
            </section>
          )}

          {result && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2 className="size-5" />
                <h2 className="text-base font-semibold">
                  Importación confirmada
                </h2>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ['Creadas', result.created],
                  ['Existentes', result.existing],
                  ['Fechas actualizadas', result.updatedDates],
                  ['Conflictos', result.conflicts],
                  ['Errores', result.errors],
                  ['Subprocesos creados', result.createdSubprocesses],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg bg-white/70 p-3"
                  >
                    <p className="text-xs text-slate-600">
                      {label}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-800">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Historial de importaciones
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Consulte los lotes cargados y abra uno para revisarlo.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshHistory}
            disabled={historyLoading}
            className={secondaryButtonClass}
          >
            <RefreshCw
              className={`size-4 ${
                historyLoading ? 'animate-spin' : ''
              }`}
            />
            Actualizar
          </button>
        </div>

        {historyError && (
          <div className="m-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {historyError}
          </div>
        )}

        {historyLoading && !history ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Cargando historial...
          </div>
        ) : !history || history.data.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Todavía no hay importaciones registradas.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-4 py-3">Archivo</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Filas</th>
                    <th className="px-4 py-3">Válidas</th>
                    <th className="px-4 py-3">Creadas</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.data.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {item.fileName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.uploadedBy.name}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={importStatusTones[item.status]}>
                          {importStatusLabels[item.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{item.totalRows}</td>
                      <td className="px-4 py-3">{item.validRows}</td>
                      <td className="px-4 py-3">{item.importedRows}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            void handleOpenBatch(item)
                          }}
                          disabled={openingBatchId === item.id}
                          className={secondaryButtonClass}
                        >
                          {openingBatchId === item.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={historyPage}
              totalPages={history.meta.totalPages}
              total={history.meta.total}
              onPageChange={setHistoryPage}
            />
          </>
        )}
      </section>
    </div>
  )
}
