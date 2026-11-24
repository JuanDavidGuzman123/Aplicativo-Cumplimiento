export type FollowUpNotificationType = 'D30' | 'D15' | 'DUE' | 'OVERDUE'

export type AnnualNotificationType =
  | 'ANNUAL_D15'
  | 'ANNUAL_D10'
  | 'ANNUAL_D5'
  | 'ANNUAL_D3'
  | 'ANNUAL_D1'

export type NotificationCounterparty = {
  id: string
  businessName: string
  nit: string
}

export type NotificationAnnualCounterparty = {
  id: string
  source: 'arriendos' | 'clientes'
  code: string
  businessName: string
}

export type FollowUpNotification = {
  id: string
  type: FollowUpNotificationType
  message: string
  scheduledDate: string | null
  createdAt: string
  counterparty: NotificationCounterparty | null
  read: boolean
  readAt: string | null
}

export type AnnualNotification = {
  id: string
  type: AnnualNotificationType
  message: string
  scheduledDate: string | null
  createdAt: string
  annualCounterparty: NotificationAnnualCounterparty | null
  read: boolean
  readAt: string | null
}

export type FollowUpNotificationsResponse = {
  data: FollowUpNotification[]
  unreadCount: number
}

export type AnnualNotificationsResponse = {
  data: AnnualNotification[]
  unreadCount: number
}
