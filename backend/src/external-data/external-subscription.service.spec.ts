import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExternalDataCacheService } from './external-data.cache.service.js'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { ExternalSubscriptionService } from './external-subscription.service.js'
import { MicrosoftGraphService } from './microsoft-graph.service.js'
import type { ExternalGraphSubscription } from './types.js'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const TWO_DAYS_MS = 2 * DAY_MS
const NOW = new Date('2026-11-25T12:00:00.000Z')

type ConfigValues = {
  source: 'graph' | 'file'
  enabled: boolean
  webhookConfigured: boolean
  webhookUrl: string
}

function createService(values: Partial<ConfigValues> = {}) {
  const configValues: ConfigValues = {
    source: 'graph',
    enabled: true,
    webhookConfigured: true,
    webhookUrl: 'https://api.test/api',
    ...values,
  }
  const config = configValues as unknown as ExternalDataConfigService
  const graphValues = {
    resource: '/drives/drive/items/item',
    listSubscriptions: vi.fn(
      async (): Promise<ExternalGraphSubscription[]> => [],
    ),
    createSubscription: vi.fn(async (expirationDateTime: string) => ({
      id: 'sub-new',
      resource: '/drives/drive/items/item',
      notificationUrl: `${configValues.webhookUrl}/external-data/webhook`,
      expirationDateTime,
      clientState: null,
    })),
    renewSubscription: vi.fn(
      async (id: string, expirationDateTime: string) => ({
        id,
        resource: '/drives/drive/items/item',
        notificationUrl: `${configValues.webhookUrl}/external-data/webhook`,
        expirationDateTime,
        clientState: null,
      }),
    ),
  }
  const graph = graphValues as unknown as MicrosoftGraphService
  const cacheValues = { setSubscriptionStatus: vi.fn() }
  const cache = cacheValues as unknown as ExternalDataCacheService

  return {
    service: new ExternalSubscriptionService(config, graph, cache),
    configValues,
    graph: graphValues,
    cache: cacheValues,
  }
}

function subscription(
  overrides: Partial<ExternalGraphSubscription> = {},
): ExternalGraphSubscription {
  return {
    id: 'sub-active',
    resource: '/drives/drive/items/item',
    notificationUrl: 'https://api.test/api/external-data/webhook',
    expirationDateTime: new Date(Date.now() + DAY_MS).toISOString(),
    clientState: null,
    ...overrides,
  }
}

