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

  it('configura la fuente local sin exigir credenciales Graph', () => {
    const fileService = createService({
      EXTERNAL_DATA_ENABLED: true,
      EXTERNAL_DATA_SOURCE: 'file',
      EXTERNAL_WORKBOOK_PATH: 'C:\\datos\\base.xlsx',
    })

    expect(fileService.service.source).toBe('file')
    expect(fileService.service.readConfigured).toBe(true)
    expect(fileService.service.webhookConfigured).toBe(false)
    expect(fileService.service.pollMs).toBe(60000)

    const missingPath = createService({
      EXTERNAL_DATA_ENABLED: true,
      EXTERNAL_DATA_SOURCE: 'file',
      EXTERNAL_WORKBOOK_PATH: '',
    })

    expect(missingPath.service.readConfigured).toBe(false)
  })

  it('habilita el módulo solo con el literal true', () => {
    expect(createService({ EXTERNAL_DATA_ENABLED: true }).service.enabled).toBe(
      true,
    )

    const otherValues: unknown[] = [
      'true',
      1,
      '1',
      false,
      null,
      undefined,
    ]
    otherValues.forEach((value) => {
      expect(
        createService({ EXTERNAL_DATA_ENABLED: value }).service.enabled,
      ).toBe(false)
    })
  })

  it('normaliza la fuente y usa Graph por defecto', () => {
    expect(
      createService({ EXTERNAL_DATA_SOURCE: '  file  ' }).service.source,
    ).toBe('file')

    const graphValues: unknown[] = ['FILE', ' graph ', '', '   ', undefined, null]
    graphValues.forEach((value) => {
      expect(
        createService({ EXTERNAL_DATA_SOURCE: value }).service.source,
      ).toBe('graph')
    })
  })

  it('aplica rutas y hojas por defecto para Clientes, colocadores y proveedores', () => {
    const empty = createService({})

    expect(empty.service.clientesWorkbookPath).toBe('')
    expect(empty.service.clientesWorksheetName).toBe('FR-SG-80')
    expect(empty.service.colocadoresWorkbookPath).toBe('')
    expect(empty.service.colocadoresWorksheetName).toBe('FR-SG-81')
    expect(empty.service.proveedoresWorkbookPath).toBe('')
    expect(empty.service.proveedoresWorksheetName).toBe('FR-SG-83')

    const whitespace = createService({
      EXTERNAL_CLIENTES_WORKSHEET_NAME: '   ',
      EXTERNAL_COLOCADORES_WORKSHEET_NAME: '   ',
      EXTERNAL_PROVEEDORES_WORKSHEET_NAME: '   ',
    })

    expect(whitespace.service.clientesWorksheetName).toBe('FR-SG-80')
    expect(whitespace.service.colocadoresWorksheetName).toBe('FR-SG-81')
    expect(whitespace.service.proveedoresWorksheetName).toBe('FR-SG-83')

    const configured = createService({
      EXTERNAL_DATA_ENABLED: true,
      EXTERNAL_CLIENTES_WORKBOOK_PATH: '  C:\\datos\\clientes.xlsx  ',
      EXTERNAL_CLIENTES_WORKSHEET_NAME: '  Clientes 2026 ',
      EXTERNAL_COLOCADORES_WORKBOOK_PATH: '  C:\\datos\\colocadores.xlsx  ',
      EXTERNAL_COLOCADORES_WORKSHEET_NAME: '  Colocadores 2026 ',
      EXTERNAL_PROVEEDORES_WORKBOOK_PATH: '  C:\\datos\\proveedores.xlsx  ',
      EXTERNAL_PROVEEDORES_WORKSHEET_NAME: '  Proveedores 2026 ',
      EXTERNAL_PROVEEDORES_COLUMN_MAP: ' {"code":"nit"} ',
    })

    expect(configured.service.clientesWorkbookPath).toBe(
      'C:\\datos\\clientes.xlsx',
    )
    expect(configured.service.clientesWorksheetName).toBe('Clientes 2026')
    expect(configured.service.colocadoresWorkbookPath).toBe(
      'C:\\datos\\colocadores.xlsx',
    )
    expect(configured.service.colocadoresWorksheetName).toBe(
      'Colocadores 2026',
    )
    expect(configured.service.proveedoresWorkbookPath).toBe(
      'C:\\datos\\proveedores.xlsx',
    )
    expect(configured.service.proveedoresWorksheetName).toBe(
      'Proveedores 2026',
    )
    expect(configured.service.rawProveedoresColumnMap).toBe('{"code":"nit"}')
    expect(configured.service.clientesReadConfigured).toBe(true)
    expect(configured.service.colocadoresReadConfigured).toBe(true)
    expect(configured.service.proveedoresReadConfigured).toBe(true)

    const disabled = createService({
      EXTERNAL_DATA_ENABLED: false,
      EXTERNAL_CLIENTES_WORKBOOK_PATH: 'C:\\datos\\clientes.xlsx',
      EXTERNAL_COLOCADORES_WORKBOOK_PATH: 'C:\\datos\\colocadores.xlsx',
      EXTERNAL_PROVEEDORES_WORKBOOK_PATH: 'C:\\datos\\proveedores.xlsx',
    })

    expect(disabled.service.clientesReadConfigured).toBe(false)
    expect(disabled.service.colocadoresReadConfigured).toBe(false)
    expect(disabled.service.proveedoresReadConfigured).toBe(false)

    const missingPaths = createService({
      EXTERNAL_DATA_ENABLED: true,
      EXTERNAL_CLIENTES_WORKBOOK_PATH: '   ',
      EXTERNAL_COLOCADORES_WORKBOOK_PATH: '',
      EXTERNAL_PROVEEDORES_WORKBOOK_PATH: '   ',
    })

    expect(missingPaths.service.clientesReadConfigured).toBe(false)
    expect(missingPaths.service.colocadoresReadConfigured).toBe(false)
    expect(missingPaths.service.proveedoresReadConfigured).toBe(false)
  })

  it('respeta cero como valor numérico explícito', () => {
    const { service } = createService({
      EXTERNAL_GRAPH_TIMEOUT_MS: 0,
      EXTERNAL_FALLBACK_POLL_MS: 0,
      EXTERNAL_REFRESH_DEBOUNCE_MS: 0,
      EXTERNAL_MAX_ROWS: 0,
    })

    expect(service.graphTimeoutMs).toBe(0)
    expect(service.pollMs).toBe(0)
    expect(service.debounceMs).toBe(0)
    expect(service.maxRows).toBe(0)
  })

  it('quita todas las barras finales de la URL del webhook', () => {
    const { service } = createService({
      EXTERNAL_WEBHOOK_PUBLIC_URL: '  https://api.test/hook///  ',
    })

    expect(service.webhookUrl).toBe('https://api.test/hook')
  })

  it('quita todas las barras finales de graphBaseUrl', () => {
    const { service } = createService({
      EXTERNAL_GRAPH_BASE_URL: '  https://graph.test/beta///  ',
    })

    expect(service.graphBaseUrl).toBe('https://graph.test/beta')
  })

  it('calcula lectura y webhook según la fuente configurada', () => {
    const graph = createService({
      ...credentials,
      EXTERNAL_WEBHOOK_PUBLIC_URL: 'https://api.test/hook',
      EXTERNAL_WEBHOOK_CLIENT_STATE: 'secreto-compartido-largo',
    })

    expect(graph.service.readConfigured).toBe(true)
    expect(graph.service.webhookConfigured).toBe(true)

    const file = createService({
      EXTERNAL_DATA_ENABLED: true,
      EXTERNAL_DATA_SOURCE: ' file ',
      EXTERNAL_WORKBOOK_PATH: '  C:\\datos\\base.xlsx  ',
      EXTERNAL_WEBHOOK_PUBLIC_URL: 'https://api.test/hook',
      EXTERNAL_WEBHOOK_CLIENT_STATE: 'secreto-compartido-largo',
    })

    expect(file.service.readConfigured).toBe(true)
    expect(file.service.webhookConfigured).toBe(false)

    const disabled = createService({
      ...credentials,
      EXTERNAL_DATA_ENABLED: 'true',
      EXTERNAL_WEBHOOK_PUBLIC_URL: 'https://api.test/hook',
      EXTERNAL_WEBHOOK_CLIENT_STATE: 'secreto-compartido-largo',
    })

    expect(disabled.service.readConfigured).toBe(false)
    expect(disabled.service.webhookConfigured).toBe(false)
  })
})
