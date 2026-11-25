import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  CounterpartyStatus,
  Prisma,
} from '@prisma/client'
import { AuditService } from '../audit/audit.service.js'
import { CategoriesService } from '../categories/categories.service.js'
import {
  addMonths,
  getBusinessToday,
  parseDateOnly,
} from '../common/utils/dates.js'
import { NIT_PATTERN, normalizeNit } from '../common/utils/nit.js'
import { uuidFromDocument } from '../external-data/colocadores-workbook.util.js'
import {
  COLOCADORES_CATEGORY_KEY,
} from '../external-data/colocadores-workbook.service.js'
import {
  CLIENTES_CATEGORY_KEY,
} from '../external-data/clientes-workbook.service.js'
import {
  PROVEEDORES_CATEGORY_KEY,
  PROVEEDORES_WORKBOOK_LABEL,
} from '../external-data/proveedores-workbook.service.js'
import { ExternalDataService } from '../external-data/external-data.service.js'
import type { ExternalAnnualRow } from '../external-data/types.js'
import { PrismaService } from '../prisma/prisma.service.js'

export type CounterpartySyncResult = {
  sourceRows: number
  followUpRows: number
  created: number
  updated: number
  alreadyExisting: number
  skippedInvalid: number
}

export type ArriendosSyncResult = CounterpartySyncResult

type SyncSourceRow = Pick<
  ExternalAnnualRow,
  | 'nit'
  | 'businessName'
  | 'filingDate'
  | 'status'
  | 'observations'
  | 'requiresSemiannualFollowUp'
>

type SyncOptions = {
  action: string
  categoryKey: string
  rows: SyncSourceRow[]
  sourceName: string
  sourceRows: number
  followUpRows: number
  preserveWorkbookIds?: boolean
  workbookIdPrefix?: string
}

const DEFAULT_SUBPROCESS_NAME = 'Debida diligencia'

