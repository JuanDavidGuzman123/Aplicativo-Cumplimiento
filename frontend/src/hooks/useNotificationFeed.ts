import { useCallback, useEffect, useState } from 'react'
import { getApiErrorMessage } from '../utils/api-error'

type NotificationFeedOptions<T> = {
  load: () => Promise<{ data: T[]; unreadCount: number }>
  markRead: (id: string) => Promise<T>
  refreshIntervalMs?: number
}

export function useNotificationFeed<
  T extends { id: string; read: boolean },
>({
  load,
  markRead,
  refreshIntervalMs = 60_000,
}: NotificationFeedOptions<T>) {
  const [notifications, setNotifications] = useState<T[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const result = await load()
      setNotifications(result.data)
      setUnreadCount(result.unreadCount)
      setError('')
    } catch (loadError) {
      setError(
        getApiErrorMessage(
          loadError,
          'No fue posible cargar las notificaciones',
        ),
      )
    } finally {
      setIsLoading(false)
    }
  }, [load])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
    const interval = window.setInterval(() => {
      void refresh()
    }, refreshIntervalMs)

    return () => {
      window.clearInterval(interval)
    }
  }, [refresh, refreshIntervalMs])

  const markAsRead = useCallback(
    async (notification: T) => {
      if (markingId || notification.read) {
        return true
      }

      setMarkingId(notification.id)
      setError('')

      try {
        const updated = await markRead(notification.id)
        setNotifications((current) =>
          current.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        )
        setUnreadCount((current) => Math.max(0, current - 1))
        return true
      } catch (markError) {
        setError(
          getApiErrorMessage(
            markError,
            'No fue posible marcar la notificación como leída',
          ),
        )
        return false
      } finally {
        setMarkingId(null)
      }
    },
    [markRead, markingId],
  )

  return {
    notifications,
    unreadCount,
    isLoading,
    markingId,
    error,
    refresh,
    markAsRead,
    setIsLoading,
  }
}
