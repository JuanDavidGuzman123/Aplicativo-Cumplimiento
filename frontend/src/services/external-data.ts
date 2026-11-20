import { api } from './api'
import { getToken } from './auth-storage'
import type {
  ExternalAnnualListResponse,
  ExternalDataStatus,
  ExternalDueListResponse,
  ExternalListParams,
  ExternalStreamEvent,
  ExternalSummary,
} from '../types/external-data'

export async function getExternalSummary(): Promise<ExternalSummary> {
  const { data } = await api.get<ExternalSummary>(
    '/external-data/summary',
  )
  return data
}

export async function getExternalUpdates(
  params: ExternalListParams,
): Promise<ExternalAnnualListResponse> {
  const query = Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== '' && value !== undefined,
    ),
  )

  const { data } = await api.get<ExternalAnnualListResponse>(
    '/external-data',
    { params: query },
  )
  return data
}

export async function getExternalUpdatesDue(
  params: { page?: number; pageSize?: number } = {},
): Promise<ExternalDueListResponse> {
  const { data } = await api.get<ExternalDueListResponse>(
    '/external-data/updates-due',
    { params },
  )
  return data
}

export async function getExternalStatus(): Promise<ExternalDataStatus> {
  const { data } = await api.get<ExternalDataStatus>(
    '/external-data/status',
  )
  return data
}

export async function syncExternalData(): Promise<ExternalDataStatus> {
  const { data } = await api.post<ExternalDataStatus>(
    '/external-data/refresh',
  )
  return data
}

export function subscribeExternalEvents(options: {
  onEvent: (event: ExternalStreamEvent) => void
  onConnected?: () => void
  onDisconnected?: (error?: unknown) => void
}): () => void {
  const controller = new AbortController()
  const baseUrl = import.meta.env.VITE_API_URL ?? '/api'
  const token = getToken()
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Cache-Control': 'no-cache',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  void (async () => {
    try {
      const response = await fetch(
        `${baseUrl}/external-data/events`,
        {
          headers,
          signal: controller.signal,
          cache: 'no-store',
        },
      )

      if (!response.ok) {
        throw new Error(
          `No fue posible abrir el canal de actualizaciones (${response.status})`,
        )
      }

      if (!response.body) {
        throw new Error('El servidor no devolvió un canal de eventos')
      }

      options.onConnected?.()
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''

        for (const block of blocks) {
          const dataLine = block
            .split('\n')
            .find((line) => line.startsWith('data:'))

          if (!dataLine) {
            continue
          }

          const raw = dataLine.slice(5).trim()

          if (!raw) {
            continue
          }

          try {
            const event = JSON.parse(raw) as ExternalStreamEvent
            options.onEvent(event)
          } catch {
            continue
          }
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        options.onDisconnected?.(error)
      }
    }
  })()

  return () => controller.abort()
}
