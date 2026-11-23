import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ColocadoresWorkbookWriterService } from './colocadores-workbook.writer.service.js'
import { uuidFromDocument } from './colocadores-workbook.util.js'

describe('ColocadoresWorkbookWriterService', () => {
  let directory: string
  let filePath: string
  const writer = new ColocadoresWorkbookWriterService()
  const document = '1110579763'

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'colocadores-writer-'))
    filePath = join(directory, 'FR-SG-81.xlsx')

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('FR-SG-81')
    sheet.getCell(3, 1).value = 'Numero de documento'
    sheet.getCell(3, 2).value = 'Seguimiento Si/No'
    sheet.getCell(3, 3).value = 'Observaciones'
    sheet.getCell(4, 1).value = document
    sheet.getCell(4, 2).value = 'Si'
    sheet.getCell(4, 3).value = 'Observacion original'
    sheet.getCell(2, 10).value = { formula: '1+1', result: null }
    await workbook.xlsx.writeFile(filePath)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('no agrega columnas ni filas al preparar el libro', async () => {
    const result = await writer.prepare(filePath, 'FR-SG-81')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)
    const sheet = workbook.getWorksheet('FR-SG-81')

    expect(result).toMatchObject({
      sourceRows: 1,
      followUpRows: 1,
      created: 0,
      alreadyExisting: 1,
    })
    expect(sheet?.columnCount).toBe(10)
    expect(sheet?.rowCount).toBe(4)
    expect(sheet?.getCell(3, 1).value).toBe('Numero de documento')
    expect(sheet?.getCell(3, 2).value).toBe('Seguimiento Si/No')
    expect(sheet?.getCell(3, 3).value).toBe('Observaciones')
    expect(sheet?.getCell(4, 1).value).toBe(document)
    expect(sheet?.getCell(4, 2).value).toBe('Si')
    expect(sheet?.getCell(4, 3).value).toBe('Observacion original')
  })

  it('cambia Seguimiento Si/No y Observaciones sin agregar columnas ni filas', async () => {
    await writer.writeFields(filePath, 'FR-SG-81', uuidFromDocument(document), {
      followUp: 'No',
      observations: 'Observacion escrita en la app',
    })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)
    const sheet = workbook.getWorksheet('FR-SG-81')

    expect(sheet?.getCell(4, 2).value).toBe('No')
    expect(sheet?.getCell(4, 3).value).toBe('Observacion escrita en la app')
    expect(sheet?.getCell(4, 1).value).toBe(document)
    expect(sheet?.columnCount).toBe(10)
    expect(sheet?.rowCount).toBe(4)
  })
})
