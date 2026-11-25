import { Injectable, Logger } from '@nestjs/common'
import { AnnualStatus } from '@prisma/client'
import { AuditService } from '../audit/audit.service.js'
import { parseDateOnly } from '../common/utils/dates.js'
import { ExternalDataService } from '../external-data/external-data.service.js'
import type { ExternalAnnualRow } from '../external-data/types.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { normalizeAnnualCode } from './annual-parser.js'
import { ANNUAL_SOURCES, type AnnualSource } from './annual-sources.js'

export type AnnualExternalSyncResult = {
  source: AnnualSource
  sourceRows: number
  created: number
  updated: number
  unchanged: number
  skipped: number
  fileName: string | null
  error: string | null
}

export type AnnualExternalSyncAllResult = {
  sources: AnnualExternalSyncResult[]
  created: number
  updated: number
  unchanged: number
  skipped: number
}

type AnnualCounterpartyData = {
  source: AnnualSource
  code: string
  codeNormalized: string
  businessName: string
  status: AnnualStatus
  requiresSemiannualFollowUp: boolean | null
  filingDate: Date | null
  filingYear: number | null
  dueDiligenceType: string | null
  observations: string | null
  sourceFileName: string | null
}

type ExistingAnnualCounterparty = {
  code: string
  businessName: string
  status: AnnualStatus
  requiresSemiannualFollowUp: boolean | null
  filingDate: Date | null
  filingYear: number | null
  dueDiligenceType: string | null
  observations: string | null
  sourceFileName: string | null
}

function sameData(
  existing: ExistingAnnualCounterparty,
  candidate: AnnualCounterpartyData,
): boolean {
  return (
    existing.code === candidate.code &&
    existing.businessName === candidate.businessName &&
    existing.status === candidate.status &&
    existing.requiresSemiannualFollowUp ===
      candidate.requiresSemiannualFollowUp &&
    existing.filingDate?.getTime() === candidate.filingDate?.getTime() &&
    existing.filingYear === candidate.filingYear &&
    existing.dueDiligenceType === candidate.dueDiligenceType &&
    existing.observations === candidate.observations &&
    existing.sourceFileName === candidate.sourceFileName
  )
}

function emptyResult(source: AnnualSource): AnnualExternalSyncResult {
  return {
    source,
    sourceRows: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    fileName: null,
    error: null,
  }
}

@Injectable()
export class AnnualExternalSyncService {
  private readonly logger = new Logger(AnnualExternalSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalData: ExternalDataService,
    private readonly audit: AuditService,
  ) {}

  async syncAll(): Promise<AnnualExternalSyncAllResult> {
    const sources: AnnualExternalSyncResult[] = []

    for (const source of ANNUAL_SOURCES) {
      try {
        sources.push(await this.sync(source))
      } catch (error) {
        this.logger.warn(
          `No se pudo sincronizar el anual externo de ${source}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        sources.push({
          ...emptyResult(source),
          error:
            error instanceof Error ? error.message : String(error),
        })
      }
    }

    return {
      sources,
      created: sources.reduce((total, item) => total + item.created, 0),
      updated: sources.reduce((total, item) => total + item.updated, 0),
      unchanged: sources.reduce(
        (total, item) => total + item.unchanged,
        0,
      ),
      skipped: sources.reduce((total, item) => total + item.skipped, 0),
    }
  }

  async sync(source: AnnualSource): Promise<AnnualExternalSyncResult> {
    const status = await this.externalData.refresh(
      `sincronización anual de ${source}`,
      source,
    )

    if (status.rowCount === 0) {
      this.logger.warn(
        `Libro externo de ${source} sin filas; se omite la sincronización anual`,
      )
      return {
        ...emptyResult(source),
        error: status.lastError || 'El libro externo no tiene filas',
      }
    }

    const rows = this.externalData.getAllRows(source)
    const candidates = new Map<string, AnnualCounterpartyData>()
    let skipped = 0

    for (const row of rows) {
      const candidate = this.toCandidate(source, row)

      if (!candidate) {
        skipped++
        continue
      }

      candidates.set(candidate.codeNormalized, candidate)
    }

    const existingRows = await this.prisma.annualCounterparty.findMany({
      where: { source },
      select: {
        code: true,
        codeNormalized: true,
        businessName: true,
        status: true,
        requiresSemiannualFollowUp: true,
        filingDate: true,
        filingYear: true,
        dueDiligenceType: true,
        observations: true,
        sourceFileName: true,
      },
    })
    const existingByCode = new Map(
      existingRows.map((row) => [row.codeNormalized, row]),
    )

    const counts = await this.prisma.$transaction(
      async (tx) => {
        let created = 0
        let updated = 0
        let unchanged = 0

        for (const candidate of candidates.values()) {
          const existing = existingByCode.get(candidate.codeNormalized)

          if (existing && sameData(existing, candidate)) {
            unchanged++
            continue
          }

          await tx.annualCounterparty.upsert({
            where: {
              source_codeNormalized: {
                source,
                codeNormalized: candidate.codeNormalized,
              },
            },
            create: candidate,
            update: candidate,
          })

          if (existing) {
            updated++
          } else {
            created++
          }
        }

        return { created, updated, unchanged }
      },
      { timeout: 120000 },
    )

    const result: AnnualExternalSyncResult = {
      source,
      sourceRows: rows.length,
      ...counts,
      skipped,
      fileName: rows[0]?.sourceFileName ?? null,
      error: null,
    }

    await this.audit.record({
      action: 'ANNUAL_UPDATES_EXTERNAL_SYNC',
      entity: 'AnnualCounterparty',
      details: result,
    })

    if (result.created + result.updated > 0) {
      this.logger.log(
        `Sincronización anual de ${source}: ${result.created} nuevas, ${result.updated} actualizadas`,
      )
    }

    return result
  }

  private toCandidate(
    source: AnnualSource,
    row: ExternalAnnualRow,
  ): AnnualCounterpartyData | null {
    const code = normalizeAnnualCode(row.code)
    const businessName = row.businessName.trim()

    if (!code || !businessName) {
      return null
    }

    return {
      source,
      code,
      codeNormalized: code,
      businessName,
      status:
        row.status === 'ACTIVE'
          ? AnnualStatus.ACTIVE
          : AnnualStatus.INACTIVE,
      requiresSemiannualFollowUp: row.requiresSemiannualFollowUp,
      filingDate: row.filingDate ? parseDateOnly(row.filingDate) : null,
      filingYear: row.filingYear,
      dueDiligenceType: row.dueDiligenceType,
      observations: row.observations,
      sourceFileName: row.sourceFileName,
    }
  }
}
