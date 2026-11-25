import { createHash } from 'node:crypto'
import { CounterpartyStatus, RiskDecision } from '@prisma/client'

export const FIELD_ALIASES = {
  id: ['id unico', 'id único', 'identificador', 'identificador unico'],
  document: [
    'numero de documento',
    'número de documento',
    'nit o numero de documento',
    'nit o número de documento',
    'numero de documento natural juridica',
    'número de documento natural jurídica',
    'nit',
  ],
  name: [
    'nombres y apellidos',
    'nombre y apellidos',
    'nombre',
    'nombre natural juridica',
    'nombre natural jurídica',
  ],
  registrationDate: ['fecha debida diligencia', 'fecha de diligenciamiento'],
  followUp: ['seguimiento si no', 'seguimiento'],
  observations: ['observaciones'],
  status: [
    'estado',
    'activo a inactivos i',
    'activo a inactivo i',
    'activo inactivos i',
    'activo inactivo i',
  ],
  lastEvaluation: ['fecha ultima evaluacion', 'fecha última evaluación'],
  nextFollowUp: ['fecha proximo seguimiento', 'fecha próximo seguimiento'],
  decision: ['resultado evaluacion', 'resultado de evaluacion'],
  archivedAt: ['fecha archivado', 'fecha de archivado'],
} as const

export type FieldKey = keyof typeof FIELD_ALIASES

export type WorkbookField = 'followUp' | 'observations' | 'status'

export type HeaderIndexes = Partial<Record<FieldKey, number>>

export type ColocadoresPrepareResult = {
  sourceRows: number
  followUpRows: number
  created: number
  alreadyExisting: number
  skippedInvalid: number
}

export function asText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return ''
}

export function normalizeHeader(value: unknown): string {
  return asText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizeCell(value: unknown): string {
  return asText(value).trim()
}

export function cellText(cell: { value: unknown }): string {
  const value = cell.value

  if (value && typeof value === 'object' && 'result' in value) {
    return normalizeCell(valueToText(value.result))
  }

  return normalizeCell(valueToText(value))
}

function valueToText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        item && typeof item === 'object' && 'text' in item
          ? valueToText(item.text)
          : valueToText(item),
      )
      .join('')
  }

  if (value && typeof value === 'object') {
    const richText = value as {
      richText?: { text?: unknown }[]
      text?: unknown
    }

    if (Array.isArray(richText.richText)) {
      return richText.richText
        .map((item) => valueToText(item.text))
        .join('')
    }

    if ('text' in richText) {
      return valueToText(richText.text)
    }
  }

  return ''
}

export function normalizeDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const serialDate = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
    return serialDate.toISOString().slice(0, 10)
  }

  const text = normalizeCell(value)
  if (!text) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10)
}

export function headerText(header: unknown): string {
  if (header && typeof header === 'object') {
    const candidate = header as { label?: unknown; value?: unknown }
    return asText(candidate.label ?? candidate.value)
  }

  return asText(header)
}

export function findHeaderIndex(
  headers: Iterable<unknown>,
  aliases: readonly string[],
): number {
  const normalizedAliases = aliases.map(normalizeHeader)
  let index = 0

  for (const header of headers) {
    const normalized = normalizeHeader(headerText(header))
    if (normalizedAliases.includes(normalized)) {
      return index
    }
    index += 1
  }

  return -1
}

export function indexesFrom(headers: Iterable<unknown>): HeaderIndexes {
  return Object.fromEntries(
    (Object.keys(FIELD_ALIASES) as FieldKey[]).map((field) => {
      const index = findHeaderIndex(headers, FIELD_ALIASES[field])
      return [field, index >= 0 ? index : undefined]
    }),
  ) as HeaderIndexes
}

export function columnLetter(index: number): string {
  let current = index + 1
  let result = ''

  while (current > 0) {
    const remainder = (current - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    current = Math.floor((current - 1) / 26)
  }

  return result
}

export function uuidFromDocument(
  document: string,
  prefix = 'colocadores-fr-sg-81',
): string {
  const hash = createHash('sha256')
    .update(`${prefix}:${document}`)
    .digest('hex')
    .slice(0, 32)
    .split('')
  hash[12] = '4'
  hash[16] = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16)

  return `${hash.slice(0, 8).join('')}-${hash.slice(8, 12).join('')}-${hash
    .slice(12, 16)
    .join('')}-${hash.slice(16, 20).join('')}-${hash.slice(20).join('')}`
}

export function decisionFrom(
  value: unknown,
  status: CounterpartyStatus,
  hasEvaluationDate: boolean,
): RiskDecision | null {
  const normalized = normalizeHeader(value)

  if (normalized === 'archive' || normalized === 'archivada') {
    return RiskDecision.ARCHIVE
  }

  if (normalized === 'reactivate' || normalized === 'reactivada') {
    return RiskDecision.REACTIVATE
  }

  if (normalized === 'continue' || normalized === 'continua') {
    return RiskDecision.CONTINUE
  }

  return status === CounterpartyStatus.ACTIVE && hasEvaluationDate
    ? RiskDecision.CONTINUE
    : null
}

export function statusFrom(value: unknown): CounterpartyStatus {
  const normalized = normalizeHeader(value)

  return normalized === 'archivada' ||
    normalized === 'archived' ||
    normalized === 'inactiva' ||
    normalized === 'inactive'
    ? CounterpartyStatus.ARCHIVED
    : CounterpartyStatus.ACTIVE
}
