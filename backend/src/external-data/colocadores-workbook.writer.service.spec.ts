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
    sheet.getCell(4, 4).value = 'No se debe tocar'
    sheet.getCell(2, 10).value = { formula: '1+1', result: null }
    sheet.getColumn(4).width = 28
    sheet.autoFilter = 'A3:D3'
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
    expect(sheet?.getCell(4, 4).value).toBe('No se debe tocar')
    expect(sheet?.getCell(2, 10).value).toEqual({
      formula: '1+1',
    })
    expect(sheet?.getColumn(4).width).toBe(28)
    expect(sheet?.autoFilter).toBe('A3:D3')
    expect(sheet?.columnCount).toBe(10)
    expect(sheet?.rowCount).toBe(4)
  })

  it('actualiza FR-SG-79 por documento sin tocar otras celdas', async () => {
    const arriendosPath = join(directory, 'FR-SG-79.xlsx')
    const workbook = new ExcelJS.Workbook()
    const metadata = workbook.addWorksheet('Metadatos')
    metadata.getCell('A1').value = 'No se debe tocar'
    const sheet = workbook.addWorksheet('FR-SG-79')

    sheet.getCell(3, 8).value = 'Numero de documento\nNatural / Juridica'
    sheet.getCell(3, 16).value = 'Seguimiento \nSi / No '
    sheet.getCell(3, 17).value = 'Observaciones '
    sheet.getCell(4, 8).value = '93082817'
    sheet.getCell(4, 9).value = 'Alejandro Ferro Gonzalez'
    sheet.getCell(4, 16).value = 'No'
    sheet.getCell(4, 17).value = 'Observacion original'
    sheet.getCell(4, 18).value = { formula: '1+1', result: 2 }
    sheet.autoFilter = 'A3:W3'
    await workbook.xlsx.writeFile(arriendosPath)

    const previous = await writer.writeFieldsByDocument(
      arriendosPath,
      'FR-SG-79',
      '93082817',
      {
        followUp: 'Si',
        observations: 'Observacion escrita en la app',
      },
      'FR-SG-79',
    )

    const saved = new ExcelJS.Workbook()
    await saved.xlsx.readFile(arriendosPath)
    const savedSheet = saved.getWorksheet('FR-SG-79')

    expect(previous).toEqual({
      followUp: 'No',
      observations: 'Observacion original',
    })
    expect(savedSheet?.getCell(4, 16).value).toBe('Si')
    expect(savedSheet?.getCell(4, 17).value).toBe(
      'Observacion escrita en la app',
    )
    expect(savedSheet?.getCell(4, 8).value).toBe('93082817')
    expect(savedSheet?.getCell(4, 9).value).toBe(
      'Alejandro Ferro Gonzalez',
    )
    expect(savedSheet?.getCell(4, 18).value).toEqual({
      formula: '1+1',
      result: 2,
    })
    expect(savedSheet?.autoFilter).toBe('A3:W3')
    expect(saved.getWorksheet('Metadatos')?.getCell('A1').value).toBe(
      'No se debe tocar',
    )
  })

  it('prefiere la fila con seguimiento cuando el documento está repetido', async () => {
    const duplicatePath = join(directory, 'FR-SG-79-duplicado.xlsx')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('FR-SG-79')

    sheet.getCell(3, 8).value = 'Numero de documento\nNatural / Juridica'
    sheet.getCell(3, 16).value = 'Seguimiento \nSi / No '
    sheet.getCell(3, 17).value = 'Observaciones '
    sheet.getCell(4, 8).value = '93082817'
    sheet.getCell(4, 16).value = ''
    sheet.getCell(5, 8).value = '93082817'
    sheet.getCell(5, 16).value = 'No'
    await workbook.xlsx.writeFile(duplicatePath)

    await writer.writeFieldsByDocument(
      duplicatePath,
      'FR-SG-79',
      '930.828.17',
      { followUp: 'Si' },
      'FR-SG-79',
    )

    const saved = new ExcelJS.Workbook()
    await saved.xlsx.readFile(duplicatePath)
    const savedSheet = saved.getWorksheet('FR-SG-79')

    expect(savedSheet?.getCell(4, 16).value).toBe('')
    expect(savedSheet?.getCell(5, 16).value).toBe('Si')
  })

  it('conserva filas ocultas al escribir', async () => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)
    const sheet = workbook.getWorksheet('FR-SG-81')

    sheet!.getCell(5, 1).value = 'Fila oculta'
    sheet!.getRow(5).hidden = true
    await workbook.xlsx.writeFile(filePath)

    await writer.writeFields(filePath, 'FR-SG-81', uuidFromDocument(document), {
      followUp: 'No',
    })

    const saved = new ExcelJS.Workbook()
    await saved.xlsx.readFile(filePath)

    expect(saved.getWorksheet('FR-SG-81')?.getRow(5).hidden).toBe(true)
  })
})
