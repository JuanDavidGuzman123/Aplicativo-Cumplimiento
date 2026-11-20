import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  CounterpartyStatus,
  ImportStatus,
  Prisma,
} from '@prisma/client'
import { AuditService } from '../audit/audit.service.js'
import {
  addMonths,
  getBusinessToday,
  parseDateOnly,
  toDateOnly,
} from '../common/utils/dates.js'
import {
  NIT_PATTERN,
  normalizeNit,
} from '../common/utils/nit.js'
import { NotificationsService } from '../notifications/notifications.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import {
  ExcelParseError,
  getFieldValue,
  IMPORT_FIELDS,
  mergeParsedWorkbooks,
  normalizeHeader,
  normalizeLookupText,
  parseImportedDate,
  parseWorkbook,
  type ImportField,
  type ImportHeader,
  type ImportMapping,
  type ParsedFile,
  type ParsedSheet,
} from './excel-parser.js'
import {
  ImportOptionsDto,
  ListImportsQueryDto,
} from './dto/import-options.dto.js'

export type UploadedImportFile = {
  originalname: string
  buffer: Buffer
  size: number
  mimetype: string
}

type DateField =
  | 'registrationDate'
  | 'lastFollowUpDate'
  | 'nextFollowUpDate'

type RowValues = Record<ImportField, string | null>

type DateDifferences = Partial<
  Record<DateField, { current: string | null; imported: string }>
>

type ImportRowValidation = {
  key: string
  file: string
  sheet: string
  rowNumber: number
  values: RowValues
  nitNormalized: string
  status: 'NEW' | 'EXISTING' | 'CONFLICT' | 'ERROR'
  errors: string[]
  warnings: string[]
  existingCounterpartyId: string | null
  dateDifferences: DateDifferences
  needsSubprocessCreation: boolean
}

type ImportSummary = {
  totalRows: number
  validRows: number
  newRows: number
  existingRows: number
  conflictRows: number
  errorRows: number
  subprocessesToCreate: string[]
  canConfirm: boolean
}

type StoredValidation = {
  mapping: ImportMapping
  options: {
    createMissingSubprocesses: boolean
    authorizeDateChanges: boolean
  }
  rows: ImportRowValidation[]
  summary: ImportSummary
}

type StoredPreviewData = {
  files: ParsedFile[]
  headers: ImportHeader[]
  suggestedMapping: ImportMapping
  validation?: StoredValidation
}

type FlatRow = {
  key: string
  file: string
  sheet: string
  sheetData: ParsedSheet
  rowNumber: number
  values: string[]
}

const DATE_FIELD_LABELS: Record<DateField, string> = {
  registrationDate: 'fecha de registro',
  lastFollowUpDate: 'fecha del último seguimiento',
  nextFollowUpDate: 'fecha del próximo seguimiento',
}

const MAX_FILES = 10
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_TOTAL_FILE_SIZE = 25 * 1024 * 1024

const batchSelect = {
  id: true,
  fileName: true,
  status: true,
  totalRows: true,
  validRows: true,
  errorRows: true,
  importedRows: true,
  confirmedAt: true,
  createdAt: true,
  updatedAt: true,
  uploadedBy: {
    select: { id: true, name: true, email: true },
  },
  resultSummary: true,
  errorDetails: true,
} satisfies Prisma.ImportBatchSelect

const batchDetailSelect = {
  ...batchSelect,
  columnMapping: true,
  previewData: true,
} satisfies Prisma.ImportBatchSelect

type BatchRow = Prisma.ImportBatchGetPayload<{
  select: typeof batchSelect
}>
type BatchDetailRow = Prisma.ImportBatchGetPayload<{
  select: typeof batchDetailSelect
}>

const existingCounterpartySelect = {
  id: true,
  nit: true,
  nitNormalized: true,
  businessName: true,
  status: true,
  subprocessId: true,
  subprocess: {
    select: { id: true, name: true },
  },
  registrationDate: true,
  lastFollowUpDate: true,
  nextFollowUpDate: true,
} satisfies Prisma.CounterpartySelect

