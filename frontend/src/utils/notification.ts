import type { BadgeTone } from '../components/Badge'
import type {
  AnnualNotification,
  AnnualNotificationType,
  FollowUpNotification,
  FollowUpNotificationType,
  NotificationProcess,
  NotificationSource,
} from '../types/notification'

export const followUpNotificationTypeLabels: Record<
  FollowUpNotificationType,
  string
> = {
  D30: 'Próximo',
  D15: 'Prioritario',
  D3: 'Recordatorio 3 días',
  D1: 'Recordatorio 1 día',
  DUE: 'Vence hoy',
  OVERDUE: 'Vencido',
}

export const annualNotificationTypeLabels: Record<
  AnnualNotificationType,
  string
> = {
  ANNUAL_D15: 'Anual 15 días',
  ANNUAL_D10: 'Anual 10 días',
  ANNUAL_D5: 'Anual 5 días',
  ANNUAL_D3: 'Anual 3 días',
  ANNUAL_D1: 'Anual 1 día',
  ANNUAL_DUE: 'Vence hoy',
}

export const followUpNotificationTypeTones: Record<
  FollowUpNotificationType,
  BadgeTone
> = {
  D30: 'blue',
  D15: 'amber',
  D3: 'amber',
  D1: 'amber',
  DUE: 'red',
  OVERDUE: 'red',
}

export const annualNotificationTypeTones: Record<
  AnnualNotificationType,
  BadgeTone
> = {
  ANNUAL_D15: 'blue',
  ANNUAL_D10: 'amber',
  ANNUAL_D5: 'red',
  ANNUAL_D3: 'amber',
  ANNUAL_D1: 'amber',
  ANNUAL_DUE: 'red',
}

export type AlertState =
  | 'OVERDUE'
  | 'DUE_SOON'
  | 'PENDING'
  | 'COMPLETED'

export type AlertNotification =
  | FollowUpNotification
  | AnnualNotification

export type AlertGroupMember = {
  id: string
  process: NotificationProcess
  type: string
  read: boolean
}

export type AlertGroup = {
  key: string
  process: NotificationProcess
  source: NotificationSource
  state: AlertState
  dueDate: string
  days: number
  daysLabel: string
  read: boolean
  obligationLabel: string
  categoryLabel: string
  counterpartyLabel: string
  identification: string
  reminderLabels: string[]
  members: AlertGroupMember[]
  navigatePath: string
  latestCreatedAt: string
}

export const notificationProcessLabels: Record<
  NotificationProcess,
  string
> = {
  FOLLOW_UP: 'Seguimiento semestral',
  ANNUAL: 'Actualización anual',
}

export const notificationSourceLabels: Record<
  NotificationSource,
  string
> = {
  arriendos: 'Arriendos',
  clientes: 'Clientes',
  colocadores: 'Colocadores independientes',
  proveedores: 'Proveedores',
}

export const alertStateLabels: Record<AlertState, string> = {
  OVERDUE: 'Vencida',
  DUE_SOON: 'Por vencer',
  PENDING: 'Pendiente',
  COMPLETED: 'Completada',
}

export const alertStateTones: Record<AlertState, BadgeTone> = {
  OVERDUE: 'red',
  DUE_SOON: 'amber',
  PENDING: 'blue',
  COMPLETED: 'green',
}

const alertStateOrder: Record<AlertState, number> = {
  OVERDUE: 0,
  DUE_SOON: 1,
  PENDING: 2,
  COMPLETED: 3,
}

function getBusinessToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: 'year' | 'month' | 'day') =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${value('year')}-${value('month')}-${value('day')}`
}

function toUtcDate(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function daysUntilAlertDate(
  dueDate: string,
  today = getBusinessToday(),
): number {
  return Math.round(
    (toUtcDate(dueDate) - toUtcDate(today)) / (24 * 60 * 60 * 1000),
  )
}

export function formatAlertDays(days: number): string {
  if (days < 0) {
    const overdue = Math.abs(days)
    return `${overdue} día${overdue === 1 ? '' : 's'} vencido${overdue === 1 ? '' : 's'}`
  }

  if (days === 0) {
    return 'Hoy'
  }

  return `${days} día${days === 1 ? '' : 's'}`
}

export function getAlertState(
  dueDate: string | null,
  today = getBusinessToday(),
): AlertState {
  if (!dueDate) {
    return 'PENDING'
  }

  const days = daysUntilAlertDate(dueDate, today)

  if (days < 0) {
    return 'OVERDUE'
  }

  if (days <= 15) {
    return 'DUE_SOON'
  }

  return 'PENDING'
}

export function getReminderLabel(type: string): string {
  const labels: Record<string, string> = {
    D30: 'Recordatorio 30 días',
    D15: 'Recordatorio 15 días',
    D3: 'Recordatorio 3 días',
    D1: 'Recordatorio 1 día',
    DUE: 'Fecha de vencimiento',
    OVERDUE: 'Vencimiento',
    ANNUAL_D15: 'Recordatorio 15 días',
    ANNUAL_D10: 'Recordatorio 10 días',
    ANNUAL_D5: 'Recordatorio 5 días',
    ANNUAL_D3: 'Recordatorio 3 días',
    ANNUAL_D1: 'Recordatorio 1 día',
    ANNUAL_DUE: 'Fecha de vencimiento',
  }

  if (labels[type]) {
    return labels[type]
  }

  const match = /^(?:ANNUAL_)?D(\d+)$/.exec(type)
  return match ? `Recordatorio ${match[1]} días` : type
}

function resolveNotificationSource(
  notification: AlertNotification,
): NotificationSource {
  if (notification.source) {
    return notification.source
  }

  if (notification.process === 'ANNUAL') {
    return notification.annualCounterparty?.source ?? 'arriendos'
  }

  return 'arriendos'
}

function resolveNotificationDetails(notification: AlertNotification) {
  if (notification.process === 'ANNUAL') {
    const counterparty = notification.annualCounterparty
    const source = resolveNotificationSource(notification)
    const basePath =
      source === 'clientes'
        ? '/actualizacion-anual/clientes'
        : source === 'proveedores'
          ? '/actualizacion-anual/proveedores'
          : '/actualizacion-anual'

    return {
      id: counterparty?.id ?? 'sin-registro',
      counterpartyLabel: counterparty?.businessName ?? 'Actualización anual',
      identification: counterparty?.code ?? '—',
      navigatePath: counterparty?.code
        ? `${basePath}?code=${encodeURIComponent(counterparty.code)}`
        : basePath,
    }
  }

  const counterparty = notification.counterparty

  return {
    id: counterparty?.id ?? 'sin-registro',
    counterpartyLabel: counterparty?.businessName ?? 'Contraparte',
    identification: counterparty?.nit ?? '—',
    navigatePath: counterparty
      ? `/contrapartes/${counterparty.id}`
      : '/contrapartes',
  }
}

export function buildAlertGroups(
  notifications: AlertNotification[],
  today = getBusinessToday(),
): AlertGroup[] {
  const groups = new Map<string, AlertGroup>()

  for (const notification of notifications) {
    const dueDate = notification.scheduledDate

    if (
      !dueDate ||
      !notification.currentDueDate ||
      dueDate !== notification.currentDueDate
    ) {
      continue
    }

    const process = notification.process
    const source = resolveNotificationSource(notification)
    const details = resolveNotificationDetails(notification)
    const key = `${process}:${source}:${details.id}:${dueDate}`
    const state = getAlertState(dueDate, today)
    const days = daysUntilAlertDate(dueDate, today)
    const reminderLabel = getReminderLabel(notification.type)

    let group = groups.get(key)

    if (!group) {
      group = {
        key,
        process,
        source,
        state,
        dueDate,
        days,
        daysLabel: formatAlertDays(days),
        read: true,
        obligationLabel: notificationProcessLabels[process],
        categoryLabel: notificationSourceLabels[source],
        counterpartyLabel: details.counterpartyLabel,
        identification: details.identification,
        reminderLabels: [],
        members: [],
        navigatePath: details.navigatePath,
        latestCreatedAt: notification.createdAt,
      }
      groups.set(key, group)
    }

    group.read = group.read && notification.read

    if (!group.reminderLabels.includes(reminderLabel)) {
      group.reminderLabels.push(reminderLabel)
    }

    group.members.push({
      id: notification.id,
      process,
      type: notification.type,
      read: notification.read,
    })

    if (notification.createdAt > group.latestCreatedAt) {
      group.latestCreatedAt = notification.createdAt
    }
  }

  return [...groups.values()].sort((first, second) => {
    const byState =
      alertStateOrder[first.state] - alertStateOrder[second.state]

    if (byState !== 0) {
      return byState
    }

    if (first.days !== second.days) {
      return first.days - second.days
    }

    return second.latestCreatedAt.localeCompare(first.latestCreatedAt)
  })
}
