import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { CounterpartyStatus, RiskDecision } from '@prisma/client'
import {
  calculateCalendarStatus,
  type CalendarStatus,
} from '../common/utils/calendar-status.js'
import { addMonths, getBusinessToday } from '../common/utils/dates.js'
import { normalizeNit } from '../common/utils/nit.js'
import type { ListCounterpartiesQueryDto } from '../counterparties/dto/list-counterparties-query.dto.js'
import type { EvaluateRiskDto } from '../counterparties/dto/risk-evaluation.dto.js'
import type { ReactivateCounterpartyDto } from '../counterparties/dto/counterparty-action.dto.js'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { ExternalWorkbookReaderService } from './external-workbook-reader.service.js'
import {
  ColocadoresWorkbookWriterService,
} from './colocadores-workbook.writer.service.js'
import {
  decisionFrom,
  indexesFrom,
  normalizeCell,
  normalizeDate,
  statusFrom,
  uuidFromRowNumber,
  type ColocadoresPrepareResult,
  type FieldKey,
  type HeaderIndexes,
  type WorkbookField,
} from './colocadores-workbook.util.js'
import type {
  ExternalImportHeader,
  ExternalWorkbookRow,
} from './types.js'

export const COLOCADORES_CATEGORY_KEY = 'COLOCADORES_INDEPENDIENTES'

const CATEGORY = {
  id: '22222222-2222-4222-8222-222222222222',
  key: COLOCADORES_CATEGORY_KEY,
  name: 'Colocadores independientes',
}

const SUBPROCESS = {
  id: 'd8f5d4b7-aceb-4d5a-bb10-5d25740f97b2',
  name: 'Debida diligencia',
  active: true,
}

type Overlay = Partial<Record<WorkbookField, string>>

type ColocadoresRow = {
  id: string
  rowNumber: number
  nit: string
  businessName: string
  registrationDate: string
  lastFollowUpDate: string
  nextFollowUpDate: string
  status: CounterpartyStatus
  decision: RiskDecision | null
  observations: string | null
  archivedAt: string | null
}

@Injectable()
export class ColocadoresWorkbookService {
  private readonly overlay = new Map<string, Overlay>()

  constructor(
    private readonly config: ExternalDataConfigService,
    private readonly reader: ExternalWorkbookReaderService,
    private readonly writer: ColocadoresWorkbookWriterService,
  ) {}

  async prepareWorkbook(): Promise<ColocadoresPrepareResult> {
    if (!this.config.colocadoresReadConfigured) {
      throw new ServiceUnavailableException(
        'El libro FR-SG-81 no está configurado',
      )
    }

    return this.writer.prepare(
      this.config.colocadoresWorkbookPath,
      this.config.colocadoresWorksheetName,
    )
  }

  async has(id: string): Promise<boolean> {
    if (!this.config.colocadoresReadConfigured) {
      return false
    }

    return (await this.getRows()).some((row) => row.id === id)
  }

