import { Injectable } from '@nestjs/common'
import { isMissingAnnualValue } from '../common/utils/annual-values.js'
import {
  ANNUAL_IMPORT_FIELDS,
  getAnnualFieldValue,
  normalizeAnnualCode,
  normalizeAnnualStatus,
  normalizeAnnualDate,
  normalizeAnnualYear,
  normalizeSemiannualFollowUp,
  suggestAnnualMapping,
  type AnnualImportField,
} from '../annual-updates/annual-parser.js'
import type { ParsedRow } from '../imports/excel-parser.js'
import type {
  ExternalAnnualMapping,
  ExternalAnnualRow,
  ExternalSyncStats,
  ExternalWorkbookData,
} from './types.js'

type MappedWorkbook = {
  rows: ExternalAnnualRow[]
  stats: ExternalSyncStats
  mapping: ExternalAnnualMapping
  mappingErrors: string[]
}

@Injectable()
export class ExternalAnnualMapperService {
  resolveMapping(
    workbook: ExternalWorkbookData,
    rawColumnMap: string,
  ): { mapping: ExternalAnnualMapping; errors: string[] } {
    if (!rawColumnMap) {
      return {
        mapping: { ...suggestAnnualMapping(workbook.headers) },
        errors: [],
      }
    }

    let parsed: unknown

    try {
      parsed = JSON.parse(rawColumnMap)
    } catch {
      return {
        mapping: {},
        errors: ['EXTERNAL_DATA_COLUMN_MAP no contiene JSON válido'],
      }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        mapping: {},
        errors: ['EXTERNAL_DATA_COLUMN_MAP debe ser un objeto JSON'],
      }
    }

    const source = parsed as Record<string, unknown>
    const mapping: ExternalAnnualMapping = {}
    const errors: string[] = []

    for (const field of ANNUAL_IMPORT_FIELDS) {
      const rawValue = source[field]

      if (rawValue === undefined || rawValue === null || rawValue === '') {
        mapping[field] = null
        continue
      }

      if (typeof rawValue !== 'string') {
        errors.push(`La columna "${field}" debe ser texto`)
        continue
      }

      const normalized = rawValue
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
      const header = workbook.headers.find(
        (item) =>
          item.value === normalized ||
          item.label.toLowerCase() === rawValue.toLowerCase().trim(),
      )

      if (!header) {
        errors.push(
          `La columna "${rawValue}" configurada para "${field}" no existe en el libro externo`,
        )
        mapping[field] = normalized
        continue
      }

      mapping[field] = header.value
    }

    for (const key of Object.keys(source)) {
      if (!ANNUAL_IMPORT_FIELDS.includes(key as AnnualImportField)) {
        errors.push(`El campo "${key}" no es reconocido`)
      }
    }

    return { mapping, errors }
  }

  mapWorkbook(
    workbook: ExternalWorkbookData,
    mapping: ExternalAnnualMapping,
    syncTime: string,
  ): MappedWorkbook {
    const sheet = { headers: workbook.headers }
    const timestamp =
      workbook.lastModifiedDateTime && !Number.isNaN(Date.parse(workbook.lastModifiedDateTime))
        ? new Date(workbook.lastModifiedDateTime).toISOString()
        : syncTime
    const result = new Map<string, ExternalAnnualRow>()
    let ignoredRows = 0
    let errorRows = 0

    for (const row of workbook.rows) {
      const parsedRow = row as ParsedRow
      const code = getAnnualFieldValue(sheet, parsedRow, mapping, 'code')
      const codeNormalized = code ? normalizeAnnualCode(code) : ''
      const businessName =
        getAnnualFieldValue(sheet, parsedRow, mapping, 'businessName') ?? ''
      const statusRaw = getAnnualFieldValue(
        sheet,
        parsedRow,
        mapping,
        'status',
      )
      const status = normalizeAnnualStatus(statusRaw)
      const followUpRaw = getAnnualFieldValue(
        sheet,
        parsedRow,
        mapping,
        'requiresSemiannualFollowUp',
      )
      const dateRaw = getAnnualFieldValue(
        sheet,
        parsedRow,
        mapping,
        'filingDate',
      )
      const yearRaw = getAnnualFieldValue(
        sheet,
        parsedRow,
        mapping,
        'filingYear',
      )
      const dateMissing = isMissingAnnualValue(dateRaw)
      const yearMissing = isMissingAnnualValue(yearRaw)
      const filingDate = dateMissing ? null : normalizeAnnualDate(dateRaw)
      const parsedYear = yearMissing ? null : normalizeAnnualYear(yearRaw)
      const filingYear =
        parsedYear ?? (filingDate ? Number(filingDate.slice(0, 4)) : null)
      const dueDiligenceType =
        getAnnualFieldValue(
          sheet,
          parsedRow,
          mapping,
          'dueDiligenceType',
        ) ?? null
      const observations =
        getAnnualFieldValue(
          sheet,
          parsedRow,
          mapping,
          'observations',
        ) ?? null
      const followUp = normalizeSemiannualFollowUp(followUpRaw)

      if (
        !codeNormalized ||
        !businessName.trim() ||
        !status ||
        (!dateMissing && !filingDate) ||
        (!yearMissing && parsedYear === null) ||
        (followUpRaw && followUp === null)
      ) {
        errorRows += 1
        continue
      }

      const candidate: ExternalAnnualRow = {
        id: `external-${codeNormalized}`,
        code: codeNormalized,
        businessName: businessName.trim(),
        status,
        requiresSemiannualFollowUp: followUp,
        filingDate,
        filingYear,
        dueDiligenceType: dueDiligenceType?.trim() || null,
        observations: observations?.trim() || null,
        updatedThisYear: false,
        annualStatus: 'NO_DATE',
        sourceFileName: workbook.fileName,
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      const existing = result.get(codeNormalized)

      if (existing) {
        if (this.isMoreRecent(candidate, existing)) {
          result.set(codeNormalized, candidate)
        }
        ignoredRows += 1
        continue
      }

      result.set(codeNormalized, candidate)
    }

    const rows = [...result.values()]
    const stats: ExternalSyncStats = {
      totalRows: workbook.rows.length,
      validRows: rows.length,
      ignoredRows,
      errorRows,
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
    }

    return {
      rows,
      stats,
      mapping,
      mappingErrors: this.missingRequiredFields(mapping),
    }
  }

  private missingRequiredFields(
    mapping: ExternalAnnualMapping,
  ): string[] {
    const labels: Record<AnnualImportField, string> = {
      code: 'Código',
      businessName: 'Nombre',
      status: 'Estado',
      filingDate: 'Fecha de diligenciamiento',
      filingYear: 'Año',
      dueDiligenceType: 'Tipo de diligencia',
      requiresSemiannualFollowUp: 'Seguimiento semestral',
      observations: 'Observaciones',
    }
    const required: AnnualImportField[] = [
      'code',
      'businessName',
      'status',
    ]

    return required
      .filter((field) => !mapping[field])
      .map((field) => `Falta la columna obligatoria "${labels[field]}"`)
  }

  private isMoreRecent(
    candidate: ExternalAnnualRow,
    current: ExternalAnnualRow,
  ): boolean {
    const candidateYear = candidate.filingYear ?? Number.NEGATIVE_INFINITY
    const currentYear = current.filingYear ?? Number.NEGATIVE_INFINITY

    if (candidateYear !== currentYear) {
      return candidateYear > currentYear
    }

    if (candidate.filingDate && current.filingDate) {
      return candidate.filingDate > current.filingDate
    }

    return Boolean(candidate.filingDate) && !current.filingDate
  }
}
