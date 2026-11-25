import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DelegatedTokenStore } from './delegated-token.store.js'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { MicrosoftGraphService } from './microsoft-graph.service.js'

const GRAPH_BASE_URL = 'https://graph.test/v1.0'
const DRIVE_PATH = '/drives/drive%2Fid/items/item%2Fid'
const RESOURCE = '/drives/drive/id/items/item/id'

type ResponseOptions = {
  ok?: boolean
  status?: number
  statusText?: string
  retryAfter?: string | null
}

let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(body: unknown, options: ResponseOptions = {}) {
  const status = options.status ?? 200
  const ok = options.ok ?? (status >= 200 && status < 300)

  return {
    ok,
    status,
    statusText: options.statusText ?? (ok ? 'OK' : 'Error'),
    json: vi.fn(async () => body),
    headers: {
      get: vi.fn((name: string) =>
        name.toLowerCase() === 'retry-after'
          ? (options.retryAfter ?? null)
          : null,
      ),
    },
  }
}

function createConfig(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    MICROSOFT_TENANT_ID: 'tenant id',
    MICROSOFT_CLIENT_ID: 'client-id',
    MICROSOFT_CLIENT_SECRET: 'client-secret',
    MICROSOFT_REFRESH_TOKEN: '',
    SHAREPOINT_DRIVE_ID: 'drive/id',
    SHAREPOINT_ITEM_ID: 'item/id',
    EXTERNAL_GRAPH_BASE_URL: GRAPH_BASE_URL,
    EXTERNAL_GRAPH_TIMEOUT_MS: 15000,
    EXTERNAL_WEBHOOK_PUBLIC_URL: 'https://api.test/api/',
    EXTERNAL_WEBHOOK_CLIENT_STATE: 'shared-state-long',
    ...overrides,
  }
  const get = vi.fn((key: string) => values[key])

  return new ExternalDataConfigService({
    get,
  } as unknown as ConfigService)
}

function createService(
  configOverrides: Record<string, unknown> = {},
  storedRefreshToken = '',
) {
  const config = createConfig(configOverrides)
  const tokenStore = {
    read: vi.fn(async () => storedRefreshToken),
    write: vi.fn(async () => undefined),
  }

  return {
    service: new MicrosoftGraphService(
      config,
      tokenStore as unknown as DelegatedTokenStore,
    ),
    tokenStore,
  }
}

function fetchCall(index: number): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[index]

  if (!call) {
    throw new Error(`No hay llamada fetch ${index}`)
  }

  return {
    url: String(call[0]),
    init: (call[1] ?? {}) as RequestInit,
  }
}

function requestHeaders(init: RequestInit): Record<string, string> {
  return init.headers as Record<string, string>
}

function bodyParams(init: RequestInit): URLSearchParams {
  return init.body as URLSearchParams
}

function useToken(service: MicrosoftGraphService) {
  return vi
    .spyOn(service, 'getAccessToken')
    .mockResolvedValue('graph-token')
}