  async list(query: ListCounterpartiesQueryDto) {
    let rows = await this.getRows()

    if (query.status) {
      rows = rows.filter((row) => row.status === query.status)
    }

    if (query.calendarStatus) {
      rows = rows.filter(
        (row) => this.calendarStatus(row) === query.calendarStatus,
      )
    }

    if (
      query.subprocessId &&
      query.subprocessId !== SUBPROCESS.id
    ) {
      rows = []
    }

    const search = query.search?.trim()
    if (search) {
      const normalized = normalizeNit(search).toLowerCase()
      rows = rows.filter(
        (row) =>
          row.businessName.toLowerCase().includes(search.toLowerCase()) ||
          row.nit.toLowerCase().includes(search.toLowerCase()) ||
          (Boolean(normalized) && normalizeNit(row.nit).includes(normalized)),
      )
    }

    rows.sort((left, right) =>
      left.businessName.localeCompare(right.businessName, 'es'),
    )

    const total = rows.length
    const start = (query.page - 1) * query.pageSize

    return {
      data: rows.slice(start, start + query.pageSize).map((row) => this.serialize(row)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    }
  }

  async counts() {
    const rows = await this.getRows()

    return {
      active: rows.filter(
        (row) => row.status === CounterpartyStatus.ACTIVE,
      ).length,
      archived: rows.filter(
        (row) => row.status === CounterpartyStatus.ARCHIVED,
      ).length,
    }
  }

  async findOne(id: string) {
    const row = await this.findRow(id)
    const evaluatedAt = row.lastFollowUpDate || row.registrationDate
    const evaluations =
      row.decision || row.lastFollowUpDate !== row.registrationDate
        ? [
            {
              id: `${row.id}-evaluation`,
              decision: row.decision ?? RiskDecision.CONTINUE,
              evaluatedAt,
              nextFollowUpDate: row.status === CounterpartyStatus.ARCHIVED
                ? null
                : row.nextFollowUpDate,
              notes: row.observations,
              createdAt: `${evaluatedAt}T00:00:00.000Z`,
              createdBy: {
                id: 'sistema',
                name: 'Sistema',
              },
            },
          ]
        : []

    return {
      ...this.serialize(row),
      archivedAt: row.archivedAt ? `${row.archivedAt}T00:00:00.000Z` : null,
      archiveReason: row.status === CounterpartyStatus.ARCHIVED
        ? row.observations
        : null,
      archivedBy: null,
      reactivatedAt: null,
      reactivationReason: null,
      reactivatedBy: null,
      createdAt: `${row.registrationDate}T00:00:00.000Z`,
      updatedAt: `${evaluatedAt}T00:00:00.000Z`,
      followUpCount: 0,
      riskEvaluations: evaluations,
    }
  }

  async evaluateRisk(id: string, dto: EvaluateRiskDto, _actorId: string) {
    const row = await this.findRow(id)

    if (row.status === CounterpartyStatus.ARCHIVED) {
      throw new BadRequestException(
        'La contraparte está archivada; debe reactivarla antes de evaluarla',
      )
    }

    const today = getBusinessToday()
    const evaluatedAt = dto.evaluatedAt
      ? normalizeDate(dto.evaluatedAt)
      : today.toISOString().slice(0, 10)

    if (!evaluatedAt) {
      throw new BadRequestException('La fecha de evaluación no es válida')
    }

    if (evaluatedAt > today.toISOString().slice(0, 10)) {
      throw new BadRequestException(
        'La fecha de evaluación no puede ser futura',
      )
    }

    const nextFollowUpDate =
      dto.decision === RiskDecision.CONTINUE
        ? addMonths(new Date(`${evaluatedAt}T00:00:00Z`), 6)
            .toISOString()
            .slice(0, 10)
        : ''

    await this.writeFields(id, {
      status:
        dto.decision === RiskDecision.CONTINUE ? 'ACTIVE' : 'ARCHIVED',
      decision: dto.decision,
      lastEvaluation: evaluatedAt,
      nextFollowUp: nextFollowUpDate,
      archivedAt:
        dto.decision === RiskDecision.ARCHIVE
          ? today.toISOString().slice(0, 10)
          : '',
      observations: dto.notes ?? '',
    })

    return this.findOne(id)
  }

  async reactivate(
    id: string,
    dto: ReactivateCounterpartyDto,
    _actorId: string,
  ) {
    const row = await this.findRow(id)

    if (row.status === CounterpartyStatus.ACTIVE) {
      throw new BadRequestException('La contraparte ya está activa')
    }

    const today = getBusinessToday().toISOString().slice(0, 10)
    const requestedDate = dto.nextFollowUpDate
      ? normalizeDate(dto.nextFollowUpDate)
      : null
    const nextFollowUpDate =
      requestedDate ??
      addMonths(new Date(`${today}T00:00:00Z`), 6).toISOString().slice(0, 10)

    await this.writeFields(id, {
      status: 'ACTIVE',
      decision: RiskDecision.REACTIVATE,
      lastEvaluation: today,
      nextFollowUp: nextFollowUpDate,
      archivedAt: '',
      observations: dto.reason,
    })

    return this.findOne(id)
  }

  private async findRow(id: string): Promise<ColocadoresRow> {
    const row = (await this.getRows()).find((item) => item.id === id)

    if (!row) {
      throw new NotFoundException('Contraparte no encontrada')
    }

    return row
  }

  private async getRows(): Promise<(ColocadoresRow & { followUpRaw: string })[]> {
    if (!this.config.colocadoresReadConfigured) {
      throw new ServiceUnavailableException(
        'El libro FR-SG-81 no está configurado',
      )
    }

    const workbook = await this.reader.readWorkbook(
      this.config.colocadoresWorkbookPath,
      this.config.colocadoresWorksheetName,
    )
    const indexes = indexesFrom(workbook.headers)

    return workbook.rows
      .filter((row) => {
        const followUp = this.valueFrom(row, workbook.headers, indexes, 'followUp')
        return normalizeCell(followUp).toLowerCase() === 'si'
      })
      .map((row) => {
        const id =
          normalizeCell(this.valueFrom(row, workbook.headers, indexes, 'id')) ||
          uuidFromRowNumber(row.rowNumber)
        const patch = this.overlay.get(id) ?? {}
        const raw = (field: FieldKey): unknown =>
          (patch as Record<string, string | undefined>)[field] ??
          this.valueFrom(row, workbook.headers, indexes, field)
        const registrationDate =
          normalizeDate(raw('registrationDate')) ??
          new Date().toISOString().slice(0, 10)
        const status = statusFrom(raw('status'))
        const lastEvaluation = normalizeDate(raw('lastEvaluation'))
        const nextFollowUp = normalizeDate(raw('nextFollowUp'))
        const archivedAt = normalizeDate(raw('archivedAt'))
        const observations = normalizeCell(raw('observations'))
        const decision = decisionFrom(
          raw('decision'),
          status,
          Boolean(lastEvaluation),
        )

        return {
          id,
          rowNumber: row.rowNumber,
          nit: normalizeCell(raw('document')),
          businessName: normalizeCell(raw('name')),
          registrationDate,
          lastFollowUpDate: lastEvaluation ?? registrationDate,
          nextFollowUpDate:
            nextFollowUp ??
            addMonths(new Date(`${registrationDate}T00:00:00Z`), 6)
              .toISOString()
              .slice(0, 10),
          status,
          decision,
          observations: observations || null,
          archivedAt,
          followUpRaw: normalizeCell(
            this.valueFrom(row, workbook.headers, indexes, 'followUp'),
          ),
        }
      })
  }

  private async writeFields(
    id: string,
    fields: Partial<Record<WorkbookField, string>>,
  ): Promise<void> {
    await this.writer.writeFields(
      this.config.colocadoresWorkbookPath,
      this.config.colocadoresWorksheetName,
      id,
      fields,
    )

    const previous = this.overlay.get(id)
    this.overlay.set(id, {
      ...previous,
      ...fields,
    })
  }

  private valueFrom(
    row: ExternalWorkbookRow,
    headers: ExternalImportHeader[],
    indexes: HeaderIndexes,
    field: FieldKey,
  ): unknown {
    const index = indexes[field]

    return index === undefined || index >= row.values.length
      ? ''
      : row.values[index]
  }

  private calendarStatus(row: ColocadoresRow): CalendarStatus {
    return calculateCalendarStatus(
      new Date(`${row.nextFollowUpDate}T00:00:00Z`),
    )
  }

  private serialize(row: ColocadoresRow) {
    return {
      id: row.id,
      nit: row.nit,
      businessName: row.businessName,
      status: row.status,
      registrationDate: row.registrationDate,
      lastFollowUpDate: row.lastFollowUpDate,
      nextFollowUpDate: row.nextFollowUpDate,
      calendarStatus: this.calendarStatus(row),
      evaluated:
        row.decision !== null || row.lastFollowUpDate !== row.registrationDate,
      observations: row.observations,
      category: CATEGORY,
      subprocess: SUBPROCESS,
    }
  }
}
