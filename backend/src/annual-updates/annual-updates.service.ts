import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { AnnualStatus, Prisma } from '@prisma/client'
import { AnnualNotificationsService } from '../annual-notifications/annual-notifications.service.js'
import { AuditService } from '../audit/audit.service.js'
import {
  getBusinessToday,
  parseDateOnly,
  toDateOnly,
} from '../common/utils/dates.js'
import { PrismaService } from '../prisma/prisma.service.js'
import {
  DEFAULT_ANNUAL_SOURCE,
  type AnnualSource,
} from './annual-sources.js'
import {
  annualDueDate,
  annualSituation,
  daysUntil,
  minimumAnnualFilingDate,
  needsAnnualUpdate,
} from './annual-dates.js'
import {
  ANNUAL_IMPORT_FIELDS,
  ExcelParseError,
  getAnnualFieldValue,
  normalizeAnnualCode,
  normalizeAnnualDate,
  normalizeAnnualStatus,
  normalizeAnnualYear,
  normalizeSemiannualFollowUp,
  parseAnnualWorkbook,
  type AnnualImportField,
  type AnnualImportMapping,
  type ParsedAnnualFile,
} from './annual-parser.js'
import { ListAnnualUpdatesDueQueryDto } from './dto/list-annual-updates-due-query.dto.js'
import {
  ListAnnualUpdatesQueryDto,
  type AnnualUpdateFilter,
} from './dto/list-annual-updates-query.dto.js'

export type UploadedAnnualFile = {
  originalname: string
  buffer: Buffer
  size: number
  mimetype: string
}

type AnnualRowAction =
  | 'NEW'
  | 'UPDATE'
  | 'UNCHANGED'
  | 'IGNORED'
  | 'ERROR'

type AnnualRowValidation = {
  rowNumber: number
  code: string | null
  codeNormalized: string | null
  businessName: string | null
  status: AnnualStatus | null
  requiresSemiannualFollowUp: boolean | null
  filingDate: string | null
  filingYear: number | null
  dueDiligenceType: string | null
  observations: string | null
  action: AnnualRowAction
  errors: string[]
  warnings: string[]
}

type AnnualImportSummary = {
  totalRows: number
  validRows: number
  newRows: number
  updatedRows: number
  unchangedRows: number
  ignoredRows: number
  errorRows: number
  activeRows: number
  inactiveRows: number
  activeUpdatedThisYear: number
  activePendingUpdate: number
  inactiveUpdatedThisYear: number
  inactivePendingUpdate: number
  withoutDateRows: number
  semiannualFollowUpRows: number
  canConfirm: boolean
}

type AnnualValidation = {
  rows: AnnualRowValidation[]
  summary: AnnualImportSummary
}

const MAX_FILE_SIZE = 10 * 1024 * 1024

const REQUIRED_ANNUAL_FIELDS: AnnualImportField[] = [
  'code',
  'businessName',
  'status',
]

const ANNUAL_FIELD_LABELS: Record<AnnualImportField, string> = {
  code: 'código de punto de venta',
  businessName: 'nombre',
  status: 'estado',
  filingDate: 'fecha de diligenciamiento',
  filingYear: 'año',
  dueDiligenceType: 'tipo de debida diligencia',
  requiresSemiannualFollowUp: 'seguimiento',
  observations: 'observaciones',
}

function emptyImportSummary(
  totalRows: number,
): AnnualImportSummary {
  return {
    totalRows,
    validRows: 0,
    newRows: 0,
    updatedRows: 0,
    unchangedRows: 0,
    ignoredRows: 0,
    errorRows: 0,
    activeRows: 0,
    inactiveRows: 0,
    activeUpdatedThisYear: 0,
    activePendingUpdate: 0,
    inactiveUpdatedThisYear: 0,
    inactivePendingUpdate: 0,
    withoutDateRows: 0,
    semiannualFollowUpRows: 0,
    canConfirm: false,
  }
}

