import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { cellText, columnLetter } from './colocadores-workbook.util.js'

export type WorkbookCellChange = {
  worksheet: string
  row: number
  column: number
  value: string
}

export class WorkbookSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkbookSafetyError'
  }
}

export async function saveWorkbookSafely(
  filePath: string,
  changes: WorkbookCellChange[],
): Promise<void> {
  if (changes.length === 0) {
    return
  }

  const temporaryPath = join(
    dirname(filePath),
    `.${basename(filePath)}.${randomUUID()}.tmp.xlsx`,
  )

  try {
    const original = await readFile(filePath)
    const zip = await JSZip.loadAsync(original)
    const changesBySheet = new Map<string, WorkbookCellChange[]>()

    for (const change of changes) {
      const current = changesBySheet.get(change.worksheet) ?? []
      current.push(change)
      changesBySheet.set(change.worksheet, current)
    }

    for (const [worksheet, sheetChanges] of changesBySheet) {
      const sheetPath = await worksheetPath(zip, worksheet)
      const sheetFile = zip.file(sheetPath)

      if (!sheetFile) {
        throw new WorkbookSafetyError(
          `no se encontró el XML de la hoja ${worksheet}`,
        )
      }

      const xml = await sheetFile.async('string')
      zip.file(sheetPath, patchSheetXml(xml, sheetChanges))
    }

    const patched = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    })

    await writeFile(temporaryPath, patched)
    await verifyOnlyChanges(filePath, temporaryPath, changes)
    await rename(temporaryPath, filePath)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

export async function verifyOnlyChanges(
  originalPath: string,
  candidatePath: string,
  changes: WorkbookCellChange[],
): Promise<void> {
  const [original, candidate] = await Promise.all([
    readWorkbook(originalPath),
    readWorkbook(candidatePath),
  ])
  const allowed = new Map(
    changes.map((change) => [
      cellKey(change.worksheet, change.row, change.column),
      change.value,
    ]),
  )

  const originalSheets = original.worksheets
  const candidateSheets = candidate.worksheets

  if (originalSheets.length !== candidateSheets.length) {
    throw new WorkbookSafetyError(
      'la cantidad de hojas del libro cambió',
    )
  }

  for (let index = 0; index < originalSheets.length; index += 1) {
    const originalSheet = originalSheets[index]
    const candidateSheet = candidateSheets[index]

    if (originalSheet.name !== candidateSheet.name) {
      throw new WorkbookSafetyError(
        `la hoja ${originalSheet.name} cambió de nombre o posición`,
      )
    }

    verifySheet(originalSheet, candidateSheet, allowed)
  }
}

async function worksheetPath(
  zip: JSZip,
  worksheetName: string,
): Promise<string> {
  const workbookFile = zip.file('xl/workbook.xml')
  const relationshipsFile = zip.file('xl/_rels/workbook.xml.rels')

  if (!workbookFile || !relationshipsFile) {
    throw new WorkbookSafetyError(
      'el libro no contiene la estructura de hojas esperada',
    )
  }

  const [workbookXml, relationshipsXml] = await Promise.all([
    workbookFile.async('string'),
    relationshipsFile.async('string'),
  ])
  const sheets = [...workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)].map(
    (match) => ({
      name: decodeXml(getAttribute(match[0], 'name') ?? ''),
      relationshipId: getAttribute(match[0], 'r:id') ?? '',
    }),
  )
  const sheet =
    sheets.find((item) => item.name === worksheetName) ?? sheets[0]

  if (!sheet?.relationshipId) {
    throw new WorkbookSafetyError(
      `no se encontró la hoja ${worksheetName}`,
    )
  }

  const relationship = [
    ...relationshipsXml.matchAll(/<Relationship\b[^>]*\/?>/g),
  ]
    .map((match) => match[0])
    .find(
      (tag) =>
        getAttribute(tag, 'Id') === sheet.relationshipId,
    )
  const target = relationship
    ? getAttribute(relationship, 'Target')
    : null

  if (!target) {
    throw new WorkbookSafetyError(
      `no se encontró el archivo de la hoja ${worksheetName}`,
    )
  }

  if (target.startsWith('/')) {
    return target.slice(1)
  }

  if (target.startsWith('xl/')) {
    return target
  }

  return `xl/${target.replace(/^\.\//, '')}`
}

