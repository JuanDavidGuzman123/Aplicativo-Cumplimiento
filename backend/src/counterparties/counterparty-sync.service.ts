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
import { ExternalDataService } from '../external-data/external-data.service.js'
import type { ExternalAnnualRow } from '../external-data/types.js'
import { PrismaService } from '../prisma/prisma.service.js'

export type CounterpartySyncResult = {
  sourceRows: number
  followUpRows: number
  created: number
  alreadyExisting: number
  skippedInvalid: number
}

export type ArriendosSyncResult = CounterpartySyncResult

type SyncSourceRow = Pick<
  ExternalAnnualRow,
  'nit' | 'businessName' | 'filingDate' | 'status' | 'observations'
>

type SyncOptions = {
  action: string
  categoryKey: string
  rows: SyncSourceRow[]
  sourceName: string
  sourceRows: number
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
      .filter((row) => row.requiresSemiannualFollowUp === true)

    return this.syncRows(actorId, {
      action: 'SYNC_ARRIENDOS_COUNTERPARTIES',
      categoryKey: 'ARRIENDOS',
      rows,
      sourceName: 'FR-SG-79',
      sourceRows: status.rowCount,
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
      const candidate = this.toCandidate(row, options.sourceName)

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
      select: { nitNormalized: true },
    })
    const existingNits = new Set(
      existing.map((entry) => entry.nitNormalized),
    )
    const toCreate = [...candidates.values()].filter(
      (candidate) => !existingNits.has(candidate.nitNormalized),
    )

    const result = await this.prisma.counterparty.createMany({
      data: toCreate.map((candidate) => ({
        ...candidate,
        categoryId,
        subprocessId: subprocess.id,
      })),
      skipDuplicates: true,
    })

    const summary: CounterpartySyncResult = {
      sourceRows: options.sourceRows,
      followUpRows: options.rows.length,
      created: result.count,
      alreadyExisting: existingNits.size,
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

    return {
      nit,
      nitNormalized,
      businessName: row.businessName.trim(),
      observations: row.observations?.trim() || null,
      status:
        row.status === 'ACTIVE'
          ? CounterpartyStatus.ACTIVE
          : CounterpartyStatus.ARCHIVED,
      registrationDate: filingDate,
      lastFollowUpDate: filingDate,
      nextFollowUpDate: addMonths(filingDate, 6),
      archiveReason:
        row.status === 'INACTIVE'
          ? `Registrado como inactivo en ${sourceName}`
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
