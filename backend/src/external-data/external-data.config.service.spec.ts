import { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import { ExternalDataConfigService } from './external-data.config.service.js'

function createService(values: Record<string, unknown>) {
  const get = vi.fn((key: string) => values[key])
  return {
    service: new ExternalDataConfigService(
      { get } as unknown as ConfigService,
    ),
    get,
  }
}

const credentials = {
  EXTERNAL_DATA_ENABLED: true,
  MICROSOFT_TENANT_ID: 'tenant',
  MICROSOFT_CLIENT_ID: 'client',
  MICROSOFT_CLIENT_SECRET: 'secret',
  SHAREPOINT_DRIVE_ID: 'drive',
  SHAREPOINT_ITEM_ID: 'item',
}

describe('ExternalDataConfigService', () => {
  it('requiere todas las credenciales de lectura', () => {
    const complete = createService(credentials)
    expect(complete.service.readConfigured).toBe(true)

    const missing = createService({
      ...credentials,
      SHAREPOINT_ITEM_ID: '',
    })
    expect(missing.service.readConfigured).toBe(false)
  })

  it('exige URL pública y clientState suficientemente largo para webhook', () => {
    const complete = createService({
      ...credentials,
      EXTERNAL_WEBHOOK_PUBLIC_URL: 'https://api.test/api/',
      EXTERNAL_WEBHOOK_CLIENT_STATE: 'secreto-compartido-largo',
    })

    expect(complete.service.webhookUrl).toBe(
      'https://api.test/api',
    )
    expect(complete.service.webhookConfigured).toBe(true)

    const shortState = createService({
      ...credentials,
      EXTERNAL_WEBHOOK_PUBLIC_URL: 'https://api.test/api',
      EXTERNAL_WEBHOOK_CLIENT_STATE: 'corto',
    })
    expect(shortState.service.webhookConfigured).toBe(false)
  })

  it('aplica valores por defecto de Graph y polling', () => {
    const { service } = createService({})

    expect(service.graphBaseUrl).toBe(
      'https://graph.microsoft.com/v1.0',
    )
    expect(service.graphTimeoutMs).toBe(15000)
    expect(service.pollMs).toBe(900000)
    expect(service.debounceMs).toBe(2000)
    expect(service.maxRows).toBe(5000)
  })
})
