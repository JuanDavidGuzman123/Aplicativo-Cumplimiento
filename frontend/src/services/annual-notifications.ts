import { api } from './api'
import type {
  AnnualNotificationsResponse,
  AppNotification,
} from '../types/notification'

export async function getAnnualNotifications(): Promise<AnnualNotificationsResponse> {
  const { data } = await api.get<AnnualNotificationsResponse>(
    '/annual-notifications',
  )
  return data
}

export async function markAnnualNotificationRead(
  id: string,
): Promise<AppNotification> {
  const { data } = await api.patch<AppNotification>(
    `/annual-notifications/${id}/read`,
  )
  return data
}