function patchSheetXml(
  xml: string,
  changes: WorkbookCellChange[],
): string {
  return changes.reduce(
    (current, change) => patchCell(current, change),
    xml,
  )
}

function patchCell(
  xml: string,
  change: WorkbookCellChange,
): string {
  const address = `${columnLetter(change.column - 1)}${change.row}`
  const rowPattern = new RegExp(
    `<row\\b[^>]*\\br="${change.row}"[^>]*?/>|<row\\b[^>]*\\br="${change.row}"[^>]*>[\\s\\S]*?</row>`,
  )
  const rowMatch = rowPattern.exec(xml)

  if (!rowMatch || rowMatch.index === undefined) {
    throw new WorkbookSafetyError(
      `no se encontró la fila ${change.row} de ${change.worksheet}`,
    )
  }

  const rowXml = rowMatch[0]
  const patchedRow = patchRow(rowXml, address, change)
  return (
    xml.slice(0, rowMatch.index) +
    patchedRow +
    xml.slice(rowMatch.index + rowXml.length)
  )
}

function patchRow(
  rowXml: string,
  address: string,
  change: WorkbookCellChange,
): string {
  const cellPattern = new RegExp(
    `<c\\b[^>]*\\br="${address}"[^>]*?/>|<c\\b[^>]*\\br="${address}"[^>]*>[\\s\\S]*?</c>`,
  )
  const cellMatch = cellPattern.exec(rowXml)
  const style = cellMatch
    ? getAttribute(
        cellMatch[0].slice(0, cellMatch[0].indexOf('>') + 1),
        's',
      )
    : null
  const newCell = cellXml(address, change.value, style)

  if (cellMatch) {
    return (
      rowXml.slice(0, cellMatch.index) +
      newCell +
      rowXml.slice(cellMatch.index + cellMatch[0].length)
    )
  }

  if (rowXml.endsWith('/>')) {
    return `${rowXml.slice(0, -2)}>${newCell}</row>`
  }

  const openEnd = rowXml.indexOf('>') + 1
  const closeStart = rowXml.lastIndexOf('</row>')
  const inner = rowXml.slice(openEnd, closeStart)
  const insertion = cellInsertionIndex(
    inner,
    change.column,
  )

  return (
    rowXml.slice(0, openEnd) +
    inner.slice(0, insertion) +
    newCell +
    inner.slice(insertion) +
    rowXml.slice(closeStart)
  )
}

function cellInsertionIndex(
  rowContent: string,
  column: number,
): number {
  const cellPattern = /<c\b[^>]*\br="([A-Z]+)\d+"/g

  for (const match of rowContent.matchAll(cellPattern)) {
    if (columnIndex(match[1]) > column) {
      return match.index ?? rowContent.length
    }
  }

  return rowContent.length
}

function columnIndex(letters: string): number {
  let result = 0

  for (const letter of letters) {
    result = result * 26 + letter.charCodeAt(0) - 64
  }

  return result
}

function cellXml(
  address: string,
  value: string,
  style: string | null,
): string {
  const styleAttribute = style ? ` s="${style}"` : ''
  return `<c r="${address}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

function getAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`))
  return match?.[1] ?? null
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function readWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  return workbook
}

function verifySheet(
  original: ExcelJS.Worksheet,
  candidate: ExcelJS.Worksheet,
  allowed: Map<string, string>,
): void {
  if (original.rowCount !== candidate.rowCount) {
    throw new WorkbookSafetyError(
      `la cantidad de filas de ${original.name} cambió`,
    )
  }

  if (original.columnCount !== candidate.columnCount) {
    throw new WorkbookSafetyError(
      `la cantidad de columnas de ${original.name} cambió`,
    )
  }

  if ((original.state ?? 'visible') !== (candidate.state ?? 'visible')) {
    throw new WorkbookSafetyError(
      `la visibilidad de la hoja ${original.name} cambió`,
    )
  }

  if (autoFilterKey(original.autoFilter) !== autoFilterKey(candidate.autoFilter)) {
    throw new WorkbookSafetyError(
      `el filtro de ${original.name} cambió`,
    )
  }

  if (mergeKey(original) !== mergeKey(candidate)) {
    throw new WorkbookSafetyError(
      `las celdas combinadas de ${original.name} cambiaron`,
    )
  }

  verifyRows(original, candidate)
  verifyColumns(original, candidate)
  verifyCells(original, candidate, allowed)
}

