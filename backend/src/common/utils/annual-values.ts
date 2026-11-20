export function isMissingAnnualValue(value: string | null): boolean {
  if (!value) {
    return true
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, '')

  return [
    'n/a',
    'na',
    'noaplica',
    'sinfecha',
    'sindato',
    '-',
    '--',
  ].includes(normalized)
}
