import { describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { ExternalDataReportService } from './external-data-report.service.js'
import { ExternalDataService } from './external-data.service.js'
import type { ExternalUpdateDueRow } from './types.js'

const row: ExternalUpdateDueRow = {
  id: 'external-37',
  code: '37',
  businessName: 'Pdv La Iglesia',
  status: 'ACTIVE',
  requiresSemiannualFollowUp: null,
  filingDate: '2025-11-21',
  filingYear: 2025,
  dueDiligenceType: 'Actualización/simplificada',
  observations: null,
  updatedThisYear: false,
  annualStatus: 'PENDING',
  sourceFileName: 'FR-SG-79.xlsx',
  createdAt: '2026-11-21T12:00:00.000Z',
  updatedAt: '2026-11-21T12:00:00.000Z',
  dueDate: '2026-11-21',
  daysUntilDue: 0,
  situation: 'DUE_TODAY',
  reminderType: 'ANNUAL_D1',
}

describe('ExternalDataReportService', () => {
  it('genera un xlsx con los pendientes activos', async () => {
    const dataService = {
      getReport: vi.fn(() => ({
        metric: 'pending-active' as const,
        title: 'Pendientes de actualizar (activos)',
        subtitle: '1 activo · diligenciamiento desde 2025',
        generatedAt: '2026-11-21T12:00:00.000Z',
        currentYear: 2026,
        rows: [row],
      })),
    }
    const service = new ExternalDataReportService(
      dataService as unknown as ExternalDataService,
    )

    const buffer = await service.generate('pending-active')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.worksheets[0]

    expect(sheet?.getCell('A1').value).toBe(
      'Reporte: Pendientes de actualizar (activos)',
    )
    expect(sheet?.getCell('A4').value).toBe('Código')
    expect(sheet?.getCell('A4').fill).toMatchObject({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF166534' },
    })
    expect(sheet?.getCell('A1').font?.color).toMatchObject({
      argb: 'FF166534',
    })
    expect(sheet?.properties.tabColor).toMatchObject({
      argb: 'FF16A34A',
    })
    expect(sheet?.getCell('A5').value).toBe('37')
    expect(sheet?.rowCount).toBe(5)
    expect(sheet?.autoFilter).toBe('A4:L5')
  })
})