function verifyRows(
  original: ExcelJS.Worksheet,
  candidate: ExcelJS.Worksheet,
): void {
  for (let row = 1; row <= original.rowCount; row += 1) {
    const originalRow = original.getRow(row)
    const candidateRow = candidate.getRow(row)

    if (Boolean(originalRow.hidden) !== Boolean(candidateRow.hidden)) {
      throw new WorkbookSafetyError(
        `la fila ${row} de ${original.name} cambió su visibilidad`,
      )
    }

    if (!sameOptionalNumber(originalRow.height, candidateRow.height)) {
      throw new WorkbookSafetyError(
        `la altura de la fila ${row} de ${original.name} cambió`,
      )
    }
  }
}

function verifyColumns(
  original: ExcelJS.Worksheet,
  candidate: ExcelJS.Worksheet,
): void {
  for (let column = 1; column <= original.columnCount; column += 1) {
    const originalColumn = original.getColumn(column)
    const candidateColumn = candidate.getColumn(column)

    if (Boolean(originalColumn.hidden) !== Boolean(candidateColumn.hidden)) {
      throw new WorkbookSafetyError(
        `la columna ${column} de ${original.name} cambió su visibilidad`,
      )
    }

    if (!sameOptionalNumber(originalColumn.width, candidateColumn.width)) {
      throw new WorkbookSafetyError(
        `el ancho de la columna ${column} de ${original.name} cambió`,
      )
    }
  }
}

function verifyCells(
  original: ExcelJS.Worksheet,
  candidate: ExcelJS.Worksheet,
  allowed: Map<string, string>,
): void {
  for (let row = 1; row <= original.rowCount; row += 1) {
    for (let column = 1; column <= original.columnCount; column += 1) {
      const key = cellKey(original.name, row, column)
      const expected = allowed.get(key)
      const candidateCell = candidate.getCell(row, column)

      if (expected !== undefined) {
        if (cellText(candidateCell) !== expected) {
          throw new WorkbookSafetyError(
            `la celda ${candidateCell.address} de ${original.name} no quedó con el valor esperado`,
          )
        }
        continue
      }

      const originalValue = valueKey(original.getCell(row, column).value)
      const candidateValue = valueKey(candidateCell.value)

      if (originalValue !== candidateValue) {
        throw new WorkbookSafetyError(
          `la celda ${candidateCell.address} de ${original.name} cambió sin autorización`,
        )
      }
    }
  }
}

function cellKey(worksheet: string, row: number, column: number): string {
  return `${worksheet}\u0000${row}\u0000${column}`
}

function valueKey(value: unknown): string {
  const serialized = JSON.stringify(canonicalValue(value))
  return serialized === undefined ? 'undefined' : serialized
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map(canonicalValue)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    )
  }

  return value
}

function sameOptionalNumber(
  left: number | undefined,
  right: number | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right
  }

  return Math.abs(left - right) < 0.001
}

function autoFilterKey(
  autoFilter: ExcelJS.AutoFilter | null | undefined,
): string {
  if (!autoFilter) {
    return ''
  }

  if (typeof autoFilter === 'string') {
    return autoFilter
  }

  const from =
    typeof autoFilter.from === 'string'
      ? autoFilter.from
      : `${autoFilter.from.row}:${autoFilter.from.column}`
  const to =
    typeof autoFilter.to === 'string'
      ? autoFilter.to
      : `${autoFilter.to.row}:${autoFilter.to.column}`

  return `${from}:${to}`
}

function mergeKey(sheet: ExcelJS.Worksheet): string {
  return [...(sheet.model.merges ?? [])].sort().join(',')
}
