import { useEffect, useRef, useState } from 'react'
import {
  getExternalStatus,
  subscribeExternalEvents,
} from '../services/external-data'
import type {
  ExternalDataStatus,
  ExternalSource,
} from '../types/external-data'

const RECONNECT_MS = 5000

export function useExternalDataEvents(
  onUpdated: () => void,
  source: ExternalSource = 'arriendos',
) {
  const [status, setStatus] = useState<ExternalDataStatus | null>(null)
  const [connected, setConnected] = useState(false)
  const onUpdatedRef = useRef(onUpdated)
  const sourceRef = useRef(source)

  useEffect(() => {
    onUpdatedRef.current = onUpdated
  }, [onUpdated])

  useEffect(() => {
    sourceRef.current = source
  }, [source])

  useEffect(() => {
    const lifecycle = new AbortController()
    let unsubscribe: (() => void) | null = null
    let reconnectTimer: number | null = null

    const loadStatus = () => {
      void getExternalStatus(sourceRef.current)
        .then((next) => {
          if (
            !lifecycle.signal.aborted &&
            next.source === sourceRef.current
          ) {
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
        source: sourceRef.current,
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
          if (
            lifecycle.signal.aborted ||
            event.source !== sourceRef.current
          ) {
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
  }, [source])

  const visibleStatus = status?.source === source ? status : null

  return {
    status: visibleStatus,
    setStatus,
    connected:
      connected && (visibleStatus !== null || status === null),
  }
}
