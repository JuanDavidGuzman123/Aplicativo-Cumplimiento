import { api } from './api'
import type {
  AppNotification,
  NotificationsResponse,
} from '../types/notification'

function asAppNotification(
  notification: AppNotification,
): AppNotification {
  return {
    ...notification,
    source: 'SEMESTRAL',
    annualCounterparty: null,
  }
}

export async function getNotifications(): Promise<NotificationsResponse> {
  const { data } = await api.get<NotificationsResponse>('/notifications')
  return {
    ...data,
    data: data.data.map(asAppNotification),
  }
}

export async function markNotificationRead(
  id: string,
): Promise<AppNotification> {
  const { data } = await api.patch<AppNotification>(
    `/notifications/${id}/read`,
  )
  return asAppNotification(data)
}
