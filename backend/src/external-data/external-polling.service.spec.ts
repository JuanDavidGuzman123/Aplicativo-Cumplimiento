import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { ExternalDataService } from './external-data.service.js'
import { ExternalPollingService } from './external-polling.service.js'

type ConfigValues = {
  enabled: boolean
  readConfigured: boolean
  colocadoresReadConfigured: boolean
  clientesReadConfigured: boolean
  pollMs: number
}

function createService(values: Partial<ConfigValues> = {}) {
  const configValues: ConfigValues = {
    enabled: true,
    readConfigured: true,
    colocadoresReadConfigured: true,
    clientesReadConfigured: true,
    pollMs: 1000,
    ...values,
  }
  const config = configValues as unknown as ExternalDataConfigService
  const refresh = vi.fn(() => Promise.resolve())
  const dataService = { refresh } as unknown as ExternalDataService

  return {
    service: new ExternalPollingService(config, dataService),
    refresh,
  }
}

describe('ExternalPollingService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('no crea refreshes cuando el polling está deshabilitado', async () => {
    const { service, refresh } = createService({ enabled: false })

    service.onModuleInit()
    await vi.advanceTimersByTimeAsync(5000)

    expect(refresh).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('programa un intervalo por cada fuente configurada', async () => {
    const { service, refresh } = createService()

    service.onModuleInit()
    expect(vi.getTimerCount()).toBe(3)

    await vi.advanceTimersByTimeAsync(1000)

    expect(refresh.mock.calls).toEqual([
      ['polling de respaldo', 'arriendos'],
      ['polling de respaldo', 'colocadores'],
      ['polling de respaldo', 'clientes'],
    ])
  })

  it('omite las fuentes que no están configuradas', async () => {
    const { service, refresh } = createService({
      readConfigured: true,
      colocadoresReadConfigured: false,
      clientesReadConfigured: true,
    })

    service.onModuleInit()
    expect(vi.getTimerCount()).toBe(2)

    await vi.advanceTimersByTimeAsync(1000)

    expect(refresh.mock.calls).toEqual([
      ['polling de respaldo', 'arriendos'],
      ['polling de respaldo', 'clientes'],
    ])
  })

  it('respeta pollMs antes de invocar el refresh de respaldo', async () => {
    const { service, refresh } = createService({
      readConfigured: true,
      colocadoresReadConfigured: false,
      clientesReadConfigured: false,
      pollMs: 2500,
    })

    service.onModuleInit()
    await vi.advanceTimersByTimeAsync(2499)
    expect(refresh).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledWith(
      'polling de respaldo',
      'arriendos',
    )
  })

  it('limpia los intervalos al destruir el módulo', async () => {
    const { service, refresh } = createService()

    service.onModuleInit()
    expect(vi.getTimerCount()).toBe(3)

    service.onModuleDestroy()
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(5000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('maneja un refresh rechazado sin propagar la excepción', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined)
    const { service, refresh } = createService({
      readConfigured: true,
      colocadoresReadConfigured: false,
      clientesReadConfigured: false,
    })
    refresh.mockRejectedValueOnce(new Error('falló el refresco'))

    service.onModuleInit()
    await vi.advanceTimersByTimeAsync(1000)

    expect(warn).toHaveBeenCalledWith(
      'No se pudo ejecutar el polling de arriendos: falló el refresco',
    )
  })
})
