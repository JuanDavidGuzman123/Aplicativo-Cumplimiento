import { ReplaySubject, type Subscription } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExternalDataCacheService } from './external-data.cache.service.js'
import type {
  ExternalAnnualMapping,
  ExternalAnnualRow,
  ExternalImportHeader,
  ExternalStreamEvent,
  ExternalSubscriptionStatus,
  ExternalSyncStats,
} from './types.js'

const NOW = '2026-11-25T10:00:00.000Z'

function row(
  id: string,
  overrides: Partial<ExternalAnnualRow> = {},
): ExternalAnnualRow {
  return {
    id,
    code: id,
    nit: null,
    businessName: `Contraparte ${id}`,
    status: 'ACTIVE',
    requiresSemiannualFollowUp: null,
    filingDate: null,
    filingYear: null,
    dueDiligenceType: null,
    observations: null,
    updatedThisYear: false,
    annualStatus: 'PENDING',
    sourceFileName: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function stats(overrides: Partial<ExternalSyncStats> = {}): ExternalSyncStats {
  return {
    totalRows: 4,
    validRows: 4,
    ignoredRows: 0,
    errorRows: 0,
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    ...overrides,
  }
}

function successInput(
  rows: ExternalAnnualRow[],
  overrides: Partial<Parameters<ExternalDataCacheService['setSuccess']>[0]> = {},
): Parameters<ExternalDataCacheService['setSuccess']>[0] {
  return {
    rows,
    mapping: { code: 'A' } satisfies ExternalAnnualMapping,
    mappingErrors: [],
    headers: [{ value: 'A', label: 'Código' }] satisfies ExternalImportHeader[],
    version: 'v1',
    fileName: 'base.xlsx',
    sourceName: 'Base anual',
    sourceUrl: null,
    lastModifiedDateTime: '2026-11-24T10:00:00.000Z',
    stats: stats(),
    ...overrides,
  }
}

const subscription: ExternalSubscriptionStatus = {
  state: 'active',
  id: 'subscription-1',
  expiresAt: '2026-12-01T00:00:00.000Z',
  message: 'Suscripción activa',
}

describe('ExternalDataCacheService', () => {
  let eventsSubject: ReplaySubject<ExternalStreamEvent>
  let subscriptions: Subscription[]

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    eventsSubject = new ReplaySubject<ExternalStreamEvent>()
    subscriptions = []
  })

  afterEach(() => {
    subscriptions.forEach((item) => item.unsubscribe())
    vi.useRealTimers()
  })

  function createService() {
    const service = new ExternalDataCacheService(eventsSubject)
    const events: ExternalStreamEvent[] = []
    subscriptions.push(
      service.events.subscribe((event) => {
        events.push(event)
      }),
    )

    return { service, events }
  }

  it('expone un estado inicial completo', () => {
    const { service, events } = createService()

    expect(service.getStatus()).toEqual({
      source: 'arriendos',
      enabled: false,
      configured: false,
      connection: 'disabled',
      freshness: 'never',
      sourceName: null,
      sourceUrl: null,
      version: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastChangeAt: null,
      lastError: null,
      rowCount: 0,
      mappingErrors: [],
      subscription: {
        state: 'disabled',
        id: null,
        expiresAt: null,
        message: null,
      },
      webhookConfigured: false,
      pollMs: 900000,
      serverNow: NOW,
    })
    expect(service.getSnapshot()).toBeNull()
    expect(events).toEqual([])
  })

  it('inicializa la fuente deshabilitada', () => {
    const { service, events } = createService()

    service.initialize(
      {
        enabled: false,
        configured: true,
        webhookConfigured: true,
        pollMs: 1234,
      },
      'colocadores',
    )

    expect(service.getStatus('colocadores')).toMatchObject({
      source: 'colocadores',
      enabled: false,
      configured: true,
      webhookConfigured: true,
      pollMs: 1234,
      connection: 'disabled',
      freshness: 'never',
      serverNow: NOW,
    })
    expect(events.at(-1)).toMatchObject({
      type: 'status',
      source: 'colocadores',
    })
  })

  it('inicializa una fuente habilitada y configurada como conectando', () => {
    const { service, events } = createService()

    service.initialize({
      enabled: true,
      configured: true,
      webhookConfigured: true,
      pollMs: 2000,
    })

    expect(service.getStatus()).toMatchObject({
      enabled: true,
      configured: true,
      connection: 'connecting',
      freshness: 'never',
      webhookConfigured: true,
      pollMs: 2000,
    })
    expect(events.at(-1)?.type).toBe('status')
  })

  it('inicializa una fuente habilitada pero no configurada', () => {
    const { service } = createService()

    service.initialize({
      enabled: true,
      configured: false,
      webhookConfigured: false,
      pollMs: 900000,
    })

    expect(service.getStatus()).toMatchObject({
      enabled: true,
      configured: false,
      connection: 'unconfigured',
      freshness: 'never',
      webhookConfigured: false,
    })
  })

  it('conserva la frescura al reinicializar una fuente con snapshot', () => {
    const { service } = createService()

    service.setSuccess(successInput([row('A')]))
    expect(service.getStatus().freshness).toBe('fresh')

    service.initialize({
      enabled: true,
      configured: true,
      webhookConfigured: false,
      pollMs: 3000,
    })
    expect(service.getStatus().freshness).toBe('fresh')

    service.setError('fallo de lectura')
    expect(service.getStatus().freshness).toBe('stale')

    service.initialize({
      enabled: true,
      configured: true,
      webhookConfigured: false,
      pollMs: 3000,
    })
    expect(service.getStatus().freshness).toBe('stale')
  })

  it('marca sincronización conectando o conectada según exista snapshot', () => {
    const { service, events } = createService()

    service.setSyncing()
    expect(service.getStatus()).toMatchObject({
      connection: 'connecting',
      freshness: 'never',
      lastAttemptAt: NOW,
      lastError: null,
      serverNow: NOW,
    })
    expect(events.at(-1)?.type).toBe('status')

    service.setSuccess(successInput([row('A')]))
    const lastChangeAt = service.getStatus().lastChangeAt
    events.length = 0

    service.setSyncing('colocadores')
    expect(service.getStatus('colocadores')).toMatchObject({
      source: 'colocadores',
      connection: 'connecting',
      lastAttemptAt: NOW,
    })

    service.setSyncing()
    expect(service.getStatus()).toMatchObject({
      connection: 'connected',
      lastAttemptAt: NOW,
      lastError: null,
      lastChangeAt,
    })
    expect(events.at(-1)).toMatchObject({
      type: 'status',
      source: 'arriendos',
    })
  })

  it('calcula altas, cambios, sin cambios y bajas al guardar un éxito', () => {
    const { service } = createService()

    service.setSuccess(
      successInput([row('A'), row('B'), row('C'), row('D')], {
        version: 'v1',
      }),
    )

    const result = service.setSuccess(
      successInput(
        [
          row('A', { businessName: 'Contraparte A actualizada' }),
          row('B'),
          row('E'),
        ],
        {
          version: 'v2',
          stats: stats({ totalRows: 3, validRows: 3 }),
        },
      ),
    )

    expect(result).toEqual({
      totalRows: 3,
      validRows: 3,
      ignoredRows: 0,
      errorRows: 0,
      added: 1,
      updated: 1,
      unchanged: 1,
      removed: 2,
    })
  })

  it('publica updated al cambiar la versión y status cuando no cambia', () => {
    const { service, events } = createService()

    service.setSuccess(successInput([row('A'), row('B')], { version: 'v1' }))
    expect(events.at(-1)?.type).toBe('updated')
    expect(events.at(-1)?.changes).toMatchObject({ added: 2 })

    const changedRows = [
      row('A', { businessName: 'Contraparte A actualizada' }),
      row('B'),
      row('C'),
    ]
    service.setSuccess(successInput(changedRows, { version: 'v2' }))
    expect(events.at(-1)?.type).toBe('updated')
    expect(events.at(-1)?.changes).toEqual(stats({
      added: 1,
      updated: 1,
      unchanged: 1,
      removed: 0,
    }))

    const lastChangeAt = service.getStatus().lastChangeAt
    service.setSuccess(successInput(changedRows, { version: 'v2' }))
    expect(events.at(-1)?.type).toBe('status')
    expect(events.at(-1)?.changes).toEqual(stats({
      added: 0,
      updated: 0,
      unchanged: 3,
      removed: 0,
    }))
    expect(service.getStatus().lastChangeAt).toBe(lastChangeAt)
  })

  it('devuelve copias defensivas del estado tras un éxito', () => {
    const { service } = createService()

    service.setSuccess(successInput([row('A')], {
      mappingErrors: ['error de mapeo'],
    }))

    const status = service.getStatus()
    status.mappingErrors.push('otro error')
    status.subscription.state = 'expired'
    status.subscription.id = 'subscription-modificada'

    expect(service.getStatus().mappingErrors).toEqual(['error de mapeo'])
    expect(service.getStatus().subscription).toEqual({
      state: 'disabled',
      id: null,
      expiresAt: null,
      message: null,
    })
    expect(service.getSnapshot()).toMatchObject({
      version: 'v1',
      fileName: 'base.xlsx',
      sourceName: 'Base anual',
      stats: stats({ added: 1 }),
    })
  })

  it('registra errores con y sin snapshot', () => {
    const { service, events } = createService()

    service.setError('sin snapshot', 'clientes')
    expect(service.getStatus('clientes')).toMatchObject({
      source: 'clientes',
      connection: 'error',
      freshness: 'error',
      lastAttemptAt: NOW,
      lastError: 'sin snapshot',
      serverNow: NOW,
    })
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      source: 'clientes',
    })

    service.setSuccess(
      successInput([row('A')], { source: 'colocadores' }),
    )
    events.length = 0

    service.setError('con snapshot', 'colocadores')
    expect(service.getStatus('colocadores')).toMatchObject({
      connection: 'degraded',
      freshness: 'stale',
      rowCount: 1,
      version: 'v1',
      lastError: 'con snapshot',
    })
    expect(events.at(-1)?.type).toBe('error')
  })

  it('registra fuentes no configuradas con y sin snapshot', () => {
    const { service, events } = createService()

    service.setUnconfigured('sin configuración')
    expect(service.getStatus()).toMatchObject({
      source: 'arriendos',
      connection: 'unconfigured',
      freshness: 'never',
      lastAttemptAt: NOW,
      lastError: 'sin configuración',
    })
    expect(events.at(-1)?.type).toBe('status')

    service.setSuccess(successInput([row('A')]))
    events.length = 0

    service.setUnconfigured('configuración retirada')
    expect(service.getStatus()).toMatchObject({
      connection: 'unconfigured',
      freshness: 'stale',
      rowCount: 1,
      lastError: 'configuración retirada',
    })
    expect(events.at(-1)?.type).toBe('status')
  })

  it('actualiza el estado de suscripción sin compartir referencias', () => {
    const { service, events } = createService()
    const input = { ...subscription }

    service.setSubscriptionStatus(input, 'clientes')

    input.id = 'subscription-modificada'
    input.message = 'mensaje modificado'

    expect(service.getStatus('clientes').subscription).toEqual(subscription)
    expect(events.at(-1)).toMatchObject({
      type: 'status',
      source: 'clientes',
      status: {
        source: 'clientes',
        subscription,
      },
    })
  })

  it('aísla snapshots, estados y eventos por fuente', () => {
    const { service, events } = createService()

    service.initialize(
      {
        enabled: true,
        configured: true,
        webhookConfigured: false,
        pollMs: 1000,
      },
      'arriendos',
    )
    service.initialize(
      {
        enabled: false,
        configured: true,
        webhookConfigured: true,
        pollMs: 2000,
      },
      'colocadores',
    )
    service.setSuccess(
      successInput([row('C')], {
        source: 'clientes',
        version: 'v-clientes',
      }),
    )
    service.setError('fallo exclusivo de clientes', 'clientes')

    expect(service.getStatus('arriendos')).toMatchObject({
      source: 'arriendos',
      connection: 'connecting',
      freshness: 'never',
      pollMs: 1000,
      lastError: null,
    })
    expect(service.getStatus('colocadores')).toMatchObject({
      source: 'colocadores',
      connection: 'disabled',
      freshness: 'never',
      pollMs: 2000,
    })
    expect(service.getStatus('clientes')).toMatchObject({
      source: 'clientes',
      connection: 'degraded',
      freshness: 'stale',
      rowCount: 1,
      version: 'v-clientes',
      lastError: 'fallo exclusivo de clientes',
    })
    expect(service.getSnapshot('arriendos')).toBeNull()
    expect(service.getSnapshot('colocadores')).toBeNull()
    expect(service.getSnapshot('clientes')).toMatchObject({
      version: 'v-clientes',
    })
    expect(events.map((event) => event.source)).toEqual([
      'arriendos',
      'colocadores',
      'clientes',
      'clientes',
    ])
  })
})