const annualSelect = {
  id: true,
  source: true,
  code: true,
  businessName: true,
  status: true,
  requiresSemiannualFollowUp: true,
  filingDate: true,
  filingYear: true,
  dueDiligenceType: true,
  observations: true,
  sourceFileName: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AnnualCounterpartySelect

type AnnualRow = Prisma.AnnualCounterpartyGetPayload<{
  select: typeof annualSelect
}>

type ExistingAnnualRow = {
  id: string
  codeNormalized: string
  businessName: string
  status: AnnualStatus
  requiresSemiannualFollowUp: boolean | null
  filingDate: Date | null
  filingYear: number | null
  dueDiligenceType: string | null
  observations: string | null
}

function yearStart(year: number): Date {
  return new Date(Date.UTC(year, 0, 1))
}

function nextYearStart(year: number): Date {
  return new Date(Date.UTC(year + 1, 0, 1))
}

function dateBelongsToYear(
  value: string | null,
  year: number,
): boolean {
  return Boolean(value?.startsWith(`${year}-`))
}

function updatedInYear(
  filingYear: number | null,
  filingDate: string | null,
  year: number,
): boolean {
  return filingYear !== null
    ? filingYear === year
    : dateBelongsToYear(filingDate, year)
}

function updatedThisYearWhere(
  year: number,
  status?: AnnualStatus,
  source?: AnnualSource,
): Prisma.AnnualCounterpartyWhereInput {
  return {
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
    OR: [
      { filingYear: year },
      {
        filingYear: null,
        filingDate: {
          gte: yearStart(year),
          lt: nextYearStart(year),
        },
      },
    ],
  }
}

function recentFilingWhere(
  currentYear: number,
  status?: AnnualStatus,
  source?: AnnualSource,
): Prisma.AnnualCounterpartyWhereInput {
  return {
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
    OR: [
      { filingYear: { gte: currentYear - 1 } },
      {
        filingYear: null,
        filingDate: { gte: minimumAnnualFilingDate(currentYear) },
      },
    ],
  }
}

function actionForExisting(
  row: {
    businessName: string
    status: AnnualStatus
    requiresSemiannualFollowUp: boolean | null
    filingDate: string | null
    filingYear: number | null
    dueDiligenceType: string | null
    observations: string | null
  },
  existing: ExistingAnnualRow,
): 'UPDATE' | 'UNCHANGED' {
  return row.businessName === existing.businessName &&
    row.status === existing.status &&
    row.requiresSemiannualFollowUp ===
      existing.requiresSemiannualFollowUp &&
    row.filingDate === toDateOnly(existing.filingDate) &&
    row.filingYear === existing.filingYear &&
    row.dueDiligenceType === existing.dueDiligenceType &&
    row.observations === existing.observations
    ? 'UNCHANGED'
    : 'UPDATE'
}

function isMissingAnnualValue(value: string | null): boolean {
  if (!value) {
    return true
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, '')

  return [
    'n/a',
    'na',
    'noaplica',
    'sinfecha',
    'sindato',
    '-',
    '--',
  ].includes(normalized)
}

function isMoreRecentAnnualRow(
  candidate: {
    filingDate: string | null
    filingYear: number | null
  },
  current: {
    filingDate: string | null
    filingYear: number | null
  },
): boolean {
  const candidateYear =
    candidate.filingYear ?? Number.NEGATIVE_INFINITY
  const currentYear =
    current.filingYear ?? Number.NEGATIVE_INFINITY

  if (candidateYear !== currentYear) {
    return candidateYear > currentYear
  }

  if (candidate.filingDate && current.filingDate) {
    return candidate.filingDate > current.filingDate
  }

  return Boolean(candidate.filingDate) && !current.filingDate
}

function serializeAnnual(row: AnnualRow, currentYear: number) {
  const filingDate = toDateOnly(row.filingDate)
  const updatedThisYear = updatedInYear(
    row.filingYear,
    filingDate,
    currentYear,
  )
  const hasFilingData =
    filingDate !== null || row.filingYear !== null

  return {
    id: row.id,
    source: row.source,
    code: row.code,
    businessName: row.businessName,
    status: row.status,
    requiresSemiannualFollowUp:
      row.requiresSemiannualFollowUp,
    filingDate,
    filingYear: row.filingYear,
    dueDiligenceType: row.dueDiligenceType,
    observations: row.observations,
    updatedThisYear,
    annualStatus: !hasFilingData
      ? 'NO_DATE'
      : updatedThisYear
        ? 'UPDATED_THIS_YEAR'
        : 'PENDING',
    sourceFileName: row.sourceFileName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

@Injectable()
export class AnnualUpdatesService {
  private readonly logger = new Logger(AnnualUpdatesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly annualNotifications: AnnualNotificationsService,
  ) {}

  async getSummary(
    source: AnnualSource = DEFAULT_ANNUAL_SOURCE,
  ) {
    const today = getBusinessToday()
    const currentYear = today.getUTCFullYear()
    const active = { status: AnnualStatus.ACTIVE, source }
    const inactive = { status: AnnualStatus.INACTIVE, source }
    const noFilingData = {
      filingDate: null,
      filingYear: null,
    }

    const [
      total,
      activeRows,
      inactiveRows,
      activeUpdated,
      inactiveUpdated,
      activeWithoutDate,
      inactiveWithoutDate,
      activeFollowUp,
      inactiveFollowUp,
      activeRelevant,
      activeRelevantUpdated,
    ] = await this.prisma.$transaction([
      this.prisma.annualCounterparty.count(),
      this.prisma.annualCounterparty.count({ where: active }),
      this.prisma.annualCounterparty.count({ where: inactive }),
      this.prisma.annualCounterparty.count({
        where: updatedThisYearWhere(
          currentYear,
          AnnualStatus.ACTIVE,
          source,
        ),
      }),
      this.prisma.annualCounterparty.count({
        where: updatedThisYearWhere(
          currentYear,
          AnnualStatus.INACTIVE,
          source,
        ),
      }),
      this.prisma.annualCounterparty.count({
        where: { ...active, ...noFilingData },
      }),
      this.prisma.annualCounterparty.count({
        where: { ...inactive, ...noFilingData },
      }),
      this.prisma.annualCounterparty.count({
        where: {
          ...active,
          requiresSemiannualFollowUp: true,
        },
      }),
      this.prisma.annualCounterparty.count({
        where: {
          ...inactive,
          requiresSemiannualFollowUp: true,
        },
      }),
      this.prisma.annualCounterparty.count({
        where: recentFilingWhere(
          currentYear,
          AnnualStatus.ACTIVE,
          source,
        ),
      }),
      this.prisma.annualCounterparty.count({
        where: {
          AND: [
            recentFilingWhere(
              currentYear,
              AnnualStatus.ACTIVE,
              source,
            ),
            updatedThisYearWhere(
              currentYear,
              AnnualStatus.ACTIVE,
              source,
            ),
          ],
        },
      }),
    ])

    return {
      businessDate: toDateOnly(today),
      currentYear,
      totals: {
        total,
        active: activeRows,
        inactive: inactiveRows,
      },
      annual: {
        updatedThisYear: activeUpdated + inactiveUpdated,
        active: {
          total: activeRows,
          updatedThisYear: activeUpdated,
          pendingUpdate: activeRelevant - activeRelevantUpdated,
          withoutDate: activeWithoutDate,
        },
        inactive: {
          total: inactiveRows,
          updatedThisYear: inactiveUpdated,
          pendingUpdate: 0,
          withoutDate: inactiveWithoutDate,
        },
      },
      semiannual: {
        activeWithFollowUp: activeFollowUp,
        inactiveWithFollowUp: inactiveFollowUp,
        totalWithFollowUp: activeFollowUp + inactiveFollowUp,
      },
    }
  }

  async findAll(
    query: ListAnnualUpdatesQueryDto,
    source: AnnualSource = DEFAULT_ANNUAL_SOURCE,
  ) {
    const today = getBusinessToday()
    const currentYear = today.getUTCFullYear()
    const where = this.buildWhere(query, currentYear, source)
    const page = query.page
    const pageSize = query.pageSize

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.annualCounterparty.findMany({
        where,
        select: annualSelect,
        orderBy: [
          { status: 'asc' },
          { businessName: 'asc' },
          { code: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.annualCounterparty.count({ where }),
    ])

    return {
      data: rows.map((row) => serializeAnnual(row, currentYear)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  }

  async getUpdatesDue(
    query: ListAnnualUpdatesDueQueryDto,
    source: AnnualSource = DEFAULT_ANNUAL_SOURCE,
  ) {
    const today = getBusinessToday()
    const currentYear = today.getUTCFullYear()
    const minimumFilingDate = minimumAnnualFilingDate(currentYear)
    const rows = await this.prisma.annualCounterparty.findMany({
      where: {
        source,
        status: AnnualStatus.ACTIVE,
        filingDate: { gte: minimumFilingDate },
      },
      select: annualSelect,
      orderBy: [{ filingDate: 'asc' }, { code: 'asc' }],
    })

    const evaluated = rows
      .filter(
        (row) =>
          row.filingDate !== null && row.filingDate >= minimumFilingDate,
      )
      .map((row) => {
        const dueDate = annualDueDate(row.filingDate)
        const days = daysUntil(dueDate, today)

        return {
          ...serializeAnnual(row, currentYear),
          dueDate: toDateOnly(dueDate),
          daysUntilDue: days,
          situation: annualSituation(days),
        }
      })
      .filter((row) => row.situation !== 'NOT_DUE')

    const sorted = [...evaluated].sort((first, second) => {
      if (first.daysUntilDue === null) {
        return 1
      }

      if (second.daysUntilDue === null) {
        return -1
      }

      return first.daysUntilDue - second.daysUntilDue
    })

    const page = query.page
    const pageSize = query.pageSize
    const total = sorted.length

    return {
      data: sorted.slice((page - 1) * pageSize, page * pageSize),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: {
        needsUpdate: evaluated.filter((row) =>
          needsAnnualUpdate(row.daysUntilDue),
        ).length,
        overdue: evaluated.filter(
          (row) => row.situation === 'OVERDUE',
        ).length,
        dueToday: evaluated.filter(
          (row) => row.situation === 'DUE_TODAY',
        ).length,
        upcoming: evaluated.filter(
          (row) => row.situation === 'DUE_SOON',
        ).length,
        withoutDate: evaluated.filter(
          (row) => row.situation === 'WITHOUT_DATE',
        ).length,
      },
    }
  }

  async preview(
    file: UploadedAnnualFile | undefined,
    mappingInput?: string,
    source: AnnualSource = DEFAULT_ANNUAL_SOURCE,
  ) {
    const parsed = await this.parseFile(file)
    const mapping = this.resolveMapping(parsed, mappingInput)
    const missingFields = this.missingRequiredFields(mapping)
    const fileInfo = {
      name: parsed.fileName,
      sheetName: parsed.sheetName,
      ignoredSheets: parsed.ignoredSheets,
      totalRows: parsed.totalRows,
    }

    if (missingFields.length > 0) {
      return {
        file: fileInfo,
        headers: parsed.headers,
        mapping,
        rows: [],
        summary: emptyImportSummary(parsed.totalRows),
        mappingErrors: [
          `Debe mapear las columnas: ${missingFields
            .map((field) => ANNUAL_FIELD_LABELS[field])
            .join(', ')}`,
        ],
      }
    }

    const validation = await this.validateRows(
      parsed,
      mapping,
      getBusinessToday(),
      source,
    )

    return {
      file: fileInfo,
      headers: parsed.headers,
      mapping,
      rows: validation.rows,
      summary: validation.summary,
      mappingErrors: [],
    }
  }

  async confirmImport(
    file: UploadedAnnualFile | undefined,
    mappingInput: string | undefined,
    actorId: string,
    source: AnnualSource = DEFAULT_ANNUAL_SOURCE,
  ) {
    const parsed = await this.parseFile(file)
    const mapping = this.resolveMapping(parsed, mappingInput)
    const missingFields = this.missingRequiredFields(mapping)

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Debe mapear las columnas: ${missingFields
          .map((field) => ANNUAL_FIELD_LABELS[field])
          .join(', ')}`,
      )
    }

    const validation = await this.validateRows(
      parsed,
      mapping,
      getBusinessToday(),
      source,
    )

    if (validation.summary.validRows === 0) {
      throw new BadRequestException(
        'No hay filas válidas para importar. Revise los errores de la vista previa',
      )
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        let created = 0
        let updated = 0
        let unchanged = 0

        for (const row of validation.rows) {
          if (
            row.action === 'ERROR' ||
            row.action === 'UNCHANGED' ||
            row.action === 'IGNORED' ||
            !row.code ||
            !row.codeNormalized ||
            !row.businessName ||
            !row.status
          ) {
            if (row.action === 'UNCHANGED') {
              unchanged++
            }

            continue
          }

          const data = {
            source,
            code: row.code,
            codeNormalized: row.codeNormalized,
            businessName: row.businessName,
            status: row.status,
            requiresSemiannualFollowUp:
              row.requiresSemiannualFollowUp,
            filingDate: row.filingDate
              ? parseDateOnly(row.filingDate)
              : null,
            filingYear: row.filingYear,
            dueDiligenceType: row.dueDiligenceType,
            observations: row.observations,
            sourceFileName: parsed.fileName,
          }

          await tx.annualCounterparty.upsert({
            where: {
              source_codeNormalized: {
                source,
                codeNormalized: row.codeNormalized,
              },
            },
            create: data,
            update: data,
          })

          if (row.action === 'NEW') {
            created++
          } else {
            updated++
          }
        }

        return { created, updated, unchanged }
      },
      { timeout: 120000 },
    )

    const resultSummary = {
      ...validation.summary,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      skipped:
        validation.summary.errorRows +
        validation.summary.ignoredRows,
    }

    await this.audit.record({
      userId: actorId,
      action: 'ANNUAL_UPDATES_IMPORTED',
      entity: 'AnnualCounterparty',
      details: {
        source,
        fileName: parsed.fileName,
        ...resultSummary,
      },
    })

    try {
      await this.annualNotifications.generateDaily(source)
    } catch (error) {
      this.logger.error(
        'No fue posible generar las notificaciones anuales tras la importación',
        error instanceof Error ? error.stack : undefined,
      )
    }

    return {
      file: {
        source,
        name: parsed.fileName,
        sheetName: parsed.sheetName,
      },
      summary: resultSummary,
    }
  }

  private buildWhere(
    query: ListAnnualUpdatesQueryDto,
    currentYear: number,
    source: AnnualSource,
  ): Prisma.AnnualCounterpartyWhereInput {
    const conditions: Prisma.AnnualCounterpartyWhereInput[] = [
      { source },
    ]

    if (query.status) {
      conditions.push({ status: query.status })
    }

    if (query.requiresSemiannualFollowUp !== undefined) {
      conditions.push({
        requiresSemiannualFollowUp:
          query.requiresSemiannualFollowUp,
      })
    }

    if (query.search) {
      conditions.push({
        OR: [
          {
            code: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            businessName: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      })
    }

    if (query.annualStatus) {
      conditions.push(
        this.annualStatusWhere(
          query.annualStatus,
          currentYear,
          source,
        ),
      )
    }

    return conditions.length > 0 ? { AND: conditions } : {}
  }

  private annualStatusWhere(
    status: AnnualUpdateFilter,
    currentYear: number,
    source: AnnualSource,
  ): Prisma.AnnualCounterpartyWhereInput {
    if (status === 'UPDATED_THIS_YEAR') {
      return updatedThisYearWhere(currentYear, undefined, source)
    }

    if (status === 'NO_DATE') {
      return {
        source,
        filingDate: null,
        filingYear: null,
      }
    }

    const start = yearStart(currentYear)
    const end = nextYearStart(currentYear)

    return {
      source,
      status: AnnualStatus.ACTIVE,
      OR: [
        { filingYear: { lt: currentYear } },
        { filingYear: { gt: currentYear } },
        { filingYear: null, filingDate: null },
        { filingYear: null, filingDate: { lt: start } },
        { filingYear: null, filingDate: { gte: end } },
      ],
    }
  }

  private async parseFile(
    file: UploadedAnnualFile | undefined,
  ): Promise<ParsedAnnualFile> {
    if (!file) {
      throw new BadRequestException(
        'Seleccione un archivo de Excel',
      )
    }

    const extension = file.originalname
      .slice(file.originalname.lastIndexOf('.'))
      .toLowerCase()

    if (extension === '.xls') {
      throw new BadRequestException(
        `"${file.originalname}" está en formato .xls. Guárdelo como .xlsx o .xlsm`,
      )
    }

    if (extension !== '.xlsx' && extension !== '.xlsm') {
      throw new BadRequestException(
        `"${file.originalname}" no es un archivo .xlsx o .xlsm`,
      )
    }

    if (!file.size || !file.buffer?.length) {
      throw new BadRequestException(
        `"${file.originalname}" está vacío`,
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `"${file.originalname}" supera el límite de 10 MB`,
      )
    }

    try {
      return await parseAnnualWorkbook(
        file.buffer,
        file.originalname,
      )
    } catch (error) {
      if (error instanceof ExcelParseError) {
        throw new BadRequestException(error.message)
      }

      throw error
    }
  }

  private resolveMapping(
    parsed: ParsedAnnualFile,
    mappingInput?: string,
  ): AnnualImportMapping {
    let input: AnnualImportMapping = {}

    if (mappingInput?.trim()) {
      try {
        const parsedInput = JSON.parse(mappingInput) as unknown

        if (
          !parsedInput ||
          typeof parsedInput !== 'object' ||
          Array.isArray(parsedInput)
        ) {
          throw new Error('invalid')
        }

        input = parsedInput as AnnualImportMapping
      } catch {
        throw new BadRequestException(
          'El mapeo de columnas no tiene un formato válido',
        )
      }
    }

    const mapping: AnnualImportMapping = {
      ...parsed.suggestedMapping,
    }

    for (const field of ANNUAL_IMPORT_FIELDS) {
      if (!(field in input)) {
        continue
      }

      const value = input[field]

      if (value === null || value === undefined || value === '') {
        mapping[field] = null
        continue
      }

      if (typeof value !== 'string') {
        throw new BadRequestException(
          'El mapeo de columnas no es válido',
        )
      }

      if (
        !parsed.headers.some((header) => header.value === value)
      ) {
        throw new BadRequestException(
          'El mapeo incluye una columna que no existe en el archivo',
        )
      }

      mapping[field] = value
    }

    return mapping
  }

  private missingRequiredFields(
    mapping: AnnualImportMapping,
  ): AnnualImportField[] {
    return REQUIRED_ANNUAL_FIELDS.filter(
      (field) => !mapping[field],
    )
  }

  private latestRowNumbersByCode(
    parsed: ParsedAnnualFile,
    mapping: AnnualImportMapping,
  ): Map<string, number> {
    const latest = new Map<
      string,
      {
        rowNumber: number
        filingDate: string | null
        filingYear: number | null
      }
    >()

    for (const row of parsed.rows) {
      const codeRaw = getAnnualFieldValue(
        { headers: parsed.headers },
        row,
        mapping,
        'code',
      )?.trim()

      if (!codeRaw) {
        continue
      }

      const codeNormalized = normalizeAnnualCode(codeRaw)
      const filingDate = normalizeAnnualDate(
        getAnnualFieldValue(
          { headers: parsed.headers },
          row,
          mapping,
          'filingDate',
        ),
      )
      const parsedYear = normalizeAnnualYear(
        getAnnualFieldValue(
          { headers: parsed.headers },
          row,
          mapping,
          'filingYear',
        ),
      )
      const filingYear =
        parsedYear ??
        (filingDate ? Number(filingDate.slice(0, 4)) : null)
      const candidate = {
        rowNumber: row.rowNumber,
        filingDate,
        filingYear,
      }
      const current = latest.get(codeNormalized)

      if (!current || isMoreRecentAnnualRow(candidate, current)) {
        latest.set(codeNormalized, candidate)
      }
    }

    return new Map(
      [...latest].map(([code, candidate]) => [
        code,
        candidate.rowNumber,
      ]),
    )
  }

  private async validateRows(
    parsed: ParsedAnnualFile,
    mapping: AnnualImportMapping,
    today: Date,
    source: AnnualSource,
  ): Promise<AnnualValidation> {
    const currentYear = today.getUTCFullYear()
    const codes = parsed.rows
      .map((row) =>
        getAnnualFieldValue(
          { headers: parsed.headers },
          row,
          mapping,
          'code',
        ),
      )
      .filter((value): value is string => Boolean(value))
      .map(normalizeAnnualCode)

    const existingRows = await this.prisma.annualCounterparty.findMany({
      where: {
        source,
        codeNormalized: { in: [...new Set(codes)] },
      },
      select: {
        id: true,
        codeNormalized: true,
        businessName: true,
        status: true,
        requiresSemiannualFollowUp: true,
        filingDate: true,
        filingYear: true,
        dueDiligenceType: true,
        observations: true,
      },
    })
    const existingByCode = new Map(
      existingRows.map((row) => [row.codeNormalized, row]),
    )
    const latestRowByCode = this.latestRowNumbersByCode(
      parsed,
      mapping,
    )
    const rows: AnnualRowValidation[] = []

    for (const row of parsed.rows) {
      const errors: string[] = []
      const warnings: string[] = []
      const code =
        getAnnualFieldValue(
          { headers: parsed.headers },
          row,
          mapping,
          'code',
        )?.trim() ?? ''
      const businessName =
        getAnnualFieldValue(
          { headers: parsed.headers },
          row,
          mapping,
          'businessName',
        )?.trim() ?? ''
      const statusRaw = getAnnualFieldValue(
        { headers: parsed.headers },
        row,
        mapping,
        'status',
      )
      const followUpRaw = getAnnualFieldValue(
        { headers: parsed.headers },
        row,
        mapping,
        'requiresSemiannualFollowUp',
      )
      const dateRaw = getAnnualFieldValue(
        { headers: parsed.headers },
        row,
        mapping,
        'filingDate',
      )
      const yearRaw = getAnnualFieldValue(
        { headers: parsed.headers },
        row,
        mapping,
        'filingYear',
      )
      const dueDiligenceTypeRaw = getAnnualFieldValue(
        { headers: parsed.headers },
        row,
        mapping,
        'dueDiligenceType',
      )
      const observationsRaw = getAnnualFieldValue(
        { headers: parsed.headers },
        row,
        mapping,
        'observations',
      )
      const codeNormalized = code
        ? normalizeAnnualCode(code)
        : null
      const status = normalizeAnnualStatus(statusRaw)
      const requiresSemiannualFollowUp =
        normalizeSemiannualFollowUp(followUpRaw)
      const filingDate = normalizeAnnualDate(dateRaw)
      const parsedYear = normalizeAnnualYear(yearRaw)
      const filingYear =
        parsedYear ??
        (filingDate ? Number(filingDate.slice(0, 4)) : null)
      const dueDiligenceType =
        dueDiligenceTypeRaw?.trim() ?? null
      const observations = observationsRaw?.trim() ?? null
      const dateMissing = isMissingAnnualValue(dateRaw)
      const yearMissing = isMissingAnnualValue(yearRaw)
      const latestRowNumber = codeNormalized
        ? latestRowByCode.get(codeNormalized)
        : undefined

      if (
        codeNormalized &&
        latestRowNumber !== undefined &&
        latestRowNumber !== row.rowNumber
      ) {
        rows.push({
          rowNumber: row.rowNumber,
          code: code || null,
          codeNormalized,
          businessName: businessName || null,
          status,
          requiresSemiannualFollowUp,
          filingDate,
          filingYear,
          dueDiligenceType,
          observations,
          action: 'IGNORED',
          errors: [],
          warnings: [
            `Histórico omitido; se conserva la fila ${latestRowNumber} por ser la más reciente`,
          ],
        })
        continue
      }

      if (!code) {
        errors.push('El código de punto de venta está vacío')
      } else if (code.length > 100) {
        errors.push(
          'El código de punto de venta supera los 100 caracteres',
        )
      }

      if (!businessName) {
        errors.push('El nombre está vacío')
      } else if (businessName.length > 200) {
        errors.push('El nombre supera los 200 caracteres')
      }

      if (!statusRaw) {
        errors.push('El estado está vacío')
      } else if (!status) {
        errors.push(
          `El estado "${statusRaw}" no es válido. Use A (activo) o I (inactivo)`,
        )
      }

      if (
        followUpRaw &&
        requiresSemiannualFollowUp === null
      ) {
        errors.push(
          `El valor de seguimiento "${followUpRaw}" no es válido. Use sí o no`,
        )
      }

      if (!dateMissing && !filingDate) {
        errors.push(
          `La fecha de diligenciamiento "${dateRaw}" no es válida`,
        )
      } else if (
        filingDate &&
        parseDateOnly(filingDate) > today
      ) {
        errors.push(
          'La fecha de diligenciamiento no puede ser futura',
        )
      } else if (dateMissing) {
        warnings.push('Sin fecha de diligenciamiento')
      }

      if (!yearMissing && parsedYear === null) {
        errors.push(
          `El año "${yearRaw}" no es válido. Use un año de 4 dígitos`,
        )
      } else if (yearMissing && filingYear !== null) {
        warnings.push(
          `Sin año; se tomó ${filingYear} de la fecha de diligenciamiento`,
        )
      } else if (yearMissing) {
        warnings.push('Sin año de diligenciamiento')
      }

      if (!dueDiligenceType) {
        warnings.push('Sin tipo de debida diligencia')
      } else if (dueDiligenceType.length > 150) {
        errors.push(
          'El tipo de debida diligencia supera los 150 caracteres',
        )
      }

      if (observations && observations.length > 5000) {
        errors.push(
          'Las observaciones superan los 5000 caracteres',
        )
      }

      const existing = codeNormalized
        ? existingByCode.get(codeNormalized) ?? null
        : null
      const validStatus = status ?? null
      const baseRow = {
        businessName,
        status: validStatus,
        requiresSemiannualFollowUp,
        filingDate,
        filingYear,
        dueDiligenceType,
        observations,
      }
      let action: AnnualRowAction = 'NEW'

      if (errors.length > 0) {
        action = 'ERROR'
      } else if (
        existing &&
        validStatus &&
        baseRow.businessName
      ) {
        action = actionForExisting(
          {
            ...baseRow,
            status: validStatus,
          },
          existing,
        )
      }

      rows.push({
        rowNumber: row.rowNumber,
        code: code || null,
        codeNormalized,
        businessName: businessName || null,
        status: validStatus,
        requiresSemiannualFollowUp,
        filingDate,
        filingYear,
        dueDiligenceType,
        observations,
        action,
        errors,
        warnings,
      })
    }

    const validRows = rows.filter(
      (row) => row.action !== 'ERROR' && row.action !== 'IGNORED',
    )
    const activeRows = validRows.filter(
      (row) => row.status === AnnualStatus.ACTIVE,
    )
    const inactiveRows = validRows.filter(
      (row) => row.status === AnnualStatus.INACTIVE,
    )
    const activeUpdatedThisYear = activeRows.filter((row) =>
      updatedInYear(
        row.filingYear,
        row.filingDate,
        currentYear,
      ),
    ).length
    const inactiveUpdatedThisYear = inactiveRows.filter((row) =>
      updatedInYear(
        row.filingYear,
        row.filingDate,
        currentYear,
      ),
    ).length

    const summary: AnnualImportSummary = {
      totalRows: rows.length,
      validRows: validRows.length,
      newRows: validRows.filter((row) => row.action === 'NEW')
        .length,
      updatedRows: validRows.filter(
        (row) => row.action === 'UPDATE',
      ).length,
      unchangedRows: validRows.filter(
        (row) => row.action === 'UNCHANGED',
      ).length,
      ignoredRows: rows.filter((row) => row.action === 'IGNORED')
        .length,
      errorRows: rows.filter((row) => row.action === 'ERROR')
        .length,
      activeRows: activeRows.length,
      inactiveRows: inactiveRows.length,
      activeUpdatedThisYear,
      activePendingUpdate:
        activeRows.length - activeUpdatedThisYear,
      inactiveUpdatedThisYear,
      inactivePendingUpdate:
        inactiveRows.length - inactiveUpdatedThisYear,
      withoutDateRows: validRows.filter(
        (row) => !row.filingDate && row.filingYear === null,
      ).length,
      semiannualFollowUpRows: validRows.filter(
        (row) => row.requiresSemiannualFollowUp,
      ).length,
      canConfirm: validRows.length > 0,
    }

    return { rows, summary }
  }
}
