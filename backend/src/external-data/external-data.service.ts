import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common'
import {
  getBusinessToday,
  parseDateOnly,
  toDateOnly,
} from '../common/utils/dates.js'
import { normalizeSemiannualFollowUp } from '../annual-updates/annual-parser.js'
import { ExternalAnnualMapperService } from './external-annual-mapper.service.js'
import { ExternalDataCacheService } from './external-data.cache.service.js'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { ExternalWorkbookReaderService } from './external-workbook-reader.service.js'
import type {
  ExternalAnnualMapping,
  ExternalAnnualRow,
  ExternalDataStatus,
  ExternalImportHeader,
  ExternalDueQuery,
  ExternalDueSummary,
  ExternalListQuery,
  ExternalMeta,
  ExternalPendingActiveReport,
  ExternalReport,
  ExternalReportMetric,
  ExternalSource,
  ExternalSummary,
  ExternalUpdateDueRow,
  ExternalWorkbookData,
  ExternalUpdateSituation,
} from './types.js'

const DAY_IN_MS = 24 * 60 * 60 * 1000

const reportCopy: Record<
  ExternalReportMetric,
  {
    title: (currentYear: number) => string
    subtitle: (count: number, currentYear: number) => string
  }
> = {
  active: {
    title: () => 'Puntos de venta activos',
    subtitle: (count) => `${count} contrapartes activas`,
  },
  inactive: {
    title: () => 'Puntos de venta inactivos',
    subtitle: (count) => `${count} contrapartes inactivas`,
  },
  'updated-this-year': {
    title: (currentYear) => `Actualizados en ${currentYear}`,
    subtitle: (count, currentYear) =>
      `${count} contrapartes actualizadas en ${currentYear}`,
  },
  'pending-active': {
    title: () => 'Pendientes de actualizar (activos)',
    subtitle: (count, currentYear) =>
      `${count} activos · diligenciamiento desde ${currentYear - 1}`,
  },
  'follow-up': {
    title: () => 'Contrapartes en seguimiento',
    subtitle: (count) =>
      `${count} contrapartes con seguimiento semestral`,
  },
  'updates-due': {
    title: () => 'Actualizaciones vencidas y por vencer',
    subtitle: (count) =>
      `${count} contrapartes con vencimiento próximo o vencido`,
  },
}

@Injectable()
export class ExternalDataService implements OnModuleInit {
  private readonly logger = new Logger(ExternalDataService.name)
  private readonly refreshPromises = new Map<
    ExternalSource,
    Promise<ExternalDataStatus>
  >()
  private readonly pendingRefreshes = new Set<ExternalSource>()

  constructor(
    private readonly config: ExternalDataConfigService,
    private readonly cache: ExternalDataCacheService,
    private readonly reader: ExternalWorkbookReaderService,
    private readonly mapper: ExternalAnnualMapperService,
  ) {}

  onModuleInit(): void {
    this.cache.initialize(
      {
        enabled: this.config.enabled,
        configured: this.config.readConfigured,
        webhookConfigured: this.config.webhookConfigured,
        pollMs: this.config.pollMs,
      },
      'arriendos',
    )
    this.cache.initialize(
      {
        enabled: this.config.enabled,
        configured: this.config.colocadoresReadConfigured,
        webhookConfigured: false,
        pollMs: this.config.pollMs,
      },
      'colocadores',
    )
    this.cache.initialize(
      {
        enabled: this.config.enabled,
        configured: this.config.clientesReadConfigured,
        webhookConfigured: false,
        pollMs: this.config.pollMs,
      },
      'clientes',
    )

    if (this.config.enabled && this.config.readConfigured) {
      void this.refresh('inicio', 'arriendos').catch(
        (error: unknown) => {
          this.logger.warn(
            `No se pudo cargar el libro externo al iniciar: ${this.errorMessage(error)}`,
          )
        },
      )
    }

    if (this.config.colocadoresReadConfigured) {
      void this.refresh('inicio', 'colocadores').catch(
        (error: unknown) => {
          this.logger.warn(
            `No se pudo cargar el libro de colocadores al iniciar: ${this.errorMessage(error)}`,
          )
        },
      )
    }

    if (this.config.clientesReadConfigured) {
      void this.refresh('inicio', 'clientes').catch(
        (error: unknown) => {
          this.logger.warn(
            `No se pudo cargar el libro de clientes al iniciar: ${this.errorMessage(error)}`,
          )
        },
      )
    }
  }

  getStatus(source: ExternalSource = 'arriendos'): ExternalDataStatus {
    return this.cache.getStatus(source)
  }

