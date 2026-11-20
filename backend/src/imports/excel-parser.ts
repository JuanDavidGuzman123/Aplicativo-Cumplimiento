import ExcelJS from 'exceljs'

export const IMPORT_FIELDS = [
  'nit',
  'businessName',
  'subprocess',
  'registrationDate',
  'lastFollowUpDate',
  'nextFollowUpDate',
  'observations',
] as const

export type ImportField = (typeof IMPORT_FIELDS)[number]

export type ImportMapping = Partial<Record<ImportField, string | null>>

export type ImportHeader = {
  value: string
  label: string
}

export type ParsedRow = {
  rowNumber: number
  values: string[]
}

export type ParsedSheet = {
  name: string
  headerRowNumber: number
  headers: ImportHeader[]
  rows: ParsedRow[]
}

export type ParsedFile = {
  fileName: string
  sheets: ParsedSheet[]
}

export type ParsedWorkbook = {
  files: ParsedFile[]
  headers: ImportHeader[]
  suggestedMapping: ImportMapping
  totalRows: number
}

const MAX_IMPORT_ROWS = 5000
const MAX_HEADER_SCAN_ROWS = 10

const FIELD_ALIASES: Record<ImportField, string[]> = {
  nit: [
    'nit',
    'nro nit',
    'numero nit',
    'numero de nit',
    'cedula',
    'cedula nit',
    'documento',
    'numero documento',
    'numero de documento',
    'identificacion',
    'nro documento',
  ],
  businessName: [
    'razon social',
    'razon social contraparte',
    'nombre',
    'nombre contraparte',
    'nombre de la contraparte',
    'contraparte',
    'empresa',
    'cliente',
    'proveedor',
  ],
  subprocess: [
    'subproceso',
    'sub proceso',
    'proceso',
    'area',
    'dependencia',
    'macroproceso',
  ],
  registrationDate: [
    'fecha registro',
    'fecha de registro',
    'fecha ingreso',
    'fecha de ingreso',
    'fecha alta',
    'fecha de alta',
    'fecha vinculacion',
    'fecha de vinculacion',
  ],
  lastFollowUpDate: [
    'ultimo seguimiento',
    'fecha ultimo seguimiento',
    'fecha de ultimo seguimiento',
    'ultima fecha de seguimiento',
    'fecha seguimiento',
    'fecha de seguimiento',
  ],
  nextFollowUpDate: [
    'proximo seguimiento',
    'fecha proximo seguimiento',
    'fecha de proximo seguimiento',
    'proxima fecha de seguimiento',
    'siguiente seguimiento',
    'fecha siguiente seguimiento',
    'fecha de siguiente seguimiento',
  ],
  observations: [
    'observaciones',
    'observacion',
    'notas',
    'detalle',
    'comentarios',
  ],
}

const normalizedAliases = Object.fromEntries(
  IMPORT_FIELDS.map((field) => [
    field,
    FIELD_ALIASES[field].map((alias) => normalizeHeader(alias)),
  ]),
) as Record<ImportField, string[]>

export class ExcelParseError extends Error {}

export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizeLookupText(value: string): string {
  return normalizeHeader(value).replace(/\s+/g, ' ')
}

function formatDateOnly(value: Date): string {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value

  if (value === null || value === undefined) {
    return ''
  }

  if (value instanceof Date) {
    return formatDateOnly(value)
  }

  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text)
        .join('')
        .trim()
    }

    if ('formula' in value || 'sharedFormula' in value) {
      const result = 'result' in value ? value.result : null

      if (result instanceof Date) {
        return formatDateOnly(result)
      }

      if (
        typeof result === 'string' ||
        typeof result === 'number' ||
        typeof result === 'boolean'
      ) {
        return String(result).trim()
      }

      return ''
    }

    if ('error' in value) {
      return ''
    }

    if ('text' in value && typeof value.text === 'string') {
      return value.text.trim()
    }
  }

  if (typeof value === 'number') {
    const text = cell.text
    return (
      typeof text === 'string' && text ? text : String(value)
    ).trim()
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  const text = cell.text
  return typeof text === 'string' ? text.trim() : ''
}

function findHeaderRow(worksheet: ExcelJS.Worksheet): number {
  const scanLimit = Math.min(
    worksheet.rowCount,
    MAX_HEADER_SCAN_ROWS,
  )
  let bestRow = 0
  let bestCount = 0

  for (let rowNumber = 1; rowNumber <= scanLimit; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    let count = 0

    for (
      let columnNumber = 1;
      columnNumber <= worksheet.columnCount;
      columnNumber++
    ) {
      if (cellText(row.getCell(columnNumber)) !== '') {
        count++
      }
    }

    if (count > bestCount) {
      bestCount = count
      bestRow = rowNumber
    }
  }

  return bestCount > 0 ? bestRow : 0
}

