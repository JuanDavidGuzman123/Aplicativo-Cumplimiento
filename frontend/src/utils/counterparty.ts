import type { BadgeTone } from '../components/Badge'
import type {
  CalendarStatus,
  CounterpartyStatus,
} from '../types/counterparty'

export const counterpartyStatusLabels: Record<
  CounterpartyStatus,
  string
> = {
  ACTIVE: 'Activa',
  ARCHIVED: 'Archivada',
}

export const calendarStatusLabels: Record<CalendarStatus, string> = {
  OVERDUE: 'Vencido',
  PENDING: 'Pendiente',
  UPCOMING: 'Próximo',
  ON_TIME: 'Al día',
  UNSCHEDULED: 'Sin programar',
}

export const calendarStatusTones: Record<CalendarStatus, BadgeTone> = {
  OVERDUE: 'red',
  PENDING: 'amber',
  UPCOMING: 'blue',
  ON_TIME: 'green',
  UNSCHEDULED: 'slate',
}