  async refresh(
    reason: string,
    source: ExternalSource = 'arriendos',
  ): Promise<ExternalDataStatus> {
    if (!this.config.enabled) {
      this.cache.setUnconfigured(
        'La integración externa está desactivada',
        source,
      )
      return this.cache.getStatus(source)
    }

    if (!this.isSourceConfigured(source)) {
      this.cache.setUnconfigured(
        this.unconfiguredMessage(source),
        source,
      )
      return this.cache.getStatus(source)
    }

    const inFlight = this.refreshPromises.get(source)

    if (inFlight) {
      this.pendingRefreshes.add(source)
      return inFlight
    }

    const promise = this.doRefresh(reason, source).finally(() => {
      this.refreshPromises.delete(source)

      if (this.pendingRefreshes.has(source)) {
        this.pendingRefreshes.delete(source)
        void this.refresh('cambios pendientes', source).catch(
          (error: unknown) => {
            this.logger.warn(
              `No se pudo aplicar la recarga pendiente: ${this.errorMessage(error)}`,
            )
          },
        )
      }
    })

    this.refreshPromises.set(source, promise)
    return promise
  }

  getSummary(source: ExternalSource = 'arriendos'): ExternalSummary {
    const today = getBusinessToday()
    const currentYear = today.getUTCFullYear()
    const rows = this.serializedRows(currentYear, source)
    const active = rows.filter((row) => row.status === 'ACTIVE')
    const inactive = rows.filter((row) => row.status === 'INACTIVE')
    const updatedThisYear = rows.filter(
      (row) => row.updatedThisYear,
    ).length
    const activeUpdated = active.filter(
      (row) => row.updatedThisYear,
    ).length
    const inactiveUpdated = inactive.filter(
      (row) => row.updatedThisYear,
    ).length
    const activeRecent = active.filter((row) =>
      this.isRecentFiling(row, currentYear),
    )
    const activeRecentUpdated = activeRecent.filter(
      (row) => row.updatedThisYear,
    ).length
    const activeFollowUp = active.filter(
      (row) => row.requiresSemiannualFollowUp === true,
    ).length
    const inactiveFollowUp = inactive.filter(
      (row) => row.requiresSemiannualFollowUp === true,
    ).length

    return {
      businessDate: toDateOnly(today) ?? '',
      currentYear,
      totals: {
        total: rows.length,
        active: active.length,
        inactive: inactive.length,
      },
      annual: {
        updatedThisYear,
        active: {
          total: active.length,
          updatedThisYear: activeUpdated,
          pendingUpdate: activeRecent.length - activeRecentUpdated,
          withoutDate: active.filter(
            (row) => row.annualStatus === 'NO_DATE',
          ).length,
        },
        inactive: {
          total: inactive.length,
          updatedThisYear: inactiveUpdated,
          pendingUpdate: 0,
          withoutDate: inactive.filter(
            (row) => row.annualStatus === 'NO_DATE',
          ).length,
        },
      },
      semiannual: {
        activeWithFollowUp: activeFollowUp,
        inactiveWithFollowUp: inactiveFollowUp,
        totalWithFollowUp: activeFollowUp + inactiveFollowUp,
      },
    }
  }

  getReport(
    metric: ExternalReportMetric,
    source: ExternalSource = 'arriendos',
  ): ExternalReport {
    const today = getBusinessToday()
    const currentYear = today.getUTCFullYear()
    const dueRows = this.serializedRows(currentYear, source).map((row) =>
      this.toDueRow(row, today),
    )
    const minimumDate = new Date(Date.UTC(currentYear - 1, 0, 1))
    let rows: ExternalUpdateDueRow[]

    switch (metric) {
      case 'active':
        rows = dueRows.filter((row) => row.status === 'ACTIVE')
        break
      case 'inactive':
        rows = dueRows.filter((row) => row.status === 'INACTIVE')
        break
      case 'updated-this-year':
        rows = dueRows.filter((row) => row.updatedThisYear)
        break
      case 'pending-active':
        rows = dueRows.filter(
          (row) =>
            row.status === 'ACTIVE' &&
            this.isRecentFiling(row, currentYear) &&
            !row.updatedThisYear,
        )
        break
      case 'follow-up':
        rows = dueRows.filter(
          (row) => row.requiresSemiannualFollowUp === true,
        )
        break
      case 'updates-due':
        rows = dueRows.filter(
          (row) =>
            row.status === 'ACTIVE' &&
            row.filingDate !== null &&
            parseDateOnly(row.filingDate) >= minimumDate &&
            row.situation !== 'NOT_DUE',
        )
        break
    }

    rows.sort(
      (first, second) =>
        (first.dueDate ?? '9999-12-31').localeCompare(
          second.dueDate ?? '9999-12-31',
        ) ||
        first.businessName.localeCompare(second.businessName) ||
        first.code.localeCompare(second.code),
    )

    const copy = reportCopy[metric]

    return {
      metric,
      title: copy.title(currentYear),
      subtitle: copy.subtitle(rows.length, currentYear),
      generatedAt: new Date().toISOString(),
      currentYear,
      rows,
    }
  }

