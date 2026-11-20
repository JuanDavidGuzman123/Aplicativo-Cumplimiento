import {
  ExcelParseError,
  normalizeHeader,
  parseImportedDate,
  parseWorkbook,
  type ImportHeader,
  type ParsedRow,
  type ParsedSheet,
} from '../imports/excel-parser.js'

export const ANNUAL_IMPORT_FIELDS = [
  'code',
  'businessName',
  'status',
  'filingDate',
  'filingYear',
  'dueDiligenceType',
  'requiresSemiannualFollowUp',
  'observations',
] as const

export type AnnualImportField = (typeof ANNUAL_IMPORT_FIELDS)[number]

export type AnnualImportMapping = Partial<
  Record<AnnualImportField, string | null>
>

export type ParsedAnnualFile = {
  fileName: string
  sheetName: string
  headers: ImportHeader[]
  rows: ParsedRow[]
  totalRows: number
  ignoredSheets: string[]
  suggestedMapping: AnnualImportMapping
}

const FIELD_ALIASES: Record<AnnualImportField, string[]> = {
  code: [
    'codigo punto de venta',
    'codigo punto venta',
    'codigo de punto de venta',
    'codigo de punto venta',
    'codigo del punto de venta',
    'codigo del punto venta',
    'codigo pdv',
    'codigo de pdv',
    'codigo del pdv',
    'cod punto de venta',
    'cod punto venta',
    'codigo',
    'codigo contraparte',
    'codigo de contraparte',
    'cod contraparte',
    'id contraparte',
    'nit o numero de documento',
    'numero de documento',
    'numero documento',
    'nit',
    'cedula',
    'documento',
    'identificacion',
    'id',
  ],
  businessName: [
    'nombre punto de venta',
    'nombre punto venta',
    'nombre de punto de venta',
    'nombre de punto venta',
    'nombre del punto de venta',
    'nombre del punto venta',
    'nombre pdv',
    'nombre de pdv',
    'nombre del pdv',
    'nombre',
    'razon social',
    'razon social contraparte',
    'nombre contraparte',
    'nombre de la contraparte',
    'nombre y o razon social',
    'nombres y apellidos',
    'contraparte',
    'empresa',
  ],
  status: [
    'estado',
    'estado a i',
    'estado a/i',
    'a i',
    'a/i',
    'estado punto de venta',
    'estado punto venta',
    'estado del punto de venta',
    'estado del punto venta',
    'estado pdv',
    'estado del pdv',
    'estado contraparte',
    'estado de la contraparte',
    'situacion',
    'estado actual',
    'activo a inactivos i',
    'activo a inactivos',
    'activo inactivo',
  ],
  filingDate: [
    'fecha de diligenciamiento',
    'fecha diligenciamiento',
    'fecha de debida diligencia',
    'fecha debida diligencia',
    'fecha de diligencia',
    'fecha diligencia',
    'ultima actualizacion',
    'fecha ultima actualizacion',
    'fecha de ultima actualizacion',
    'fecha actualizacion',
    'fecha de actualizacion',
    'actualizacion anual',
    'ultima fecha actualizacion',
  ],
  filingYear: [
    'ano',
    'ano de diligenciamiento',
    'ano diligenciamiento',
    'ano de la diligencia',
    'ano de actualizacion',
    'vigencia',
    'periodo',
    'year',
  ],
  dueDiligenceType: [
    'tipo de debida diligencia',
    'tipo debida diligencia',
    'tipo de diligencia',
    'tipo diligencia',
  ],
  requiresSemiannualFollowUp: [
    'seguimiento',
    'seguimiento si no',
    'requiere seguimiento',
    'seguimiento 6 meses',
    'seguimiento a 6 meses',
    'seguimiento semestral',
    'aplica seguimiento',
    'control seguimiento',
  ],
  observations: [
    'observaciones',
    'observacion',
    'notas',
    'comentarios',
    'detalle',
  ],
}

