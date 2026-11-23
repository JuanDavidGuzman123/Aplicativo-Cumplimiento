import { Injectable } from '@nestjs/common'
import ExcelJS from 'exceljs'
import { ExternalDataService } from './external-data.service.js'
import type {
  ExternalReportMetric,
  ExternalSource,
} from './types.js'
import type { ExternalUpdateDueRow } from './types.js'

const statusLabels: Record<ExternalUpdateDueRow['status'], string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
}

const annualStatusLabels: Record<
  ExternalUpdateDueRow['annualStatus'],
  string
> = {
  UPDATED_THIS_YEAR: 'Actualizado este año',
  PENDING: 'Pendiente de actualizar',
  NO_DATE: 'Sin fecha',
}

const situationLabels: Record<
  ExternalUpdateDueRow['situation'],
  string
> = {
  WITHOUT_DATE: 'Sin fecha',
  OVERDUE: 'Vencido',
  DUE_TODAY: 'Vence hoy',
  DUE_SOON: 'Por vencer',
  NOT_DUE: 'Al día',
}

const headers = [
  'Código',
  'Nombre',
  'Estado',
  'Fecha de diligenciamiento',
  'Año',
  'Tipo de debida diligencia',
  'Seguimiento',
  'Observaciones',
  'Estado anual',
  'Fecha límite',
  'Días',
  'Situación',
]

const widths = [
  12, 38, 12, 24, 10, 32, 14, 48, 24, 16, 18, 16,
]

function toExcelDate(value: string | null): Date | null {
  if (!value) {
    return null
  }

  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDays(days: number | null): string {
  if (days === null) {
    return '—'
  }

  if (days < 0) {
    const overdueDays = Math.abs(days)
    return `${overdueDays} día${overdueDays === 1 ? '' : 's'} vencido${overdueDays === 1 ? '' : 's'}`
  }

  if (days === 0) {
    return 'Hoy'
  }

  return `${days} día${days === 1 ? '' : 's'}`
}

@Injectable()
export class ExternalDataReportService {
  constructor(private readonly dataService: ExternalDataService) {}

  async generatePendingActive(
    source: ExternalSource = 'arriendos',
  ): Promise<Buffer> {
    return this.generate('pending-active', source)
  }

  async generate(
    metric: ExternalReportMetric,
    source: ExternalSource = 'arriendos',
  ): Promise<Buffer> {
    const report = this.dataService.getReport(metric, source)
    const workbook = new ExcelJS.Workbook()

    workbook.creator = 'Seguimiento de Contrapartes'
    workbook.created = new Date(report.generatedAt)

    const sheet = workbook.addWorksheet(report.title.slice(0, 31))
    const lastColumn = sheet.getColumn(headers.length).letter

    sheet.properties.tabColor = { argb: 'FF16A34A' }

    sheet.mergeCells(`A1:${lastColumn}1`)
    sheet.getCell('A1').value = `Reporte: ${report.title}`
    sheet.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: 'FF166534' },
    }

    sheet.mergeCells(`A2:${lastColumn}2`)
    sheet.getCell('A2').value =
      `${report.subtitle} · Generado ${report.generatedAt}`
    sheet.getCell('A2').font = { color: { argb: 'FF475569' } }

    const headerRow = sheet.getRow(4)
    headerRow.values = headers
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF166534' },
    }
    headerRow.alignment = { vertical: 'middle' }

    report.rows.forEach((row, index) => {
      const excelRow = sheet.getRow(index + 5)
      excelRow.values = [
        row.code,
        row.businessName,
        statusLabels[row.status],
        toExcelDate(row.filingDate),
        row.filingYear,
        row.dueDiligenceType,
        row.requiresSemiannualFollowUp === null
          ? '—'
          : row.requiresSemiannualFollowUp
            ? 'Sí'
            : 'No',
        row.observations ?? '—',
        annualStatusLabels[row.annualStatus],
        toExcelDate(row.dueDate),
        formatDays(row.daysUntilDue),
        situationLabels[row.situation],
      ]

      excelRow.getCell(4).numFmt = 'yyyy-mm-dd'
      excelRow.getCell(10).numFmt = 'yyyy-mm-dd'
      excelRow.getCell(8).alignment = {
        vertical: 'top',
        wrapText: true,
      }

      if (index % 2 === 1) {
        excelRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        }
      }
    })

    headers.forEach((_, index) => {
      sheet.getColumn(index + 1).width = widths[index]
    })

    sheet.views = [{ state: 'frozen', ySplit: 4 }]
    sheet.autoFilter = {
      from: 'A4',
      to: `${lastColumn}${Math.max(4, 4 + report.rows.length)}`,
    }

    return Buffer.from(await workbook.xlsx.writeBuffer())
  }
}