  getPendingActiveReport(
    source: ExternalSource = 'arriendos',
  ): ExternalPendingActiveReport {
    return this.getReport('pending-active', source)
  }

  getAllRows(source: ExternalSource = 'arriendos'): ExternalAnnualRow[] {
    return this.serializedRows(
      getBusinessToday().getUTCFullYear(),
      source,
    )
  }

  getAllColocadoresRows(): ExternalAnnualRow[] {
    return this.getAllRows('colocadores')
  }

  getAllClientesRows(): ExternalAnnualRow[] {
    return this.getAllRows('clientes')
  }

  async getClientesFollowUpRows(): Promise<ExternalAnnualRow[]> {
    const workbook = await this.reader.readWorkbook(
      this.config.clientesWorkbookPath,
      this.config.clientesWorksheetName,
    )
    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    const followUpIndex = workbook.headers.findIndex(
      (header) =>
        normalize(header.label || header.value).startsWith(
          'seguimiento',
        ),
    )
    const filtered = {
      ...workbook,
      rows: workbook.rows.filter(
        (row) =>
          followUpIndex >= 0 &&
          normalizeSemiannualFollowUp(
            row.values[followUpIndex] ?? '',
          ) !== null,
      ),
    }
    const resolved = this.mapper.resolveMapping(
      filtered,
      this.config.rawClientesColumnMap,
    )

    if (resolved.errors.length > 0) {
      throw new Error(resolved.errors.join('. '))
    }

    return this.mapper.mapWorkbook(
      filtered,
      resolved.mapping,
      new Date().toISOString(),
    ).rows
  }

  async getColocadoresFollowUpRows(): Promise<ExternalAnnualRow[]> {
    const workbook = await this.reader.readWorkbook(
      this.config.colocadoresWorkbookPath,
      this.config.colocadoresWorksheetName,
    )
    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    const followUpIndex = workbook.headers.findIndex(
      (header) =>
        normalize(header.label || header.value).startsWith(
          'seguimiento',
        ),
    )
    const filtered = {
      ...workbook,
      rows: workbook.rows.filter(
        (row) =>
          followUpIndex >= 0 &&
          normalizeSemiannualFollowUp(
            row.values[followUpIndex] ?? '',
          ) === true,
      ),
    }
    const prepared = this.prepareColocadoresAnnualWorkbook(filtered)
    const mapping = this.colocadoresAnnualMapping(prepared.headers)

    return this.mapper.mapWorkbook(
      prepared,
      mapping,
      new Date().toISOString(),
    ).rows
  }

  findAll(
    query: ExternalListQuery,
    source: ExternalSource = 'arriendos',
  ) {
    const currentYear = getBusinessToday().getUTCFullYear()
    const code = query.code?.trim().toLowerCase() ?? ''
    const search = query.search?.trim().toLowerCase() ?? ''
    let rows = this.serializedRows(currentYear, source)

    if (code) {
      rows = rows.filter((row) => row.code.toLowerCase() === code)
    }

    if (search) {
      rows = rows.filter(
        (row) =>
          row.code.toLowerCase().includes(search) ||
          row.businessName.toLowerCase().includes(search),
      )
    }

    if (query.status) {
      rows = rows.filter((row) => row.status === query.status)
    }

    if (query.annualStatus) {
      rows = rows.filter(
        (row) => row.annualStatus === query.annualStatus,
      )
    }

    if (typeof query.requiresSemiannualFollowUp === 'boolean') {
      rows = rows.filter(
        (row) =>
          row.requiresSemiannualFollowUp ===
          query.requiresSemiannualFollowUp,
      )
    }

    rows.sort((first, second) => {
      if (first.status !== second.status) {
        return first.status.localeCompare(second.status)
      }
      const nameCompare = first.businessName.localeCompare(
        second.businessName,
      )
      return nameCompare || first.code.localeCompare(second.code)
    })

    return this.paginate(rows, query.page, query.pageSize, source)
  }

