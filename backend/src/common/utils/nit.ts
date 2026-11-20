export const NIT_PATTERN = /^(?=(?:\D*\d){6,15}\D*$)[\d.\-\s]+$/

export function normalizeNit(value: string): string {
  return value.replace(/\D/g, '')
}
