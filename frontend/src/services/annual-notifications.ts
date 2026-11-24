import { api } from './api'
import type {
  AnnualNotification,
  AnnualNotificationsResponse,
} from '../types/notification'

export async function getAnnualNotifications(): Promise<AnnualNotificationsResponse> {
  const { data } = await api.get<AnnualNotificationsResponse>(
    '/annual-notifications',
  )
  return data
}

export async function markAnnualNotificationRead(
  id: string,
): Promise<AnnualNotification> {
  const { data } = await api.patch<AnnualNotification>(
    `/annual-notifications/${id}/read`,
  )
  return data
}
