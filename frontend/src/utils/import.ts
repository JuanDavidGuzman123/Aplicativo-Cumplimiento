import type { BadgeTone } from '../components/Badge'
import type {
  ImportField,
  ImportRowStatus,
  ImportStatus,
} from '../types/import'

export const importFieldLabels: Record<ImportField, string> = {
  nit: 'NIT',
  businessName: 'Razón social',
  subprocess: 'Subproceso',
  registrationDate: 'Fecha de registro',
  lastFollowUpDate: 'Último seguimiento',
  nextFollowUpDate: 'Próximo seguimiento',
  observations: 'Observaciones',
}

export const importFieldOrder: ImportField[] = [
  'nit',
  'businessName',
  'subprocess',
  'registrationDate',
  'lastFollowUpDate',
  'nextFollowUpDate',
  'observations',
]

export const importStatusLabels: Record<ImportStatus, string> = {
  PREVIEW: 'En revisión',
  CONFIRMED: 'Confirmada',
  FAILED: 'Fallida',
}

export const importStatusTones: Record<ImportStatus, BadgeTone> = {
  PREVIEW: 'amber',
  CONFIRMED: 'green',
  FAILED: 'red',
}

export const importRowStatusLabels: Record<
  ImportRowStatus,
  string
> = {
  NEW: 'Nueva',
  EXISTING: 'Existente',
  CONFLICT: 'Conflicto',
  ERROR: 'Error',
}

export const importRowStatusTones: Record<
  ImportRowStatus,
  BadgeTone
> = {
  NEW: 'blue',
  EXISTING: 'green',
  CONFLICT: 'amber',
  ERROR: 'red',
}