  getUpdatesDue(
    query: ExternalDueQuery,
    source: ExternalSource = 'arriendos',
  ) {
    const today = getBusinessToday()
    const currentYear = today.getUTCFullYear()
    const minimumDate = new Date(Date.UTC(currentYear - 1, 0, 1))
    const evaluated = this.serializedRows(currentYear, source)
      .filter(
        (row) =>
          row.status === 'ACTIVE' &&
          row.filingDate &&
          parseDateOnly(row.filingDate) >= minimumDate,
      )
      .map((row) => this.toDueRow(row, today))
      .filter((row) => row.situation !== 'NOT_DUE')
      .sort((first, second) => {
        const firstDays = first.daysUntilDue ?? Number.MAX_SAFE_INTEGER
        const secondDays =
          second.daysUntilDue ?? Number.MAX_SAFE_INTEGER
        return (
          firstDays - secondDays || first.code.localeCompare(second.code)
        )
      })

    const summary: ExternalDueSummary = {
      needsUpdate: evaluated.filter((row) =>
        this.needsUpdate(row.daysUntilDue),
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
    }

    return {
      ...this.paginate(evaluated, query.page, query.pageSize, source),
      summary,
    }
  }

  private async doRefresh(
    reason: string,
    source: ExternalSource,
  ): Promise<ExternalDataStatus> {
    this.cache.setSyncing(source)

    try {
      let workbook: ExternalWorkbookData
      let sourceWorkbook: ExternalWorkbookData
      let resolved: {
        mapping: ExternalAnnualMapping
        errors: string[]
      }

      if (source === 'colocadores') {
        workbook = await this.reader.readWorkbook(
          this.config.colocadoresWorkbookPath,
          this.config.colocadoresWorksheetName,
        )
        sourceWorkbook =
          this.prepareColocadoresAnnualWorkbook(workbook)
        resolved = {
          mapping: this.colocadoresAnnualMapping(
            sourceWorkbook.headers,
          ),
          errors: [],
        }
      } else if (source === 'clientes') {
        workbook = await this.reader.readWorkbook(
          this.config.clientesWorkbookPath,
          this.config.clientesWorksheetName,
        )
        sourceWorkbook = workbook
        resolved = this.mapper.resolveMapping(
          sourceWorkbook,
          this.config.rawClientesColumnMap,
        )
      } else {
        workbook = await this.reader.read()
        sourceWorkbook = workbook
        resolved = this.mapper.resolveMapping(
          sourceWorkbook,
          this.config.rawColumnMap,
        )
      }
      const mapped = this.mapper.mapWorkbook(
        sourceWorkbook,
        resolved.mapping,
        new Date().toISOString(),
      )
      const mappingErrors = [
        ...resolved.errors,
        ...mapped.mappingErrors,
      ]

      if (mappingErrors.length > 0) {
        this.cache.setError(mappingErrors.join('. '), source)
        return this.cache.getStatus(source)
      }

      this.cache.setSuccess({
        rows: mapped.rows,
        mapping: mapped.mapping,
        mappingErrors,
        headers: sourceWorkbook.headers,
        version: workbook.version,
        fileName: workbook.fileName,
        sourceName: workbook.sourceName,
        sourceUrl: workbook.sourceUrl,
        lastModifiedDateTime: workbook.lastModifiedDateTime,
        stats: mapped.stats,
        source,
      })

      this.logger.log(
        `Libro ${source} sincronizado (${reason}): ${mapped.rows.length} registros`,
      )
      return this.cache.getStatus(source)
    } catch (error: unknown) {
      const message = this.errorMessage(error)
      this.cache.setError(message, source)
      this.logger.error(
        `Fallo la sincronización de ${source} (${reason}): ${message}`,
      )
      return this.cache.getStatus(source)
    }
  }

  private serializedRows(
    currentYear: number,
    source: ExternalSource,
  ): ExternalAnnualRow[] {
    const rows = this.cache.getSnapshot(source)?.rows ?? []

    return rows.map((row) => {
      const updatedThisYear = this.updatedInYear(row, currentYear)
      const hasFilingData = Boolean(row.filingDate || row.filingYear)

      return {
        ...row,
        updatedThisYear,
        annualStatus: !hasFilingData
          ? 'NO_DATE'
          : updatedThisYear
            ? 'UPDATED_THIS_YEAR'
            : 'PENDING',
      }
    })
  }

  private updatedInYear(
    row: ExternalAnnualRow,
    currentYear: number,
  ): boolean {
    return (
      row.filingYear === currentYear ||
      (row.filingYear === null &&
        row.filingDate !== null &&
        Number(row.filingDate.slice(0, 4)) === currentYear)
    )
  }

  private isRecentFiling(
    row: ExternalAnnualRow,
    currentYear: number,
  ): boolean {
    if (row.filingYear !== null) {
      return row.filingYear >= currentYear - 1
    }

    if (!row.filingDate) {
      return false
    }

    return parseDateOnly(row.filingDate) >= new Date(Date.UTC(currentYear - 1, 0, 1))
  }

  private toDueRow(
    row: ExternalAnnualRow,
    today: Date,
  ): ExternalUpdateDueRow {
    const filingDate = row.filingDate
      ? parseDateOnly(row.filingDate)
      : null
    const dueDate = filingDate
      ? new Date(
          Date.UTC(
            filingDate.getUTCFullYear() + 1,
            filingDate.getUTCMonth(),
            Math.min(
              filingDate.getUTCDate(),
              new Date(
                Date.UTC(
                  filingDate.getUTCFullYear() + 1,
                  filingDate.getUTCMonth() + 1,
                  0,
                ),
              ).getUTCDate(),
            ),
          ),
        )
      : null
    const days = dueDate
      ? Math.round((dueDate.getTime() - today.getTime()) / DAY_IN_MS)
      : null
    const situation = this.situation(days)

    return {
      ...row,
      dueDate: toDateOnly(dueDate),
      daysUntilDue: days,
      situation,
    }
  }

  private situation(days: number | null): ExternalUpdateSituation {
    if (days === null) {
      return 'WITHOUT_DATE'
    }
    if (days < 0) {
      return 'OVERDUE'
    }
    if (days === 0) {
      return 'DUE_TODAY'
    }
    if (days <= 15) {
      return 'DUE_SOON'
    }
    return 'NOT_DUE'
  }

  private needsUpdate(days: number | null): boolean {
    return days === null || days <= 0
  }

  private paginate<T>(
    rows: T[],
    page: number,
    pageSize: number,
    source: ExternalSource,
  ): {
    data: T[]
    meta: ExternalMeta
    status: ExternalDataStatus
  } {
    const total = rows.length

    return {
      data: rows.slice((page - 1) * pageSize, page * pageSize),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      status: this.cache.getStatus(source),
    }
  }

  private isSourceConfigured(source: ExternalSource): boolean {
    if (source === 'colocadores') {
      return this.config.colocadoresReadConfigured
    }

    if (source === 'clientes') {
      return this.config.clientesReadConfigured
    }

    return this.config.readConfigured
  }

  private unconfiguredMessage(source: ExternalSource): string {
    if (source === 'colocadores') {
      return 'Falta EXTERNAL_COLOCADORES_WORKBOOK_PATH para leer FR-SG-81'
    }

    if (source === 'clientes') {
      return 'Falta EXTERNAL_CLIENTES_WORKBOOK_PATH para leer FR-SG-80'
    }

    return this.config.source === 'file'
      ? 'Falta EXTERNAL_WORKBOOK_PATH para la fuente local'
      : 'Faltan credenciales o identificadores de Microsoft Graph'
  }

  private prepareColocadoresAnnualWorkbook(
    workbook: ExternalWorkbookData,
  ): ExternalWorkbookData {
    return {
      ...workbook,
      headers: [
        ...workbook.headers,
        { value: '__annual_status', label: 'Estado anual' },
      ],
      rows: workbook.rows.map((row) => ({
        ...row,
        values: [...row.values, 'A'],
      })),
    }
  }

  private colocadoresAnnualMapping(
    headers: ExternalImportHeader[],
  ): ExternalAnnualMapping {
    const find = (...aliases: string[]): string | null => {
      for (const alias of aliases) {
        const header = headers.find(
          (item) =>
            item.value === alias ||
            item.label.trim().toLowerCase() === alias,
        )
        if (header) {
          return header.value
        }
      }
      return null
    }
    const document = find('numero de documento', 'nit')
    const followUp = find('seguimiento si no', 'seguimiento')
    const filingDate = find(
      'fecha debida diligencia',
      'fecha de debida diligencia',
    )
    const observations = find('observaciones', 'observacion')

    return {
      code: document,
      nit: document,
      businessName: find('nombres y apellidos', 'nombre', 'razon social'),
      status: find('__annual_status', 'estado anual'),
      filingDate,
      filingYear: null,
      dueDiligenceType: find('categoria', 'categoria de la contraparte'),
      requiresSemiannualFollowUp: followUp,
      observations,
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message
    }
    return 'Error desconocido al sincronizar el libro externo'
  }
}
