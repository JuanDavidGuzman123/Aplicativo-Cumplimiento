export const ANNUAL_SOURCES = [
  'arriendos',
  'clientes',
  'proveedores',
] as const

export type AnnualSource = (typeof ANNUAL_SOURCES)[number]

export const DEFAULT_ANNUAL_SOURCE: AnnualSource = 'arriendos'