function serializeBatch(row: BatchRow) {
  return {
    id: row.id,
    fileName: row.fileName,
    status: row.status,
    totalRows: row.totalRows,
    validRows: row.validRows,
    errorRows: row.errorRows,
    importedRows: row.importedRows,
    confirmedAt: row.confirmedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    uploadedBy: row.uploadedBy,
    resultSummary: row.resultSummary,
    errorDetails: row.errorDetails,
  }
}

function readStoredData(row: BatchDetailRow): StoredPreviewData {
  const data = row.previewData as unknown as StoredPreviewData | null

  if (!data || !Array.isArray(data.files) || data.files.length === 0) {
    throw new BadRequestException(
      'La carga no contiene datos de Excel. Vuelva a subir el archivo.',
    )
  }

  return data
}

function serializeDetail(row: BatchDetailRow) {
  const data = readStoredData(row)

  return {
    ...serializeBatch(row),
    mapping: row.columnMapping ?? data.suggestedMapping,
    headers: data.headers,
    files: data.files.map((file) => ({
      fileName: file.fileName,
      sheets: file.sheets.map((sheet) => ({
        name: sheet.name,
        rowCount: sheet.rows.length,
        headers: sheet.headers,
      })),
    })),
    validation: data.validation ?? null,
  }
}

function sanitizeMapping(input: unknown): ImportMapping | null {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    return null
  }

  const source = input as Record<string, unknown>
  const mapping = {} as ImportMapping

  for (const field of IMPORT_FIELDS) {
    const value = source[field]

    if (typeof value === 'string' && value.trim()) {
      mapping[field] = normalizeHeader(value)
    } else {
      mapping[field] = null
    }
  }

  return mapping
}

function flattenRows(files: ParsedFile[]): FlatRow[] {
  return files.flatMap((file, fileIndex) =>
    file.sheets.flatMap((sheet, sheetIndex) =>
      sheet.rows.map((row) => ({
        key: `${fileIndex}:${sheetIndex}:${row.rowNumber}`,
        file: file.fileName,
        sheet: sheet.name,
        sheetData: sheet,
        rowNumber: row.rowNumber,
        values: row.values,
      })),
    ),
  )
}

function parseDateWithError(
  raw: string | null,
  field: DateField,
  errors: string[],
): string | null {
  if (!raw) {
    return null
  }

  const parsed = parseImportedDate(raw)

  if (!parsed) {
    errors.push(
      `La ${DATE_FIELD_LABELS[field]} "${raw}" no es válida`,
    )
    return null
  }

  return parsed
}

