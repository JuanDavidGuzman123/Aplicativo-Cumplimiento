import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ColocadoresWorkbookWriterService } from './colocadores-workbook.writer.service.js'
import { uuidFromRowNumber } from './colocadores-workbook.util.js'

describe('ColocadoresWorkbookWriterService', () => {
  let directory: string
  let filePath: string
  const writer = new ColocadoresWorkbookWriterService()

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'colocadores-writer-'))
    filePath = join(directory, 'FR-SG-81.xlsx')

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('FR-SG-81')
    sheet.getCell(3, 1).value = 'Numero de documento'
    sheet.getCell(3, 2).value = 'Seguimiento Si/No'
    sheet.getCell(3, 3).value = 'Observaciones'
    sheet.getCell(4, 1).value = '1110579763'
    sheet.getCell(4, 2).value = 'Si'
    sheet.getCell(4, 3).value = 'Observacion original'
    sheet.getCell(2, 10).value = { formula: '1+1', result: null }
    await workbook.xlsx.writeFile(filePath)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('crea columnas e IDs estables sin modificar las originales', async () => {
    const result = await writer.prepare(filePath, 'FR-SG-81')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)
    const sheet = workbook.getWorksheet('FR-SG-81')

    expect(result).toMatchObject({
      sourceRows: 1,
      followUpRows: 1,
      created: 1,
      alreadyExisting: 0,
    })
    expect(sheet?.getCell(3, 4).value).toBe('ID Unico')
    expect(sheet?.getCell(3, 9).value).toBe('Fecha Archivado')
    expect(sheet?.getCell(4, 4).value).toBe(uuidFromRowNumber(4))
    expect(sheet?.getCell(4, 1).value).toBe('1110579763')
    expect(sheet?.getCell(4, 3).value).toBe('Observacion original')
  })

  it('escribe evaluación, fechas, estado y observación en la fila del ID', async () => {
    await writer.prepare(filePath, 'FR-SG-81')
    const id = uuidFromRowNumber(4)

    await writer.writeFields(filePath, 'FR-SG-81', id, {
      status: 'ACTIVE',
      lastEvaluation: '2026-11-23',
      nextFollowUp: '2027-05-23',
      decision: 'CONTINUE',
      observations: 'Nueva observacion',
    })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)
    const sheet = workbook.getWorksheet('FR-SG-81')

    expect(sheet?.getCell(4, 5).value).toBe('ACTIVE')
    expect(sheet?.getCell(4, 6).value).toBe('2026-11-23')
    expect(sheet?.getCell(4, 7).value).toBe('2027-05-23')
    expect(sheet?.getCell(4, 8).value).toBe('CONTINUE')
    expect(sheet?.getCell(4, 3).value).toBe('Nueva observacion')
  })
})
