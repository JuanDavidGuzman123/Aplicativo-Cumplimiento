import { useEffect, useRef, useState } from 'react'
import {
  getExternalStatus,
  subscribeExternalEvents,
} from '../services/external-data'
import type { ExternalDataStatus } from '../types/external-data'

const RECONNECT_MS = 5000

export function useExternalDataEvents(onUpdated: () => void) {
  const [status, setStatus] = useState<ExternalDataStatus | null>(null)
  const [connected, setConnected] = useState(false)
  const onUpdatedRef = useRef(onUpdated)

  useEffect(() => {
    onUpdatedRef.current = onUpdated
  }, [onUpdated])

  useEffect(() => {
    const lifecycle = new AbortController()
    let unsubscribe: (() => void) | null = null
    let reconnectTimer: number | null = null

    const loadStatus = () => {
      void getExternalStatus()
        .then((next) => {
          if (!lifecycle.signal.aborted) {
            setStatus(next)
          }
        })
        .catch(() => undefined)
    }

    const scheduleReconnect = () => {
      if (lifecycle.signal.aborted || reconnectTimer !== null) {
        return
      }

      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        connect()
      }, RECONNECT_MS)
    }

    const connect = () => {
      if (lifecycle.signal.aborted) {
        return
      }

      unsubscribe = subscribeExternalEvents({
        onConnected: () => {
          if (!lifecycle.signal.aborted) {
            setConnected(true)
            loadStatus()
          }
        },
        onDisconnected: () => {
          if (!lifecycle.signal.aborted) {
            setConnected(false)
            scheduleReconnect()
          }
        },
        onEvent: (event) => {
          if (lifecycle.signal.aborted) {
            return
          }

          setStatus(event.status)

          if (event.type === 'updated') {
            onUpdatedRef.current()
          }
        },
      })
    }

    loadStatus()
    connect()

    return () => {
      lifecycle.abort()
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
      }
      unsubscribe?.()
    }
  }, [])

  return { status, setStatus, connected }
}
