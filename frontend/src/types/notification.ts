export type NotificationType =
  | 'D30'
  | 'D15'
  | 'DUE'
  | 'OVERDUE'
  | 'ANNUAL_D15'
  | 'ANNUAL_D10'
  | 'ANNUAL_D5'

export type NotificationSource = 'SEMESTRAL' | 'ANNUAL'

export type NotificationCounterparty = {
  id: string
  businessName: string
  nit: string
}

export type NotificationAnnualCounterparty = {
  id: string
  code: string
  businessName: string
}

export type AppNotification = {
  id: string
  type: NotificationType
  message: string
  scheduledDate: string | null
  createdAt: string
  source: NotificationSource
  counterparty: NotificationCounterparty | null
  annualCounterparty: NotificationAnnualCounterparty | null
  read: boolean
  readAt: string | null
}

export type NotificationsResponse = {
  data: AppNotification[]
  unreadCount: number
}

export type AnnualNotificationsResponse = {
  data: AppNotification[]
  unreadCount: number
}