const normalizedAliases = Object.fromEntries(
  ANNUAL_IMPORT_FIELDS.map((field) => [
    field,
    FIELD_ALIASES[field].map((alias) => normalizeHeader(alias)),
  ]),
) as Record<AnnualImportField, string[]>

function findHeaderForField(
  field: AnnualImportField,
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

export function suggestAnnualMapping(
  headers: ImportHeader[],
): AnnualImportMapping {
  return Object.fromEntries(
    ANNUAL_IMPORT_FIELDS.map((field) => [
      field,
      findHeaderForField(field, headers),
    ]),
  ) as AnnualImportMapping
}

export async function parseAnnualWorkbook(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedAnnualFile> {
  const workbook = await parseWorkbook(buffer, fileName)
  const sheets = workbook.files.flatMap((file) =>
    file.sheets.map((sheet) => ({
      fileName: file.fileName,
      sheet,
    })),
  )

  const candidates = sheets.map((item) => ({
    ...item,
    suggestedMapping: suggestAnnualMapping(item.sheet.headers),
  }))
  const selected = candidates.reduce((best, current) => {
    const bestScore = Object.values(
      best.suggestedMapping,
    ).filter(Boolean).length
    const currentScore = Object.values(
      current.suggestedMapping,
    ).filter(Boolean).length

    if (currentScore !== bestScore) {
      return currentScore > bestScore ? current : best
    }

    return current.sheet.rows.length > best.sheet.rows.length
      ? current
      : best
  })

  return {
    fileName,
    sheetName: selected.sheet.name,
    headers: selected.sheet.headers,
    rows: selected.sheet.rows,
    totalRows: selected.sheet.rows.length,
    ignoredSheets: sheets
      .filter((item) => item.sheet !== selected.sheet)
      .map((item) => `${item.fileName} / ${item.sheet.name}`),
    suggestedMapping: selected.suggestedMapping,
  }
}

export function getAnnualFieldValue(
  sheet: Pick<ParsedSheet, 'headers'>,
  row: ParsedRow,
  mapping: AnnualImportMapping,
  field: AnnualImportField,
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

export function normalizeAnnualCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

export function normalizeAnnualStatus(
  value: string | null,
): 'ACTIVE' | 'INACTIVE' | null {
  if (!value) {
    return null
  }

  const normalized = normalizeHeader(value)

  if (
    [
      'a',
      'activo',
      'activa',
      'active',
      'vigente',
      'habilitado',
      'si',
      '1',
      'true',
    ].includes(normalized)
  ) {
    return 'ACTIVE'
  }

  if (
    [
      'i',
      'inactivo',
      'inactiva',
      'inactive',
      'no',
      'n',
      '0',
      'false',
      'retirado',
      'deshabilitado',
    ].includes(normalized)
  ) {
    return 'INACTIVE'
  }

  return null
}

export function normalizeSemiannualFollowUp(
  value: string | null,
): boolean | null {
  if (!value) {
    return null
  }

  const normalized = normalizeHeader(value)

  if (!normalized) {
    return null
  }

  if (
    [
      'si',
      's',
      'true',
      '1',
      'x',
      'aplica',
      'requiere',
      'seguimiento',
    ].includes(normalized)
  ) {
    return true
  }

  if (['no', 'n', 'false', '0'].includes(normalized)) {
    return false
  }

  return null
}

export function normalizeAnnualDate(
  value: string | null,
): string | null {
  if (!value) {
    return null
  }

  return parseImportedDate(value)
}

export function normalizeAnnualYear(
  value: string | null,
): number | null {
  if (!value) {
    return null
  }

  const numeric = Number(value.replace(',', '.'))

  if (
    Number.isInteger(numeric) &&
    numeric >= 1900 &&
    numeric <= 2100
  ) {
    return numeric
  }

  const digits = value.replace(/\D/g, '')

  if (digits.length !== 4) {
    return null
  }

  const year = Number(digits)
  return year >= 1900 && year <= 2100 ? year : null
}

export { ExcelParseError }
