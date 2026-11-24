import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cellText } from './colocadores-workbook.util.js'
import {
  saveWorkbookSafely,
  verifyOnlyChanges,
  WorkbookSafetyError,
} from './workbook-safe-save.js'

describe('workbook-safe-save', () => {
  let directory: string
  let filePath: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'workbook-safe-save-'))
    filePath = join(directory, 'FR-SG-81.xlsx')

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('FR-SG-81')
    sheet.getCell(3, 1).value = 'Numero de documento'
    sheet.getCell(3, 2).value = 'Seguimiento Si/No'
    sheet.getCell(3, 3).value = 'Observaciones'
    sheet.getCell(4, 1).value = '1110579763'
    sheet.getCell(4, 2).value = 'Si'
    sheet.getCell(4, 3).value = 'Observacion original'
    sheet.getCell(4, 5).value = 'No se debe tocar'
    sheet.getCell(5, 1).value = 'Fila oculta'
    sheet.getRow(5).hidden = true
    sheet.autoFilter = 'A3:C3'
    await workbook.xlsx.writeFile(filePath)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('guarda solo las celdas autorizadas y conserva filas ocultas y filtros', async () => {
    const changes = [
      {
        worksheet: 'FR-SG-81',
        row: 4,
        column: 2,
        value: 'No',
      },
    ]

    await saveWorkbookSafely(filePath, changes)

    const saved = new ExcelJS.Workbook()
    await saved.xlsx.readFile(filePath)
    const savedSheet = saved.getWorksheet('FR-SG-81')

    expect(savedSheet?.getCell(4, 2).value).toBe('No')
    expect(savedSheet?.getCell(4, 3).value).toBe('Observacion original')
    expect(savedSheet?.getCell(4, 5).value).toBe('No se debe tocar')
    expect(savedSheet?.getRow(5).hidden).toBe(true)
    expect(savedSheet?.autoFilter).toBe('A3:C3')
    expect(savedSheet?.rowCount).toBe(5)
    expect(savedSheet?.columnCount).toBe(5)
  })

  it('no reemplaza el archivo si no puede ubicar la hoja', async () => {
    await expect(
      saveWorkbookSafely(filePath, [
        {
          worksheet: 'No existe',
          row: 4,
          column: 2,
          value: 'No',
        },
      ]),
    ).rejects.toBeInstanceOf(WorkbookSafetyError)

    const original = new ExcelJS.Workbook()
    await original.xlsx.readFile(filePath)
    const originalSheet = original.getWorksheet('FR-SG-81')

    expect(originalSheet?.getCell(4, 2).value).toBe('Si')
    expect(originalSheet?.getCell(4, 5).value).toBe('No se debe tocar')
  })

  it('conserva celdas posteriores cuando la celda objetivo estaba vacía', async () => {
    const formulaPath = join(directory, 'formula.xlsx')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Hoja')

    sheet.getCell(3, 1).value = 'Numero de documento'
    sheet.getCell(3, 2).value = 'Seguimiento Si/No'
    sheet.getCell(4, 1).value = '1'
    sheet.getCell(4, 2).style = { numFmt: '@' }
    sheet.getCell(4, 3).value = { formula: '1+1', result: 2 }
    await workbook.xlsx.writeFile(formulaPath)

    await saveWorkbookSafely(formulaPath, [
      {
        worksheet: 'Hoja',
        row: 4,
        column: 2,
        value: 'Si',
      },
    ])

    const saved = new ExcelJS.Workbook()
    await saved.xlsx.readFile(formulaPath)
    const savedSheet = saved.getWorksheet('Hoja')

    expect(cellText(savedSheet!.getCell(4, 2))).toBe('Si')
    expect(cellText(savedSheet!.getCell(4, 3))).toBe('2')
  })

  it('detecta cambios ajenos al comparar un archivo candidato', async () => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)
    const sheet = workbook.getWorksheet('FR-SG-81')
    sheet!.getCell(4, 5).value = 'Cambio no autorizado'
    const candidatePath = join(directory, 'candidate.xlsx')
    await workbook.xlsx.writeFile(candidatePath)

    await expect(
      verifyOnlyChanges(filePath, candidatePath, []),
    ).rejects.toBeInstanceOf(WorkbookSafetyError)
  })
})
