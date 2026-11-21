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
import { ExternalAnnualMapperService } from './external-annual-mapper.service.js'
import { ExternalDataCacheService } from './external-data.cache.service.js'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { ExternalWorkbookReaderService } from './external-workbook-reader.service.js'
import type {
  ExternalAnnualRow,
  ExternalDataStatus,
  ExternalDueQuery,
  ExternalDueSummary,
  ExternalListQuery,
  ExternalMeta,
  ExternalPendingActiveReport,
  ExternalReminderType,
  ExternalReport,
  ExternalReportMetric,
  ExternalSummary,
  ExternalUpdateDueRow,
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
  'pending-inactive': {
    title: () => 'Pendientes de actualizar (inactivos)',
    subtitle: (count, currentYear) =>
      `${count} inactivos · sin actualización en ${currentYear}`,
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
  private refreshPromise: Promise<ExternalDataStatus> | null = null
  private pendingRefresh = false

  constructor(
    private readonly config: ExternalDataConfigService,
    private readonly cache: ExternalDataCacheService,
    private readonly reader: ExternalWorkbookReaderService,
    private readonly mapper: ExternalAnnualMapperService,
  ) {}

  onModuleInit(): void {
    this.cache.initialize({
      enabled: this.config.enabled,
      configured: this.config.readConfigured,
      webhookConfigured: this.config.webhookConfigured,
      pollMs: this.config.pollMs,
    })

    if (this.config.enabled && this.config.readConfigured) {
      void this.refresh('inicio').catch((error: unknown) => {
        this.logger.warn(
          `No se pudo cargar el libro externo al iniciar: ${this.errorMessage(error)}`,
        )
      })
    }
  }

  getStatus(): ExternalDataStatus {
    return this.cache.getStatus()
  }

  async refresh(reason: string): Promise<ExternalDataStatus> {
    if (!this.config.enabled) {
      this.cache.setUnconfigured('La integración externa está desactivada')
      return this.cache.getStatus()
    }

    if (!this.config.readConfigured) {
      this.cache.setUnconfigured(
        this.config.source === 'file'
          ? 'Falta EXTERNAL_WORKBOOK_PATH para la fuente local'
          : 'Faltan credenciales o identificadores de Microsoft Graph',
      )
      return this.cache.getStatus()
    }

    if (this.refreshPromise) {
      this.pendingRefresh = true
      return this.refreshPromise
    }

    this.refreshPromise = this.doRefresh(reason).finally(() => {
      this.refreshPromise = null

      if (this.pendingRefresh) {
        this.pendingRefresh = false
        void this.refresh('cambios pendientes').catch(
          (error: unknown) => {
            this.logger.warn(
              `No se pudo aplicar la recarga pendiente: ${this.errorMessage(error)}`,
            )
          },
        )
      }
    })

    return this.refreshPromise
  }

  getSummary(): ExternalSummary {
    const today = getBusinessToday()
    const currentYear = today.getUTCFullYear()
    const rows = this.serializedRows(currentYear)
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
          pendingUpdate: inactive.length - inactiveUpdated,
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

  getReport(metric: ExternalReportMetric): ExternalReport {
    const today = getBusinessToday()
    const currentYear = today.getUTCFullYear()
    const dueRows = this.serializedRows(currentYear).map((row) =>
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
      case 'pending-inactive':
        rows = dueRows.filter(
          (row) =>
            row.status === 'INACTIVE' && !row.updatedThisYear,
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

  getPendingActiveReport(): ExternalPendingActiveReport {
    return this.getReport('pending-active')
  }

  findAll(query: ExternalListQuery) {
    const currentYear = getBusinessToday().getUTCFullYear()
    const code = query.code?.trim().toLowerCase() ?? ''
    const search = query.search?.trim().toLowerCase() ?? ''
    let rows = this.serializedRows(currentYear)

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

    return this.paginate(rows, query.page, query.pageSize)
  }

  getUpdatesDue(query: ExternalDueQuery) {
    const today = getBusinessToday()
    const currentYear = today.getUTCFullYear()
    const minimumDate = new Date(Date.UTC(currentYear - 1, 0, 1))
    const evaluated = this.serializedRows(currentYear)
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
      ...this.paginate(evaluated, query.page, query.pageSize),
      summary,
    }
  }

  private async doRefresh(reason: string): Promise<ExternalDataStatus> {
    this.cache.setSyncing()

    try {
      const workbook = await this.reader.read()
      const resolved = this.mapper.resolveMapping(
        workbook,
        this.config.rawColumnMap,
      )
      const mapped = this.mapper.mapWorkbook(
        workbook,
        resolved.mapping,
        new Date().toISOString(),
      )
      const mappingErrors = [
        ...resolved.errors,
        ...mapped.mappingErrors,
      ]

      if (mappingErrors.length > 0) {
        this.cache.setError(mappingErrors.join('. '))
        return this.cache.getStatus()
      }

      this.cache.setSuccess({
        rows: mapped.rows,
        mapping: mapped.mapping,
        mappingErrors,
        headers: workbook.headers,
        version: workbook.version,
        fileName: workbook.fileName,
        sourceName: workbook.sourceName,
        sourceUrl: workbook.sourceUrl,
        lastModifiedDateTime: workbook.lastModifiedDateTime,
        stats: mapped.stats,
      })

      this.logger.log(
        `Libro externo sincronizado (${reason}): ${mapped.rows.length} registros`,
      )
      return this.cache.getStatus()
    } catch (error: unknown) {
      const message = this.errorMessage(error)
      this.cache.setError(message)
      this.logger.error(
        `Fallo la sincronización externa (${reason}): ${message}`,
      )
      return this.cache.getStatus()
    }
  }

  private serializedRows(currentYear: number): ExternalAnnualRow[] {
    const rows = this.cache.getSnapshot()?.rows ?? []

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
    const reminderType = this.reminderType(days)

    return {
      ...row,
      dueDate: toDateOnly(dueDate),
      daysUntilDue: days,
      situation,
      reminderType,
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

  private reminderType(days: number | null): ExternalReminderType | null {
    if (days === null || days > 3 || days < 0) {
      return null
    }
    if (days > 1) {
      return 'ANNUAL_D3'
    }
    return 'ANNUAL_D1'
  }

  private needsUpdate(days: number | null): boolean {
    return days === null || days <= 0
  }

  private paginate<T>(
    rows: T[],
    page: number,
    pageSize: number,
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
      status: this.cache.getStatus(),
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message
    }
    return 'Error desconocido al sincronizar el libro externo'
  }
}
