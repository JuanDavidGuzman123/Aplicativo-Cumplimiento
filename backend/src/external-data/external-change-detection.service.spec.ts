import { Logger, UnauthorizedException } from '@nestjs/common'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import { ExternalChangeDetectionService } from './external-change-detection.service.js'
import type { ExternalDataConfigService } from './external-data.config.service.js'
import type { ExternalDataService } from './external-data.service.js'
import type { ExternalSubscriptionService } from './external-subscription.service.js'

const CLIENT_STATE = 'secreto-compartido-largo'
const DEBOUNCE_MS = 1000

type ConfigValues = {
  source: 'graph' | 'file'
  webhookClientState: string
  debounceMs: number
}

function createService(values: Partial<ConfigValues> = {}) {
  const configValues: ConfigValues = {
    source: 'graph',
    webhookClientState: CLIENT_STATE,
    debounceMs: DEBOUNCE_MS,
    ...values,
  }
  const config = configValues as unknown as ExternalDataConfigService
  const refresh = vi.fn(async () => undefined)
  const dataService = { refresh } as unknown as ExternalDataService
  const handleLifecycleEvent = vi.fn(async () => undefined)
  const subscription = {
    handleLifecycleEvent,
  } as unknown as ExternalSubscriptionService

  return {
    service: new ExternalChangeDetectionService(
      config,
      dataService,
      subscription,
    ),
    refresh,
    handleLifecycleEvent,
  }
}

function notification(overrides: Record<string, unknown> = {}) {
  return {
    clientState: CLIENT_STATE,
    ...overrides,
  }
}

function payload(...notifications: Record<string, unknown>[]) {
  return { value: notifications }
}

describe('ExternalChangeDetectionService', () => {
  let warnSpy: MockInstance
  let errorSpy: MockInstance

  beforeEach(() => {
    vi.useFakeTimers()
    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined)
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('ignora el payload cuando la fuente es local', async () => {
    const { service, refresh, handleLifecycleEvent } = createService({
      source: 'file',
    })

    await service.handleWebhook(
      payload(notification({ changeType: 'updated' })),
    )

    expect(refresh).not.toHaveBeenCalled()
    expect(handleLifecycleEvent).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    null,
    'payload',
    42,
    {},
    { value: 'updated' },
    { value: [] },
  ])('registra una advertencia para el payload %#', async (invalid) => {
    const { service, refresh, handleLifecycleEvent } = createService()

    await service.handleWebhook(invalid)

    expect(warnSpy).toHaveBeenCalledWith(
      'Notificación de Microsoft Graph sin entradas',
    )
    expect(refresh).not.toHaveBeenCalled()
    expect(handleLifecycleEvent).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rechaza notificaciones con un clientState inválido', async () => {
    const { service, refresh, handleLifecycleEvent } = createService()

    await expect(
      service.handleWebhook(
        payload(notification({ clientState: 'otro-estado', changeType: 'updated' })),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException)

    expect(refresh).not.toHaveBeenCalled()
    expect(handleLifecycleEvent).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['updated', 'created'])(
    'programa un refresco diferido para changeType %s',
    async (changeType) => {
      const { service, refresh } = createService()

      await service.handleWebhook(
        payload(
          notification({
            clientNotificationId: `id-${changeType}`,
            changeType,
          }),
        ),
      )

      expect(refresh).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1)
      expect(refresh).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(refresh).toHaveBeenCalledWith('cambio en Microsoft Graph')
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('ignora notificaciones duplicadas dentro del mismo payload', async () => {
    const { service, refresh, handleLifecycleEvent } = createService()
    const duplicated = notification({
      clientNotificationId: 'duplicada',
      lifecycle: { event: 'subscriptionRemoved' },
    })

    await service.handleWebhook(payload(duplicated, { ...duplicated }))

    expect(handleLifecycleEvent).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('no programa refresco para un changeType no relacionado', async () => {
    const { service, refresh } = createService()

    await service.handleWebhook(
      payload(
        notification({
          clientNotificationId: 'eliminada',
          changeType: 'deleted',
        }),
      ),
    )

    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('procesa eventos de ciclo de vida sin programar refresco', async () => {
    const { service, refresh, handleLifecycleEvent } = createService()

    await service.handleWebhook(
      payload(
        notification({
          clientNotificationId: 'ciclo-de-vida',
          changeType: 'updated',
          lifecycle: { event: 'missed' },
        }),
      ),
    )

    expect(handleLifecycleEvent).toHaveBeenCalledTimes(1)
    expect(handleLifecycleEvent).toHaveBeenCalledWith('missed')
    expect(refresh).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('procesa notificaciones mixtas de ciclo de vida y cambio', async () => {
    const { service, refresh, handleLifecycleEvent } = createService()

    await service.handleWebhook(
      payload(
        notification({
          clientNotificationId: 'ciclo-mixto',
          lifecycle: { event: 'reauthorizationRequired' },
        }),
        notification({
          clientNotificationId: 'cambio-mixto',
          changeType: 'created',
        }),
      ),
    )

    expect(handleLifecycleEvent).toHaveBeenCalledTimes(1)
    expect(handleLifecycleEvent).toHaveBeenCalledWith(
      'reauthorizationRequired',
    )
    expect(refresh).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledWith('cambio en Microsoft Graph')
  })

  it('maneja un refresco rechazado sin propagar la excepción', async () => {
    const { service, refresh } = createService()
    refresh.mockRejectedValueOnce(new Error('falló el refresco'))

    await service.handleWebhook(
      payload(
        notification({
          clientNotificationId: 'refresco-rechazado',
          changeType: 'updated',
        }),
      ),
    )
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

    expect(errorSpy).toHaveBeenCalledWith(
      'No se pudo refrescar tras la notificación: falló el refresco',
    )
  })

  it('dedupe notificaciones por clientNotificationId', async () => {
    const { service, refresh } = createService()
    const first = notification({
      clientNotificationId: 'mismo-id',
      changeType: 'updated',
      resource: '/drives/uno',
    })

    await service.handleWebhook(payload(first))
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(refresh).toHaveBeenCalledTimes(1)

    await service.handleWebhook(
      payload({
        ...first,
        changeType: 'created',
        resource: '/drives/dos',
      }),
    )
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('dedupe notificaciones por hash cuando no hay clientNotificationId', async () => {
    const { service, refresh } = createService()
    const first = notification({
      changeType: 'updated',
      resource: '/drives/uno',
      subscriptionId: 'suscripcion',
    })

    await service.handleWebhook(payload(first))
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(refresh).toHaveBeenCalledTimes(1)

    await service.handleWebhook(payload({ ...first }))
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(refresh).toHaveBeenCalledTimes(1)

    await service.handleWebhook(
      payload({ ...first, resource: '/drives/otro' }),
    )
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('limpia el temporizador pendiente al destruir el módulo', async () => {
    const { service, refresh } = createService()

    await service.handleWebhook(
      payload(
        notification({
          clientNotificationId: 'pendiente',
          changeType: 'updated',
        }),
      ),
    )
    expect(vi.getTimerCount()).toBe(1)

    service.onModuleDestroy()

    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(refresh).not.toHaveBeenCalled()
  })
})