function valueFrom(
  flatRow: FlatRow,
  mapping: ImportMapping,
  field: ImportField,
): string | null {
  return getFieldValue(
    flatRow.sheetData,
    { rowNumber: flatRow.rowNumber, values: flatRow.values },
    mapping,
    field,
  )
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(query: ListImportsQueryDto) {
    const page = query.page
    const pageSize = query.pageSize

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.importBatch.findMany({
        select: batchSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.importBatch.count(),
    ])

    return {
      data: rows.map(serializeBatch),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  }

  async findOne(id: string) {
    return serializeDetail(await this.getBatchOrThrow(id))
  }

  async upload(
    files: UploadedImportFile[],
    actorId: string,
  ) {
    if (files.length === 0) {
      throw new BadRequestException(
        'Seleccione al menos un archivo de Excel',
      )
    }

    if (files.length > MAX_FILES) {
      throw new BadRequestException(
        `Solo se permiten hasta ${MAX_FILES} archivos por importación`,
      )
    }

    let totalSize = 0

    for (const file of files) {
      const extension = file.originalname
        .slice(file.originalname.lastIndexOf('.'))
        .toLowerCase()

      if (extension === '.xls') {
        throw new BadRequestException(
          `"${file.originalname}" está en formato .xls. Guarde el archivo como .xlsx o .xlsm antes de importarlo`,
        )
      }

      if (extension !== '.xlsx' && extension !== '.xlsm') {
        throw new BadRequestException(
          `"${file.originalname}" no es un archivo Excel válido. Use .xlsx o .xlsm`,
        )
      }

      if (!file.buffer || file.size === 0) {
        throw new BadRequestException(
          `"${file.originalname}" está vacío`,
        )
      }

      if (file.size > MAX_FILE_SIZE) {
        throw new BadRequestException(
          `"${file.originalname}" supera el tamaño máximo de 10 MB`,
        )
      }

      totalSize += file.size
    }

    if (totalSize > MAX_TOTAL_FILE_SIZE) {
      throw new BadRequestException(
        'El tamaño total de los archivos supera el límite de 25 MB',
      )
    }

    const parsedWorkbooks = await Promise.all(
      files.map(async (file) => {
        try {
          return await parseWorkbook(file.buffer, file.originalname)
        } catch (error) {
          if (error instanceof ExcelParseError) {
            throw new BadRequestException(
              `${file.originalname}: ${error.message}`,
            )
          }

          throw error
        }
      }),
    )

    let parsed

    try {
      parsed = mergeParsedWorkbooks(parsedWorkbooks)
    } catch (error) {
      if (error instanceof ExcelParseError) {
        throw new BadRequestException(error.message)
      }

      throw error
    }

    const fileName =
      files.length === 1
        ? files[0].originalname
        : `${files[0].originalname} (+${files.length - 1} archivos)`

    const storedData: StoredPreviewData = {
      files: parsed.files,
      headers: parsed.headers,
      suggestedMapping: parsed.suggestedMapping,
    }

    const batch = await this.prisma.importBatch.create({
      data: {
        fileName,
        uploadedById: actorId,
        totalRows: parsed.totalRows,
        validRows: 0,
        errorRows: 0,
        importedRows: 0,
        status: ImportStatus.PREVIEW,
        columnMapping: parsed.suggestedMapping as Prisma.InputJsonValue,
        previewData: storedData as unknown as Prisma.InputJsonValue,
      },
      select: batchDetailSelect,
    })

    await this.audit.record({
      userId: actorId,
      action: 'IMPORT_UPLOADED',
      entity: 'ImportBatch',
      entityId: batch.id,
      details: {
        fileName,
        files: files.map((file) => file.originalname),
        totalRows: parsed.totalRows,
      },
    })

    return serializeDetail(batch)
  }

  async preview(id: string, dto: ImportOptionsDto) {
    const batch = await this.getBatchOrThrow(id)

    if (batch.status === ImportStatus.CONFIRMED) {
      throw new BadRequestException(
        'La importación ya fue confirmada y no se puede volver a previsualizar',
      )
    }

    const data = readStoredData(batch)
    const mapping = this.resolveMapping(dto.mapping, batch, data)
    const validation = await this.validateRows(
      data.files,
      mapping,
      {
        createMissingSubprocesses:
          dto.createMissingSubprocesses ?? false,
        authorizeDateChanges: dto.authorizeDateChanges ?? false,
      },
    )

    const storedData: StoredPreviewData = {
      ...data,
      validation,
    }

    const updated = await this.prisma.importBatch.update({
      where: { id },
      data: {
        columnMapping: mapping as Prisma.InputJsonValue,
        previewData: storedData as unknown as Prisma.InputJsonValue,
        totalRows: validation.summary.totalRows,
        validRows: validation.summary.validRows,
        errorRows: validation.summary.errorRows,
        status: ImportStatus.PREVIEW,
      },
      select: batchDetailSelect,
    })

    return {
      ...serializeDetail(updated),
      mapping,
      validation,
    }
  }

  async confirm(id: string, dto: ImportOptionsDto, actorId: string) {
    const batch = await this.getBatchOrThrow(id)

    if (batch.status === ImportStatus.CONFIRMED) {
      throw new BadRequestException(
        'La importación ya fue confirmada',
      )
    }

    const data = readStoredData(batch)
    const mapping = this.resolveMapping(dto.mapping, batch, data)
    const options = {
      createMissingSubprocesses:
        dto.createMissingSubprocesses ?? false,
      authorizeDateChanges: dto.authorizeDateChanges ?? false,
    }
    const validation = await this.validateRows(
      data.files,
      mapping,
      options,
    )

    if (validation.summary.validRows === 0) {
      throw new BadRequestException(
        'No hay filas válidas para importar. Corrija los errores de la vista previa',
      )
    }

    const result = await this.prisma
      .$transaction(async (tx) => {
        const subprocesses = await tx.subprocess.findMany({
          select: { id: true, name: true },
        })
        const subprocessMap = new Map(
          subprocesses.map((subprocess) => [
            normalizeLookupText(subprocess.name),
            subprocess.id,
          ]),
        )

        const nitValues = validation.rows
          .filter(
            (row) =>
              row.status === 'NEW' || row.status === 'EXISTING',
          )
          .map((row) => row.nitNormalized)

        const existingRows = await tx.counterparty.findMany({
          where: { nitNormalized: { in: nitValues } },
          select: existingCounterpartySelect,
        })
        const existingMap = new Map(
          existingRows.map((row) => [row.nitNormalized, row]),
        )

        const today = getBusinessToday()
        let created = 0
        let existing = 0
        let updatedDates = 0
        let unexpectedConflicts = 0
        let createdSubprocesses = 0

        for (const row of validation.rows) {
          if (
            row.status !== 'NEW' &&
            row.status !== 'EXISTING'
          ) {
            continue
          }

          const current = existingMap.get(row.nitNormalized)
          const subprocessName = row.values.subprocess

          if (current) {
            let resolvedSubprocessId: string | null = null

            if (subprocessName) {
              const key = normalizeLookupText(subprocessName)
              resolvedSubprocessId = subprocessMap.get(key) ?? null

              if (!resolvedSubprocessId) {
                unexpectedConflicts++
                continue
              }
            }

            if (
              current.status !== CounterpartyStatus.ACTIVE ||
              (resolvedSubprocessId &&
                current.subprocessId !== resolvedSubprocessId)
            ) {
              unexpectedConflicts++
              continue
            }

            existing++

            if (options.authorizeDateChanges) {
              const updateData: Prisma.CounterpartyUpdateInput = {}

              for (const field of Object.keys(
                row.dateDifferences,
              ) as DateField[]) {
                const value = row.values[field]

                if (value) {
                  updateData[field] = parseDateOnly(value)
                }
              }

              if (Object.keys(updateData).length > 0) {
                await tx.counterparty.update({
                  where: { id: current.id },
                  data: updateData,
                })
                updatedDates++
              }
            }

            continue
          }

          if (!subprocessName) {
            unexpectedConflicts++
            continue
          }

          const subprocessKey = normalizeLookupText(subprocessName)
          let subprocessId = subprocessMap.get(subprocessKey)

          if (!subprocessId) {
            if (!options.createMissingSubprocesses) {
              unexpectedConflicts++
              continue
            }

            const subprocess = await tx.subprocess.create({
              data: { name: subprocessName.trim() },
              select: { id: true },
            })
            subprocessId = subprocess.id
            subprocessMap.set(subprocessKey, subprocessId)
            createdSubprocesses++
          }

          const registrationDate = row.values.registrationDate
            ? parseDateOnly(row.values.registrationDate)
            : today
          const lastFollowUpDate = row.values.lastFollowUpDate
            ? parseDateOnly(row.values.lastFollowUpDate)
            : null
          const nextFollowUpDate = row.values.nextFollowUpDate
            ? parseDateOnly(row.values.nextFollowUpDate)
            : addMonths(lastFollowUpDate ?? registrationDate, 6)

          await tx.counterparty.create({
            data: {
              nit: row.values.nit ?? row.nitNormalized,
              nitNormalized: row.nitNormalized,
              businessName: row.values.businessName ?? '',
              observations: row.values.observations,
              subprocessId,
              registrationDate,
              lastFollowUpDate,
              nextFollowUpDate,
            },
          })
          created++
        }

        const resultSummary = {
          created,
          existing,
          updatedDates,
          conflicts:
            validation.summary.conflictRows +
            unexpectedConflicts,
          errors:
            validation.summary.errorRows -
            validation.summary.conflictRows,
          createdSubprocesses,
        }

        const errorDetails = validation.rows
          .filter(
            (row) =>
              row.status === 'ERROR' ||
              row.status === 'CONFLICT',
          )
          .map((row) => ({
            file: row.file,
            sheet: row.sheet,
            rowNumber: row.rowNumber,
            nit: row.values.nit,
            businessName: row.values.businessName,
            status: row.status,
            errors: row.errors,
          }))

        const updatedBatch = await tx.importBatch.update({
          where: { id },
          data: {
            status: ImportStatus.CONFIRMED,
            confirmedAt: new Date(),
            totalRows: validation.summary.totalRows,
            validRows: validation.summary.validRows,
            errorRows: validation.summary.errorRows,
            importedRows: created,
            resultSummary:
              resultSummary as Prisma.InputJsonValue,
            errorDetails: errorDetails as Prisma.InputJsonValue,
            columnMapping: mapping as Prisma.InputJsonValue,
            previewData: {
              ...data,
              validation,
            } as unknown as Prisma.InputJsonValue,
          },
          select: batchDetailSelect,
        })

        return { summary: resultSummary, batch: updatedBatch }
      })
      .catch(async (error) => {
        if (error instanceof HttpException) {
          throw error
        }

        const message =
          error instanceof Error
            ? error.message
            : 'Error desconocido al confirmar la importación'

        await this.prisma.importBatch
          .update({
            where: { id },
            data: {
              status: ImportStatus.FAILED,
              errorDetails: { message },
            },
          })
          .catch(() => undefined)

        this.logger.error(
          'No fue posible confirmar la importación',
          error instanceof Error ? error.stack : undefined,
        )

        throw new BadRequestException(
          'No fue posible confirmar la importación. No se guardaron cambios',
        )
      })

    try {
      await this.audit.record({
        userId: actorId,
        action: 'IMPORT_CONFIRMED',
        entity: 'ImportBatch',
        entityId: id,
        details: result.summary,
      })
    } catch (error) {
      this.logger.warn(
        'La importación se confirmó, pero no fue posible registrar la auditoría',
        error instanceof Error ? error.stack : undefined,
      )
    }

    if (
      result.summary.created > 0 ||
      result.summary.updatedDates > 0
    ) {
      try {
        await this.notifications.generateDaily()
      } catch (error) {
        this.logger.warn(
          'La importación se confirmó, pero no fue posible generar las notificaciones',
          error instanceof Error ? error.stack : undefined,
        )
      }
    }

    return {
      ...serializeDetail(result.batch),
      result: result.summary,
    }
  }

  private async getBatchOrThrow(
    id: string,
  ): Promise<BatchDetailRow> {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id },
      select: batchDetailSelect,
    })

    if (!batch) {
      throw new NotFoundException('Importación no encontrada')
    }

    return batch
  }

  private resolveMapping(
    input: Record<string, unknown> | undefined,
    batch: BatchDetailRow,
    data: StoredPreviewData,
  ): ImportMapping {
    const provided = sanitizeMapping(input)

    if (provided) {
      return provided
    }

    const stored = sanitizeMapping(batch.columnMapping)

    if (stored) {
      return stored
    }

    return data.suggestedMapping
  }

  private async validateRows(
    files: ParsedFile[],
    mapping: ImportMapping,
    options: {
      createMissingSubprocesses: boolean
      authorizeDateChanges: boolean
    },
  ): Promise<StoredValidation> {
    const flatRows = flattenRows(files)
    const today = toDateOnly(getBusinessToday()) ?? ''
    const rawNits = flatRows
      .map((flatRow) =>
        normalizeNit(valueFrom(flatRow, mapping, 'nit') ?? ''),
      )
      .filter((nit) => nit.length > 0)

    const [subprocesses, existingRows] = await Promise.all([
      this.prisma.subprocess.findMany({
        select: { id: true, name: true },
      }),
      this.prisma.counterparty.findMany({
        where: {
          nitNormalized: { in: [...new Set(rawNits)] },
        },
        select: existingCounterpartySelect,
      }),
    ])

    const subprocessMap = new Map(
      subprocesses.map((subprocess) => [
        normalizeLookupText(subprocess.name),
        subprocess,
      ]),
    )
    const existingMap = new Map(
      existingRows.map((row) => [row.nitNormalized, row]),
    )
    const firstNits = new Map<
      string,
      { file: string; sheet: string; rowNumber: number }
    >()

    const validationRows: ImportRowValidation[] = []

    for (const flatRow of flatRows) {
      const errors: string[] = []
      const warnings: string[] = []
      const conflicts: string[] = []
      const rawNit = valueFrom(flatRow, mapping, 'nit')
      const nit = rawNit?.trim() ?? ''
      const nitNormalized = normalizeNit(nit)
      const businessName =
        valueFrom(flatRow, mapping, 'businessName')?.trim() ?? ''
      const subprocessName =
        valueFrom(flatRow, mapping, 'subprocess')?.trim() ?? ''
      const registrationRaw = valueFrom(
        flatRow,
        mapping,
        'registrationDate',
      )
      const lastFollowUpRaw = valueFrom(
        flatRow,
        mapping,
        'lastFollowUpDate',
      )
      const nextFollowUpRaw = valueFrom(
        flatRow,
        mapping,
        'nextFollowUpDate',
      )
      const observations =
        valueFrom(flatRow, mapping, 'observations')?.trim() || null

      if (!nit) {
        errors.push('El NIT está vacío')
      } else if (!NIT_PATTERN.test(nit)) {
        errors.push(
          'El NIT debe contener entre 6 y 15 dígitos y solo puede incluir números, puntos, guiones y espacios',
        )
      } else if (nit.length > 30) {
        errors.push('El NIT es demasiado largo')
      }

      if (!businessName) {
        errors.push('La razón social está vacía')
      } else if (businessName.length > 200) {
        errors.push('La razón social supera los 200 caracteres')
      }

      if (!subprocessName) {
        errors.push('El subproceso está vacío')
      }

      if (observations && observations.length > 2000) {
        errors.push('Las observaciones superan los 2000 caracteres')
      }

      const subprocess = subprocessName
        ? subprocessMap.get(normalizeLookupText(subprocessName)) ??
          null
        : null

      if (
        subprocessName &&
        !subprocess &&
        options.createMissingSubprocesses
      ) {
        warnings.push(
          `El subproceso "${subprocessName}" no existe y se creará al confirmar`,
        )
      } else if (subprocessName && !subprocess) {
        errors.push(
          `El subproceso "${subprocessName}" no está identificado en el catálogo`,
        )
      }

      const registrationDate = parseDateWithError(
        registrationRaw,
        'registrationDate',
        errors,
      )
      const lastFollowUpDate = parseDateWithError(
        lastFollowUpRaw,
        'lastFollowUpDate',
        errors,
      )
      const nextFollowUpDate = parseDateWithError(
        nextFollowUpRaw,
        'nextFollowUpDate',
        errors,
      )

      if (registrationDate && registrationDate > today) {
        errors.push(
          'La fecha de registro no puede ser futura',
        )
      }

      if (nitNormalized) {
        const firstOccurrence = firstNits.get(nitNormalized)

        if (firstOccurrence) {
          errors.push(
            `NIT repetido en la importación (${firstOccurrence.file} / ${firstOccurrence.sheet}, fila ${firstOccurrence.rowNumber})`,
          )
        } else {
          firstNits.set(nitNormalized, {
            file: flatRow.file,
            sheet: flatRow.sheet,
            rowNumber: flatRow.rowNumber,
          })
        }
      }

      const existing = nitNormalized
        ? existingMap.get(nitNormalized) ?? null
        : null
      const dateDifferences: DateDifferences = {}
      let needsSubprocessCreation = false

      if (existing) {
        if (existing.status !== CounterpartyStatus.ACTIVE) {
          conflicts.push(
            'La contraparte existe pero está archivada; no se reactivará automáticamente',
          )
        }

        if (!subprocess) {
          conflicts.push(
            'La contraparte ya existe y el subproceso indicado no coincide con el registrado',
          )
        } else if (existing.subprocessId !== subprocess.id) {
          conflicts.push(
            `La contraparte ya existe con el subproceso "${existing.subprocess.name}"`,
          )
        } else {
          const currentDates: Record<DateField, string | null> = {
            registrationDate: toDateOnly(
              existing.registrationDate,
            ),
            lastFollowUpDate: toDateOnly(
              existing.lastFollowUpDate,
            ),
            nextFollowUpDate: toDateOnly(
              existing.nextFollowUpDate,
            ),
          }
          const importedDates: Record<
            DateField,
            string | null
          > = {
            registrationDate,
            lastFollowUpDate,
            nextFollowUpDate,
          }

          for (const field of Object.keys(
            currentDates,
          ) as DateField[]) {
            const imported = importedDates[field]

            if (
              imported &&
              imported !== currentDates[field]
            ) {
              dateDifferences[field] = {
                current: currentDates[field],
                imported,
              }
            }
          }

          const changedDates = Object.keys(
            dateDifferences,
          ) as DateField[]

          if (changedDates.length > 0) {
            const labels = changedDates
              .map((field) => DATE_FIELD_LABELS[field])
              .join(', ')

            warnings.push(
              options.authorizeDateChanges
                ? `Se actualizarán las fechas: ${labels}`
                : `Las fechas difieren (${labels}). Autorice los cambios de fecha para actualizarlas`,
            )
          }
        }
      } else if (
        subprocessName &&
        !subprocess &&
        options.createMissingSubprocesses
      ) {
        needsSubprocessCreation = true
      }

      const status: ImportRowValidation['status'] =
        errors.length > 0
          ? 'ERROR'
          : conflicts.length > 0
            ? 'CONFLICT'
            : existing
              ? 'EXISTING'
              : 'NEW'

      validationRows.push({
        key: flatRow.key,
        file: flatRow.file,
        sheet: flatRow.sheet,
        rowNumber: flatRow.rowNumber,
        values: {
          nit: nit || null,
          businessName: businessName || null,
          subprocess: subprocessName || null,
          registrationDate,
          lastFollowUpDate,
          nextFollowUpDate,
          observations,
        },
        nitNormalized,
        status,
        errors: [...errors, ...conflicts],
        warnings,
        existingCounterpartyId: existing?.id ?? null,
        dateDifferences,
        needsSubprocessCreation,
      })
    }

    const newRows = validationRows.filter(
      (row) => row.status === 'NEW',
    ).length
    const existingRowsCount = validationRows.filter(
      (row) => row.status === 'EXISTING',
    ).length
    const conflictRows = validationRows.filter(
      (row) => row.status === 'CONFLICT',
    ).length
    const dataErrorRows = validationRows.filter(
      (row) => row.status === 'ERROR',
    ).length
    const validRows = newRows + existingRowsCount
    const subprocessesToCreate = [
      ...new Set(
        validationRows
          .filter(
            (row) =>
              row.status === 'NEW' &&
              row.needsSubprocessCreation &&
              row.values.subprocess,
          )
          .map((row) => row.values.subprocess as string),
      ),
    ]

    return {
      mapping,
      options,
      rows: validationRows,
      summary: {
        totalRows: validationRows.length,
        validRows,
        newRows,
        existingRows: existingRowsCount,
        conflictRows,
        errorRows: dataErrorRows + conflictRows,
        subprocessesToCreate,
        canConfirm: validRows > 0,
      },
    }
  }
}
