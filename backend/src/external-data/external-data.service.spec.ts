import { describe, expect, it, vi } from 'vitest'
import {
  getBusinessToday,
  toDateOnly,
} from '../common/utils/dates.js'
import { ExternalAnnualMapperService } from './external-annual-mapper.service.js'
import { ExternalDataCacheService } from './external-data.cache.service.js'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { ExternalDataService } from './external-data.service.js'
import { ExternalWorkbookReaderService } from './external-workbook-reader.service.js'
import type {
  ExternalAnnualRow,
  ExternalDataStatus,
} from './types.js'

const status: ExternalDataStatus = {
  enabled: true,
  configured: true,
  connection: 'connected',
  freshness: 'fresh',
  sourceName: 'Base anual',
  sourceUrl: null,
  version: 'v1',
  lastAttemptAt: '2026-11-20T12:00:00.000Z',
  lastSuccessAt: '2026-11-20T12:00:00.000Z',
  lastChangeAt: '2026-11-20T12:00:00.000Z',
  lastError: null,
  rowCount: 4,
  mappingErrors: [],
  subscription: {
    state: 'disabled',
    id: null,
    expiresAt: null,
    message: null,
  },
  webhookConfigured: false,
  pollMs: 900000,
  serverNow: '2026-11-20T12:00:00.000Z',
}

function filingDateForDue(days: number): string {
  const today = getBusinessToday()
  const due = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + days,
    ),
  )
  const filing = new Date(
    Date.UTC(
      due.getUTCFullYear() - 1,
      due.getUTCMonth(),
      due.getUTCDate(),
    ),
  )

  return toDateOnly(filing) ?? ''
}

function row(code: string, filingDate: string): ExternalAnnualRow {
  return {
    id: `external-${code}`,
    code,
    businessName: `Contraparte ${code}`,
    status: 'ACTIVE',
    requiresSemiannualFollowUp: null,
    filingDate,
    filingYear: Number(filingDate.slice(0, 4)),
    dueDiligenceType: null,
    observations: null,
    updatedThisYear: false,
    annualStatus: 'PENDING',
    sourceFileName: 'base.xlsx',
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
  }
}

function createService(rows: ExternalAnnualRow[]) {
  const cache = {
    getSnapshot: vi.fn(() => ({ rows })),
    getStatus: vi.fn(() => status),
  }

  return new ExternalDataService(
    {} as ExternalDataConfigService,
    cache as unknown as ExternalDataCacheService,
    {} as ExternalWorkbookReaderService,
    {} as ExternalAnnualMapperService,
  )
}

describe('ExternalDataService', () => {
  it('clasifica vencimientos y omite registros fuera de ventana', () => {
    const service = createService([
      row('A', filingDateForDue(3)),
      row('B', filingDateForDue(8)),
      row('C', filingDateForDue(-2)),
      row('D', filingDateForDue(40)),
    ])

    const result = service.getUpdatesDue({
      page: 1,
      pageSize: 10,
    })

    expect(result.data.map((item) => item.code)).toEqual([
      'C',
      'A',
      'B',
    ])
    expect(result.data.map((item) => item.situation)).toEqual([
      'OVERDUE',
      'DUE_SOON',
      'DUE_SOON',
    ])
    expect(result.data[1].reminderType).toBe('ANNUAL_D5')
    expect(result.data[2].reminderType).toBe('ANNUAL_D10')
    expect(result.summary).toMatchObject({
      needsUpdate: 1,
      overdue: 1,
      dueToday: 0,
      upcoming: 2,
      withoutDate: 0,
    })
    expect(result.status).toEqual(status)
  })

  it('excluye inactivos y fechas anteriores al año anterior', () => {
    const inactive = {
      ...row('I', filingDateForDue(1)),
      status: 'INACTIVE' as const,
    }
    const oldYear = getBusinessToday().getUTCFullYear() - 2
    const tooOld = {
      ...row('O', `${oldYear}-01-15`),
      filingYear: oldYear,
    }
    const service = createService([inactive, tooOld])

    const result = service.getUpdatesDue({
      page: 1,
      pageSize: 10,
    })

    expect(result.data).toEqual([])
    expect(result.meta.total).toBe(0)
  })
})
