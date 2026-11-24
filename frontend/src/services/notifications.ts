import { api } from './api'
import type {
  FollowUpNotification,
  FollowUpNotificationsResponse,
} from '../types/notification'

export async function getNotifications(): Promise<FollowUpNotificationsResponse> {
  const { data } = await api.get<FollowUpNotificationsResponse>('/notifications')
  return data
}

export async function markNotificationRead(
  id: string,
): Promise<FollowUpNotification> {
  const { data } = await api.patch<FollowUpNotification>(
    `/notifications/${id}/read`,
  )
  return data
}
