import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { ExternalWorkbookReaderService } from './external-workbook-reader.service.js'
import { MicrosoftGraphService } from './microsoft-graph.service.js'

describe('ExternalWorkbookReaderService local', () => {
  it('lee la hoja configurada de un archivo xlsx local', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'external-reader-'))
    const filePath = join(directory, 'base-anual.xlsx')

    try {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Base Anual')
      worksheet.addRow(['NIT', 'RAZÓN SOCIAL', 'ESTADO'])
      worksheet.addRow(['900123', 'ACME S.A.S.', 'ACTIVO'])
      await writeFile(
        filePath,
        Buffer.from(await workbook.xlsx.writeBuffer()),
      )

      const config = {
        source: 'file',
        localWorkbookPath: filePath,
        worksheetName: 'Base Anual',
        maxRows: 5000,
      } as unknown as ExternalDataConfigService
      const service = new ExternalWorkbookReaderService(
        config,
        {} as MicrosoftGraphService,
      )

      const result = await service.read()

      expect(result.fileName).toBe('base-anual.xlsx')
      expect(result.sourceName).toBe('Hoja: Base Anual')
      expect(result.sourceUrl).toBeNull()
      expect(result.headers.map((header) => header.label)).toEqual([
        'NIT',
        'RAZÓN SOCIAL',
        'ESTADO',
      ])
      expect(result.rows).toEqual([
        {
          rowNumber: 2,
          values: ['900123', 'ACME S.A.S.', 'ACTIVO'],
        },
      ])
      expect(result.version).toMatch(/^[a-f0-9]{64}$/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('falla con un mensaje claro si el archivo no existe', async () => {
    const config = {
      source: 'file',
      localWorkbookPath: join(tmpdir(), 'no-existe.xlsx'),
      worksheetName: '',
      maxRows: 5000,
    } as unknown as ExternalDataConfigService
    const service = new ExternalWorkbookReaderService(
      config,
      {} as MicrosoftGraphService,
    )

    await expect(service.read()).rejects.toThrow(
      'No se encontró el archivo local',
    )
  })
})