function parseSheet(worksheet: ExcelJS.Worksheet): ParsedSheet | null {
  const headerRowNumber = findHeaderRow(worksheet)

  if (headerRowNumber === 0) {
    return null
  }

  const headerRow = worksheet.getRow(headerRowNumber)
  const headers: ImportHeader[] = []
  const headerIndexes: number[] = []
  const seenHeaders = new Set<string>()

  for (
    let columnNumber = 1;
    columnNumber <= worksheet.columnCount;
    columnNumber++
  ) {
    const label = cellText(headerRow.getCell(columnNumber))

    if (!label) {
      continue
    }

    const normalized = normalizeHeader(label)

    if (!normalized || seenHeaders.has(normalized)) {
      continue
    }

    seenHeaders.add(normalized)
    headers.push({ value: normalized, label })
    headerIndexes.push(columnNumber)
  }

  if (headers.length === 0) {
    return null
  }

  const rows: ParsedRow[] = []

  for (
    let rowNumber = headerRowNumber + 1;
    rowNumber <= worksheet.rowCount;
    rowNumber++
  ) {
    const row = worksheet.getRow(rowNumber)
    const values = headerIndexes.map((columnNumber) =>
      cellText(row.getCell(columnNumber)),
    )

    if (values.every((value) => value === '')) {
      continue
    }

    rows.push({ rowNumber, values })

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ExcelParseError(
        `El archivo supera el límite de ${MAX_IMPORT_ROWS} filas de datos`,
      )
    }
  }

  if (rows.length === 0) {
    return null
  }

  return {
    name: worksheet.name,
    headerRowNumber,
    headers,
    rows,
  }
}

function collectHeaders(files: ParsedFile[]): ImportHeader[] {
  const result = new Map<string, ImportHeader>()

  for (const file of files) {
    for (const sheet of file.sheets) {
      for (const header of sheet.headers) {
        if (!result.has(header.value)) {
          result.set(header.value, header)
        }
      }
    }
  }

  return [...result.values()]
}

function findHeaderForField(
  field: ImportField,
  headers: ImportHeader[],
): string | null {
  const aliases = normalizedAliases[field]
  let bestValue: string | null = null
  let bestScore = 0

  for (const header of headers) {
    for (const alias of aliases) {
      let score = 0

      if (header.value === alias) {
        score = 100
      } else if (
        header.value.startsWith(`${alias} `) ||
        header.value.endsWith(` ${alias}`)
      ) {
        score = 80
      } else if (
        alias.length >= 5 &&
        header.value.includes(alias)
      ) {
        score = 60
      }

      if (score > bestScore) {
        bestScore = score
        bestValue = header.value
      }
    }
  }

  return bestValue
}

export function suggestMapping(
  headers: ImportHeader[],
): ImportMapping {
  return Object.fromEntries(
    IMPORT_FIELDS.map((field) => [
      field,
      findHeaderForField(field, headers),
    ]),
  ) as ImportMapping
}

export async function parseWorkbook(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook()

  try {
    await workbook.xlsx.load(
      buffer as unknown as Parameters<
        typeof workbook.xlsx.load
      >[0],
    )
  } catch {
    throw new ExcelParseError(
      'El archivo no se pudo leer. Verifique que sea un Excel válido (.xlsx o .xlsm)',
    )
  }

  const sheets = workbook.worksheets
    .map((worksheet) => parseSheet(worksheet))
    .filter((sheet): sheet is ParsedSheet => sheet !== null)

  if (sheets.length === 0) {
    throw new ExcelParseError(
      'El archivo no contiene hojas con datos para importar',
    )
  }

  const files: ParsedFile[] = [{ fileName, sheets }]
  const headers = collectHeaders(files)
  const totalRows = sheets.reduce(
    (total, sheet) => total + sheet.rows.length,
    0,
  )

  return {
    files,
    headers,
    suggestedMapping: suggestMapping(headers),
    totalRows,
  }
}

export function mergeParsedWorkbooks(
  workbooks: ParsedWorkbook[],
): ParsedWorkbook {
  const files = workbooks.flatMap((workbook) => workbook.files)
  const headers = collectHeaders(files)
  const totalRows = files.reduce(
    (total, file) =>
      total +
      file.sheets.reduce(
        (sheetTotal, sheet) => sheetTotal + sheet.rows.length,
        0,
      ),
    0,
  )

  if (totalRows > MAX_IMPORT_ROWS) {
    throw new ExcelParseError(
      `La importación supera el límite de ${MAX_IMPORT_ROWS} filas de datos`,
    )
  }

  return {
    files,
    headers,
    suggestedMapping: suggestMapping(headers),
    totalRows,
  }
}

export function getFieldValue(
  sheet: ParsedSheet,
  row: ParsedRow,
  mapping: ImportMapping,
  field: ImportField,
): string | null {
  const headerValue = mapping[field]

  if (!headerValue) {
    return null
  }

  const index = sheet.headers.findIndex(
    (header) => header.value === headerValue,
  )

  if (index === -1) {
    return null
  }

  const value = row.values[index]?.trim()
  return value ? value : null
}

function buildDate(
  year: number,
  month: number,
  day: number,
): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return formatDateOnly(date)
}

function excelSerialToDate(serial: number): string | null {
  if (!Number.isFinite(serial)) {
    return null
  }

  const milliseconds =
    Date.UTC(1899, 11, 30) + Math.floor(serial) * (24 * 60 * 60 * 1000)
  const date = new Date(milliseconds)
  return formatDateOnly(date)
}

export function parseImportedDate(value: string | null): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(
    trimmed,
  )

  if (isoMatch) {
    return buildDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    )
  }

  const slashMatch =
    /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(trimmed)

  if (slashMatch) {
    let year = Number(slashMatch[3])
    const month = Number(slashMatch[2])
    const day = Number(slashMatch[1])

    if (year < 100) {
      year += year < 70 ? 2000 : 1900
    }

    return buildDate(year, month, day)
  }

  const yearFirstMatch =
    /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(trimmed)

  if (yearFirstMatch) {
    return buildDate(
      Number(yearFirstMatch[1]),
      Number(yearFirstMatch[2]),
      Number(yearFirstMatch[3]),
    )
  }

  if (/^\d{5}(?:\.\d+)?$/.test(trimmed)) {
    return excelSerialToDate(Number(trimmed))
  }

  return null
}