describe('ExternalSubscriptionService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('compone la URL de notificación desde la URL pública', () => {
    const { service } = createService()

    expect(service.notificationUrl).toBe(
      'https://api.test/api/external-data/webhook',
    )
  })

  it('deshabilita la suscripción para la fuente local sin usar Graph', async () => {
    const { service, graph, cache } = createService({
      source: 'file',
      webhookConfigured: false,
    })

    service.onModuleInit()

    expect(cache.setSubscriptionStatus).toHaveBeenCalledWith({
      state: 'disabled',
      id: null,
      expiresAt: null,
      message: 'Fuente local: no requiere suscripción de Microsoft Graph',
    })
    expect(vi.getTimerCount()).toBe(0)

    await expect(service.ensureSubscription()).resolves.toBeUndefined()
    expect(graph.listSubscriptions).not.toHaveBeenCalled()
    expect(graph.createSubscription).not.toHaveBeenCalled()
  })

  it('marca el webhook como deshabilitado o no configurado', () => {
    const disabled = createService({
      enabled: false,
      webhookConfigured: false,
    })
    disabled.service.onModuleInit()

    expect(disabled.cache.setSubscriptionStatus).toHaveBeenCalledWith({
      state: 'disabled',
      id: null,
      expiresAt: null,
      message: null,
    })

    const unconfigured = createService({ webhookConfigured: false })
    unconfigured.service.onModuleInit()

    expect(unconfigured.cache.setSubscriptionStatus).toHaveBeenCalledWith({
      state: 'unconfigured',
      id: null,
      expiresAt: null,
      message: 'Falta la URL pública o el clientState del webhook',
    })
    expect(unconfigured.graph.listSubscriptions).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('prepara la suscripción y crea un temporizador horario al iniciar', async () => {
    const { service, graph, cache } = createService()
    graph.listSubscriptions.mockResolvedValue([subscription()])

    service.onModuleInit()
    await vi.advanceTimersByTimeAsync(0)

    expect(graph.listSubscriptions).toHaveBeenCalledTimes(1)
    expect(cache.setSubscriptionStatus).toHaveBeenLastCalledWith({
      state: 'active',
      id: 'sub-active',
      expiresAt: subscription().expirationDateTime,
      message: null,
    })
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(graph.listSubscriptions).toHaveBeenCalledTimes(2)
  })

  it('no hace nada en ensureSubscription con fuente local', async () => {
    const { service, graph, cache } = createService({ source: 'file' })

    await expect(service.ensureSubscription()).resolves.toBeUndefined()

    expect(graph.listSubscriptions).not.toHaveBeenCalled()
    expect(cache.setSubscriptionStatus).not.toHaveBeenCalled()
  })

  it('registra el estado no configurado en ensureSubscription', async () => {
    const { service, graph, cache } = createService({
      webhookConfigured: false,
    })

    await service.ensureSubscription()

    expect(cache.setSubscriptionStatus).toHaveBeenCalledWith({
      state: 'unconfigured',
      id: null,
      expiresAt: null,
      message: 'Webhook de Microsoft Graph no configurado',
    })
    expect(graph.listSubscriptions).not.toHaveBeenCalled()
  })

  it('no crea ni renueva una suscripción activa', async () => {
    const { service, graph, cache } = createService()
    const active = subscription()
    graph.listSubscriptions.mockResolvedValue([active])

    await service.ensureSubscription()

    expect(cache.setSubscriptionStatus).toHaveBeenCalledWith({
      state: 'active',
      id: active.id,
      expiresAt: active.expirationDateTime,
      message: null,
    })
    expect(graph.createSubscription).not.toHaveBeenCalled()
    expect(graph.renewSubscription).not.toHaveBeenCalled()
  })

  it('renueva la suscripción por dos días cuando está por vencer', async () => {
    const { service, graph } = createService()
    graph.listSubscriptions.mockResolvedValue([
      subscription({
        expirationDateTime: new Date(Date.now() + HOUR_MS).toISOString(),
      }),
    ])

    await service.ensureSubscription()

    expect(graph.renewSubscription).toHaveBeenCalledWith(
      'sub-active',
      new Date(Date.now() + TWO_DAYS_MS).toISOString(),
    )
    expect(graph.createSubscription).not.toHaveBeenCalled()
  })

  it('crea la suscripción por dos días cuando no hay una coincidente', async () => {
    const { service, graph } = createService()
    graph.listSubscriptions.mockResolvedValue([
      subscription({
        notificationUrl: 'https://otro.test/external-data/webhook',
      }),
    ])

    await service.ensureSubscription()

    expect(graph.createSubscription).toHaveBeenCalledWith(
      new Date(Date.now() + TWO_DAYS_MS).toISOString(),
    )
    expect(graph.renewSubscription).not.toHaveBeenCalled()
  })

  it('solo reacciona a eventos de ciclo de vida relevantes y configurados', async () => {
    const configured = createService()
    const ensure = vi
      .spyOn(configured.service, 'ensureSubscription')
      .mockResolvedValue(undefined)

    await configured.service.handleLifecycleEvent('updated')
    expect(ensure).not.toHaveBeenCalled()

    await configured.service.handleLifecycleEvent('subscriptionRemoved')
    await configured.service.handleLifecycleEvent('missed')
    await configured.service.handleLifecycleEvent(
      'reauthorizationRequired',
    )
    expect(ensure).toHaveBeenCalledTimes(3)

    const unconfigured = createService({ webhookConfigured: false })
    const unconfiguredEnsure = vi
      .spyOn(unconfigured.service, 'ensureSubscription')
      .mockResolvedValue(undefined)

    await unconfigured.service.handleLifecycleEvent('missed')
    expect(unconfiguredEnsure).not.toHaveBeenCalled()
  })

  it('limpia el temporizador al destruir el módulo', async () => {
    const { service, graph } = createService()
    graph.listSubscriptions.mockResolvedValue([subscription()])

    service.onModuleInit()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)

    service.onModuleDestroy()
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(HOUR_MS * 2)
    expect(graph.listSubscriptions).toHaveBeenCalledTimes(1)
  })
})