describe('MicrosoftGraphService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-25T12:00:00.000Z'))
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('codifica la ruta del workbook y deja el resource sin codificar', () => {
    const { service } = createService()

    expect(service.driveItemsPath).toBe(DRIVE_PATH)
    expect(service.resource).toBe(RESOURCE)
  })

  it('cachea el token de acceso mientras esté vigente', async () => {
    const { service, tokenStore } = createService()
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: 'token-1', expires_in: 3600 }),
    )

    await expect(service.getAccessToken()).resolves.toBe('token-1')
    await expect(service.getAccessToken()).resolves.toBe('token-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(tokenStore.read).toHaveBeenCalledTimes(1)
  })

  it('usa client credentials cuando no hay refresh token', async () => {
    const { service } = createService()
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: 'app-token', expires_in: 3600 }),
    )

    await expect(service.getAccessToken()).resolves.toBe('app-token')

    const { url, init } = fetchCall(0)
    const params = bodyParams(init)
    expect(url).toBe(
      'https://login.microsoftonline.com/tenant%20id/oauth2/v2.0/token',
    )
    expect(init.method).toBe('POST')
    expect(requestHeaders(init)).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    })
    expect(params.get('client_id')).toBe('client-id')
    expect(params.get('client_secret')).toBe('client-secret')
    expect(params.get('grant_type')).toBe('client_credentials')
    expect(params.get('scope')).toBe(
      'https://graph.microsoft.com/.default',
    )
  })

  it('usa el refresh token almacenado y persiste el token rotado', async () => {
    const { service, tokenStore } = createService(
      { MICROSOFT_REFRESH_TOKEN: 'refresh-no-usado' },
      'refresh-almacenado',
    )
    fetchMock.mockResolvedValue(
      jsonResponse({
        access_token: 'delegated-token',
        expires_in: 1800,
        refresh_token: 'refresh-rotado',
      }),
    )

    await expect(service.getAccessToken()).resolves.toBe(
      'delegated-token',
    )

    const params = bodyParams(fetchCall(0).init)
    expect(params.get('grant_type')).toBe('refresh_token')
    expect(params.get('refresh_token')).toBe('refresh-almacenado')
    expect(params.get('scope')).toBe(
      'https://graph.microsoft.com/Files.Read.All',
    )
    expect(tokenStore.write).toHaveBeenCalledWith('refresh-rotado')
  })

  it('rechaza un token de acceso ausente', async () => {
    const { service } = createService()
    fetchMock.mockResolvedValue(jsonResponse({ access_token: '' }))

    await expect(service.getAccessToken()).rejects.toThrow(
      ServiceUnavailableException,
    )
    await expect(service.getAccessToken()).rejects.toThrow(
      'Microsoft Graph no devolvió un token de acceso',
    )
  })

  it('rechaza una respuesta de autenticación fallida', async () => {
    const { service } = createService()
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'cliente inválido' } },
        { status: 401, statusText: 'Unauthorized' },
      ),
    )

    await expect(service.getAccessToken()).rejects.toThrow(
      'No fue posible autenticar con Microsoft Graph (401): cliente inválido',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('lista tablas y hojas con el token y las rutas esperadas', async () => {
    const { service } = createService()
    const tokenSpy = useToken(service)
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ value: [{ id: 't1', name: 'Tabla' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ value: [{ id: 'w1', name: 'Hoja' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ value: [{ id: 'w2', name: 'Otra' }] }),
      )

    await expect(service.listTables()).resolves.toEqual([
      { id: 't1', name: 'Tabla' },
    ])
    await expect(service.listWorksheets()).resolves.toEqual([
      { id: 'w1', name: 'Hoja' },
    ])
    await expect(
      service.listWorksheets('drive-alt/id', 'item-alt/id'),
    ).resolves.toEqual([{ id: 'w2', name: 'Otra' }])

    expect(fetchCall(0).url).toBe(`${GRAPH_BASE_URL}${DRIVE_PATH}/workbook/tables`)
    expect(fetchCall(1).url).toBe(
      `${GRAPH_BASE_URL}${DRIVE_PATH}/workbook/worksheets`,
    )
    expect(fetchCall(2).url).toBe(
      `${GRAPH_BASE_URL}/drives/drive-alt%2Fid/items/item-alt%2Fid/workbook/worksheets`,
    )
    expect(requestHeaders(fetchCall(0).init)).toMatchObject({
      Authorization: 'Bearer graph-token',
      Accept: 'application/json',
    })
    expect(fetchCall(0).init.method).toBe('GET')
    expect(tokenSpy).toHaveBeenCalledTimes(3)
  })

  it('lee encabezados y filas de tabla siguiendo nextLink', async () => {
    const { service } = createService()
    const tokenSpy = useToken(service)
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ values: [['NIT', 'Razón social']] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ values: ['1', 'ACME'] }],
          '@odata.nextLink': `${GRAPH_BASE_URL}/rows-page-2`,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ value: [{ values: ['2', 'Beta'] }, {}] }),
      )

    await expect(service.getTableHeader('Tabla/1')).resolves.toEqual([
      'NIT',
      'Razón social',
    ])
    await expect(service.getTableRows('Tabla 1')).resolves.toEqual([
      ['1', 'ACME'],
      ['2', 'Beta'],
      [],
    ])

    expect(fetchCall(0).url).toBe(
      `${GRAPH_BASE_URL}${DRIVE_PATH}/workbook/tables/Tabla%2F1/headerRowRange`,
    )
    expect(fetchCall(1).url).toBe(
      `${GRAPH_BASE_URL}${DRIVE_PATH}/workbook/tables/Tabla%201/rows`,
    )
    expect(fetchCall(2).url).toBe(`${GRAPH_BASE_URL}/rows-page-2`)
    expect(fetchCall(1).init.method).toBe('GET')
    expect(tokenSpy).toHaveBeenCalledTimes(3)
  })

  it('lee los valores de una hoja con identificadores codificados', async () => {
    const { service } = createService()
    const tokenSpy = useToken(service)
    fetchMock.mockResolvedValue(
      jsonResponse({ values: [['NIT', 123]] }),
    )

    await expect(
      service.getWorksheetValues('Hoja/1', 'drive-alt/id', 'item-alt/id'),
    ).resolves.toEqual([['NIT', 123]])

    expect(fetchCall(0).url).toBe(
      `${GRAPH_BASE_URL}/drives/drive-alt%2Fid/items/item-alt%2Fid/workbook/worksheets/Hoja%2F1/usedRange`,
    )
    expect(requestHeaders(fetchCall(0).init)).toMatchObject({
      Authorization: 'Bearer graph-token',
      Accept: 'application/json',
    })
    expect(tokenSpy).toHaveBeenCalledTimes(1)
  })

  it('lista, crea y renueva suscripciones con bodies y rutas esperadas', async () => {
    const { service } = createService()
    const tokenSpy = useToken(service)
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ value: [{ id: 'sub-1' }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'sub-new' }))
      .mockResolvedValueOnce(jsonResponse({}))

    await expect(service.listSubscriptions()).resolves.toEqual([
      {
        id: 'sub-1',
        resource: '',
        notificationUrl: '',
        expirationDateTime: '',
        clientState: null,
      },
    ])

    await expect(
      service.createSubscription('2026-11-27T12:00:00.000Z'),
    ).resolves.toEqual({
      id: 'sub-new',
      resource: RESOURCE,
      notificationUrl: '',
      expirationDateTime: '2026-11-27T12:00:00.000Z',
      clientState: null,
    })

    await expect(
      service.renewSubscription('sub/1', '2026-11-28T12:00:00.000Z'),
    ).resolves.toEqual({
      id: 'sub/1',
      resource: RESOURCE,
      notificationUrl: '',
      expirationDateTime: '2026-11-28T12:00:00.000Z',
      clientState: null,
    })

    expect(fetchCall(0).url).toBe(`${GRAPH_BASE_URL}/subscriptions`)

    const createCall = fetchCall(1)
    expect(createCall.url).toBe(`${GRAPH_BASE_URL}/subscriptions`)
    expect(createCall.init.method).toBe('POST')
    expect(requestHeaders(createCall.init)).toMatchObject({
      Authorization: 'Bearer graph-token',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(createCall.init.body as string)).toEqual({
      notificationUrl: 'https://api.test/api/external-data/webhook',
      lifecycleNotificationUrl:
        'https://api.test/api/external-data/webhook',
      resource: RESOURCE,
      expirationDateTime: '2026-11-27T12:00:00.000Z',
      clientState: 'shared-state-long',
      changeType: 'updated',
    })

    const renewCall = fetchCall(2)
    expect(renewCall.url).toBe(
      `${GRAPH_BASE_URL}/subscriptions/sub%2F1`,
    )
    expect(renewCall.init.method).toBe('PATCH')
    expect(requestHeaders(renewCall.init)).toMatchObject({
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(renewCall.init.body as string)).toEqual({
      expirationDateTime: '2026-11-28T12:00:00.000Z',
    })
    expect(tokenSpy).toHaveBeenCalledTimes(3)
  })
})