@Injectable()
export class CounterpartySyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly externalData: ExternalDataService,
    private readonly categories: CategoriesService,
    private readonly audit: AuditService,
  ) {}

  async syncArriendos(
    actorId: string,
  ): Promise<CounterpartySyncResult> {
    const status = await this.externalData.refresh(
      'sincronización de contrapartes de Arriendos',
    )

    if (status.rowCount === 0) {
      throw new ServiceUnavailableException(
        'El libro FR-SG-79 no está disponible en este momento',
      )
    }

    const rows = this.externalData
      .getAllRows()
      .filter((row) => row.requiresSemiannualFollowUp !== null)
    const followUpRows = rows.length

    return this.syncRows(actorId, {
      action: 'SYNC_ARRIENDOS_COUNTERPARTIES',
      categoryKey: 'ARRIENDOS',
      rows,
      sourceName: 'FR-SG-79',
      sourceRows: status.rowCount,
      followUpRows,
    })
  }

  async syncColocadores(
    actorId: string,
  ): Promise<CounterpartySyncResult> {
    const status = await this.externalData.refresh(
      'sincronización de contrapartes de Colocadores',
      'colocadores',
    )

    if (status.rowCount === 0) {
      throw new ServiceUnavailableException(
        'El libro FR-SG-81 no está disponible en este momento',
      )
    }

    const rows = this.externalData
      .getAllColocadoresRows()
      .filter((row) => row.requiresSemiannualFollowUp !== null)
      .map((row): ExternalAnnualRow => ({
        ...row,
        status:
          row.requiresSemiannualFollowUp === true
            ? 'ACTIVE'
            : 'INACTIVE',
      }))
    const followUpRows = rows.length

    return this.syncRows(actorId, {
      action: 'SYNC_COLOCADORES_COUNTERPARTIES',
      categoryKey: COLOCADORES_CATEGORY_KEY,
      rows,
      sourceName: 'FR-SG-81',
      sourceRows: status.rowCount,
      followUpRows,
      preserveWorkbookIds: true,
    })
  }

  async syncClientes(
    actorId: string,
  ): Promise<CounterpartySyncResult> {
    const status = await this.externalData.refresh(
      'sincronización de contrapartes de Clientes',
      'clientes',
    )

    if (status.rowCount === 0) {
      throw new ServiceUnavailableException(
        'El libro FR-SG-80 no está disponible en este momento',
      )
    }

    const rows = (
      await this.externalData.getClientesFollowUpRows()
    ).filter((row) => row.requiresSemiannualFollowUp !== null)
    const followUpRows = rows.length

    return this.syncRows(actorId, {
      action: 'SYNC_CLIENTES_COUNTERPARTIES',
      categoryKey: CLIENTES_CATEGORY_KEY,
      rows,
      sourceName: 'FR-SG-80',
      sourceRows: status.rowCount,
      followUpRows,
      preserveWorkbookIds: true,
      workbookIdPrefix: 'clientes-fr-sg-80',
    })
  }

  async syncProveedores(
    actorId: string,
  ): Promise<CounterpartySyncResult> {
    const status = await this.externalData.refresh(
      'sincronización de contrapartes de Proveedores',
      'proveedores',
    )

    if (status.rowCount === 0) {
      throw new ServiceUnavailableException(
        'El libro FR-SG-83 no está disponible en este momento',
      )
    }

    const rows = this.externalData
      .getAllProveedoresRows()
      .filter((row) => row.requiresSemiannualFollowUp !== null)
    const followUpRows = rows.length

    return this.syncRows(actorId, {
      action: 'SYNC_PROVEEDORES_COUNTERPARTIES',
      categoryKey: PROVEEDORES_CATEGORY_KEY,
      rows,
      sourceName: PROVEEDORES_WORKBOOK_LABEL,
      sourceRows: status.rowCount,
      followUpRows,
    })
  }

  private async syncRows(
    actorId: string,
    options: SyncOptions,
  ): Promise<CounterpartySyncResult> {
    const candidates = new Map<
      string,
      Omit<
        Prisma.CounterpartyCreateManyInput,
        'categoryId' | 'subprocessId'
      >
    >()
    let skippedInvalid = 0

    for (const row of options.rows) {
      const candidate = this.toCandidate(
        row,
        options.sourceName,
        options.preserveWorkbookIds,
        options.workbookIdPrefix,
      )

      if (!candidate) {
        skippedInvalid += 1
        continue
      }

      if (!candidates.has(candidate.nitNormalized)) {
        candidates.set(candidate.nitNormalized, candidate)
      }
    }

    const [categoryId, subprocess] = await Promise.all([
      this.categories.resolveId(options.categoryKey),
      this.ensureDefaultSubprocess(),
    ])
    const nits = [...candidates.keys()]
    const existing = await this.prisma.counterparty.findMany({
      where: { nitNormalized: { in: nits } },
      select: {
        id: true,
        nitNormalized: true,
        status: true,
        archivedAt: true,
        archivedById: true,
        reactivatedAt: true,
        reactivationReason: true,
        riskEvaluations: { select: { id: true }, take: 1 },
      },
    })
    const existingByNit = new Map(
      existing.map((entry) => [entry.nitNormalized, entry]),
    )
    const toCreate = [...candidates.values()].filter(
      (candidate) => !existingByNit.has(candidate.nitNormalized),
    )
    const toUpdate = [...candidates.values()].filter((candidate) =>
      existingByNit.has(candidate.nitNormalized),
    )

    const operations: Prisma.PrismaPromise<unknown>[] = []

    if (toCreate.length > 0) {
      operations.push(
        this.prisma.counterparty.createMany({
          data: toCreate.map((candidate) => ({
            ...candidate,
            categoryId,
            subprocessId: subprocess.id,
          })),
          skipDuplicates: true,
        }),
      )
    }

    for (const candidate of toUpdate) {
      const current = existingByNit.get(candidate.nitNormalized)!
      const hasEvaluation = current.riskEvaluations.length > 0
      const active = candidate.status === CounterpartyStatus.ACTIVE

      operations.push(
        this.prisma.counterparty.update({
          where: { id: current.id },
          data: {
            nit: candidate.nit,
            businessName: candidate.businessName,
            observations: candidate.observations,
            status: candidate.status,
            registrationDate: candidate.registrationDate,
            lastFollowUpDate: candidate.lastFollowUpDate,
            ...(hasEvaluation && candidate.nextFollowUpDate
              ? {}
              : { nextFollowUpDate: candidate.nextFollowUpDate }),
            ...(active
              ? {
                  archivedAt: null,
                  archivedById: null,
                  archiveReason: null,
                  ...(current.status === CounterpartyStatus.ARCHIVED
                    ? {
                        reactivatedAt: new Date(),
                        reactivationReason:
                          'Reactivado desde el libro externo',
                      }
                    : {}),
                }
              : {
                  archivedAt: current.archivedAt ?? new Date(),
                  archivedById: current.archivedById ?? actorId,
                  archiveReason: candidate.archiveReason,
                }),
          },
        }),
      )
    }

    if (operations.length > 0) {
      await this.prisma.$transaction(operations)
    }

    const summary: CounterpartySyncResult = {
      sourceRows: options.sourceRows,
      followUpRows: options.followUpRows,
      created: toCreate.length,
      updated: toUpdate.length,
      alreadyExisting: existingByNit.size,
      skippedInvalid,
    }

    await this.audit.record({
      userId: actorId,
      action: options.action,
      entity: 'Counterparty',
      details: summary,
    })

    return summary
  }

  private toCandidate(
    row: SyncSourceRow,
    sourceName: string,
    preserveWorkbookIds = false,
    workbookIdPrefix?: string,
  ): Omit<
    Prisma.CounterpartyCreateManyInput,
    'categoryId' | 'subprocessId'
  > | null {
    const nit = row.nit?.trim() ?? ''
    const nitNormalized = normalizeNit(nit)

    if (!NIT_PATTERN.test(nit) || !row.businessName.trim()) {
      return null
    }

    const filingDate = row.filingDate
      ? parseDateOnly(row.filingDate)
      : getBusinessToday()
    const requiresFollowUp =
      row.requiresSemiannualFollowUp === true
    const status =
      row.status === 'ACTIVE' && requiresFollowUp
        ? CounterpartyStatus.ACTIVE
        : CounterpartyStatus.ARCHIVED

    return {
      ...(preserveWorkbookIds
        ? {
            id: uuidFromDocument(
              nit,
              workbookIdPrefix ?? 'colocadores-fr-sg-81',
            ),
          }
        : {}),
      nit,
      nitNormalized,
      businessName: row.businessName.trim(),
      observations: row.observations?.trim() || null,
      status,
      registrationDate: filingDate,
      lastFollowUpDate: filingDate,
      nextFollowUpDate: requiresFollowUp
        ? addMonths(filingDate, 6)
        : null,
      archiveReason:
        status === CounterpartyStatus.ARCHIVED
          ? `Registrado sin seguimiento semestral en ${sourceName}`
          : null,
    }
  }

  private async ensureDefaultSubprocess() {
    return this.prisma.subprocess.upsert({
      where: { name: DEFAULT_SUBPROCESS_NAME },
      update: { active: true },
      create: {
        name: DEFAULT_SUBPROCESS_NAME,
        description: 'Subproceso predeterminado de contrapartes',
        active: true,
      },
      select: { id: true },
    })
  }
}
