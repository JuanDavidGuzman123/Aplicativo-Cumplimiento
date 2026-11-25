import { describe, expect, it, vi } from 'vitest'
import {
  getBusinessToday,
  toDateOnly,
} from '../common/utils/dates.js'
import { ExternalAnnualMapperService } from './external-annual-mapper.service.js'
import { ExternalDataCacheService } from './external-data.cache.service.js'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { ExternalDataService } from './external-data.service.js'
import { ExternalWorkbookReaderService } from './external-workbook-reader.service.js'
import type {
  ExternalAnnualMapping,
  ExternalAnnualRow,
  ExternalDataStatus,
  ExternalImportHeader,
  ExternalSource,
  ExternalSyncStats,
  ExternalWorkbookData,
  ExternalWorkbookRow,
} from './types.js'

const status: ExternalDataStatus = {
  source: 'arriendos',
  enabled: true,
  configured: true,
  connection: 'connected',
  freshness: 'fresh',
  sourceName: 'Base anual',
  sourceUrl: null,
  version: 'v1',
  lastAttemptAt: '2026-11-20T12:00:00.000Z',
  lastSuccessAt: '2026-11-20T12:00:00.000Z',
  lastChangeAt: '2026-11-20T12:00:00.000Z',
  lastError: null,
  rowCount: 4,
  mappingErrors: [],
  subscription: {
    state: 'disabled',
    id: null,
    expiresAt: null,
    message: null,
  },
  webhookConfigured: false,
  pollMs: 900000,
  serverNow: '2026-11-20T12:00:00.000Z',
}

function filingDateForDue(days: number): string {
  const today = getBusinessToday()
  const due = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + days,
    ),
  )
  const filing = new Date(
    Date.UTC(
      due.getUTCFullYear() - 1,
      due.getUTCMonth(),
      due.getUTCDate(),
    ),
  )

  return toDateOnly(filing) ?? ''
}

function row(code: string, filingDate: string): ExternalAnnualRow {
  return {
    id: `external-${code}`,
    code,
    nit: `900000${code}`,
    businessName: `Contraparte ${code}`,
    status: 'ACTIVE',
    requiresSemiannualFollowUp: null,
    filingDate,
    filingYear: Number(filingDate.slice(0, 4)),
    dueDiligenceType: null,
    observations: null,
    updatedThisYear: false,
    annualStatus: 'PENDING',
    sourceFileName: 'base.xlsx',
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
  }
}

function emptyStats(): ExternalSyncStats {
  return {
    totalRows: 0,
    validRows: 0,
    ignoredRows: 0,
    errorRows: 0,
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
  }
}

function makeWorkbook(
  headers: ExternalImportHeader[] = [
    { value: 'nit', label: 'NIT' },
    { value: 'nombre', label: 'Nombre' },
    { value: 'seguimiento', label: 'Seguimiento semestral' },
  ],
  rows: ExternalWorkbookRow[] = [],
  overrides: Partial<ExternalWorkbookData> = {},
): ExternalWorkbookData {
  return {
    fileName: 'base.xlsx',
    sourceName: 'Hoja: Base',
    sourceUrl: null,
    tableOrWorksheet: 'Hoja: Base',
    headers,
    rows,
    version: 'version-1',
    lastModifiedDateTime: '2026-11-20T12:00:00.000Z',
    ...overrides,
  }
}

const followUpHeaders: ExternalImportHeader[] = [
  { value: 'nit', label: 'NIT' },
  { value: 'nombre', label: 'Nombre' },
  { value: 'seguimiento', label: 'Seguimiento semestral' },
  {
    value: 'fecha debida diligencia',
    label: 'Fecha debida diligencia',
  },
]

const followUpRows: ExternalWorkbookRow[] = [
  {
    rowNumber: 2,
    values: ['1', 'Uno', 'Sí', '2026-01-15'],
  },
  {
    rowNumber: 3,
    values: ['2', 'Dos', 'No', '2026-01-16'],
  },
  {
    rowNumber: 4,
    values: ['3', 'Tres', '', '2026-01-17'],
  },
  {
    rowNumber: 5,
    values: ['4', 'Cuatro', 'tal vez', '2026-01-18'],
  },
]

type MockOptions = {
  rows?: ExternalAnnualRow[]
  status?: ExternalDataStatus
  readWorkbook?: ExternalWorkbookData
  mapping?: ExternalAnnualMapping
  mappedRows?: ExternalAnnualRow[]
  resolveErrors?: string[]
  mappingErrors?: string[]
}

function createService(rows: ExternalAnnualRow[]) {
  const cache = {
    getSnapshot: vi.fn(() => ({ rows })),
    getStatus: vi.fn(() => status),
  }

  return new ExternalDataService(
    {} as ExternalDataConfigService,
    cache as unknown as ExternalDataCacheService,
    {} as ExternalWorkbookReaderService,
    {} as ExternalAnnualMapperService,
  )
}

function createMockService(
  configOverrides: Record<string, unknown> = {},
  options: MockOptions = {},
) {
  const config = {
    enabled: true,
    source: 'graph',
    readConfigured: true,
    colocadoresReadConfigured: true,
    clientesReadConfigured: true,
    webhookConfigured: false,
    pollMs: 900000,
    rawColumnMap: '',
    rawClientesColumnMap: '',
    rawProveedoresColumnMap: '',
    proveedoresReadConfigured: true,
    colocadoresWorkbookPath: 'colocadores.xlsx',
    colocadoresWorksheetName: 'FR-SG-81',
    clientesWorkbookPath: 'clientes.xlsx',
    clientesWorksheetName: 'FR-SG-80',
    proveedoresWorkbookPath: 'proveedores.xlsx',
    proveedoresWorksheetName: 'FR-SG-83',
    ...configOverrides,
  }
  const workbook = options.readWorkbook ?? makeWorkbook()
  const mapping = options.mapping ?? {
    code: 'nit',
    businessName: 'nombre',
    status: 'estado',
  }
  const mappedRows = options.mappedRows ?? [row('M', filingDateForDue(1))]
  const cache = {
    initialize: vi.fn(),
    getSnapshot: vi.fn(() => ({ rows: options.rows ?? [] })),
    getStatus: vi.fn((source: ExternalSource = 'arriendos') => ({
      ...(options.status ?? status),
      source,
    })),
    setSyncing: vi.fn(),
    setSuccess: vi.fn(),
    setError: vi.fn(),
    setUnconfigured: vi.fn(),
  }
  const reader = {
    read: vi.fn(async () => workbook),
    readWorkbook: vi.fn(async () => workbook),
  }
  const mapper = {
    resolveMapping: vi.fn(
      (sourceWorkbook: ExternalWorkbookData, rawColumnMap: string) => ({
        mapping,
        errors: options.resolveErrors ?? [],
        sourceWorkbook,
        rawColumnMap,
      }),
    ),
    mapWorkbook: vi.fn(
      (
        sourceWorkbook: ExternalWorkbookData,
        resolvedMapping: ExternalAnnualMapping,
        syncTime: string,
      ) => ({
        rows: mappedRows,
        mapping: resolvedMapping,
        mappingErrors: options.mappingErrors ?? [],
        stats: emptyStats(),
        sourceWorkbook,
        syncTime,
      }),
    ),
  }
  const service = new ExternalDataService(
    config as unknown as ExternalDataConfigService,
    cache as unknown as ExternalDataCacheService,
    reader as unknown as ExternalWorkbookReaderService,
    mapper as unknown as ExternalAnnualMapperService,
  )

  return {
    service,
    config,
    cache,
    reader,
    mapper,
    workbook,
    mapping,
    mappedRows,
  }
}

describe('ExternalDataService', () => {
  it('clasifica vencimientos y omite registros fuera de ventana', () => {
    const service = createService([
      row('A', filingDateForDue(3)),
      row('B', filingDateForDue(8)),
      row('C', filingDateForDue(-2)),
      row('D', filingDateForDue(40)),
    ])

    const result = service.getUpdatesDue({
      page: 1,
      pageSize: 10,
    })

    expect(result.data.map((item) => item.code)).toEqual([
      'C',
      'A',
      'B',
    ])
    expect(result.data.map((item) => item.situation)).toEqual([
      'OVERDUE',
      'DUE_SOON',
      'DUE_SOON',
    ])
    expect(result.data[1].daysUntilDue).toBe(3)
    expect(result.data[2].daysUntilDue).toBe(8)
    expect(result.summary).toMatchObject({
      needsUpdate: 1,
      overdue: 1,
      dueToday: 0,
      upcoming: 2,
      withoutDate: 0,
    })
    expect(result.status).toEqual(status)
  })

  it('excluye inactivos y fechas anteriores al año anterior', () => {
    const inactive = {
      ...row('I', filingDateForDue(1)),
      status: 'INACTIVE' as const,
    }
    const oldYear = getBusinessToday().getUTCFullYear() - 2
    const tooOld = {
      ...row('O', `${oldYear}-01-15`),
      filingYear: oldYear,
    }
    const service = createService([inactive, tooOld])

    const result = service.getUpdatesDue({
      page: 1,
      pageSize: 10,
    })

    expect(result.data).toEqual([])
    expect(result.meta.total).toBe(0)
  })

  it('filtra por código exacto desde una notificación', () => {
    const service = createService([
      row('37', filingDateForDue(1)),
      row('2037', filingDateForDue(2)),
    ])

    const result = service.findAll({
      code: '37',
      page: 1,
      pageSize: 10,
    })

    expect(result.data.map((item) => item.code)).toEqual(['37'])
    expect(result.meta.total).toBe(1)
  })

  it('genera el reporte de pendientes activos con el corte reciente', () => {
    const currentYear = getBusinessToday().getUTCFullYear()
    const pending = row('P', filingDateForDue(1))
    const updated = {
      ...row('U', `${currentYear}-01-15`),
      filingYear: currentYear,
    }
    const inactive = {
      ...row('I', filingDateForDue(1)),
      status: 'INACTIVE' as const,
    }
    const old = {
      ...row('O', `${currentYear - 2}-01-15`),
      filingYear: currentYear - 2,
    }
    const service = createService([
      pending,
      updated,
      inactive,
      old,
    ])

    const report = service.getPendingActiveReport()

    expect(report.currentYear).toBe(currentYear)
    expect(report.rows.map((item) => item.code)).toEqual(['P'])
    expect(report.rows[0].annualStatus).toBe('PENDING')
  })

  it('genera reportes para cada métrica de la pantalla', () => {
    const currentYear = getBusinessToday().getUTCFullYear()
    const updated = {
      ...row('U', `${currentYear}-01-15`),
      filingYear: currentYear,
    }
    const pendingActive = row('PA', filingDateForDue(1))
    const inactive = {
      ...row('I', `${currentYear}-01-15`),
      status: 'INACTIVE' as const,
    }
    const pendingInactive = {
      ...row('PI', filingDateForDue(1)),
      status: 'INACTIVE' as const,
    }
    const followUp = {
      ...row('F', `${currentYear}-01-15`),
      requiresSemiannualFollowUp: true,
    }
    const service = createService([
      updated,
      pendingActive,
      inactive,
      pendingInactive,
      followUp,
    ])
    const codes = (metric: Parameters<typeof service.getReport>[0]) =>
      service
        .getReport(metric)
        .rows.map((item) => item.code)
        .sort()

    expect(codes('active')).toEqual(['F', 'PA', 'U'])
    expect(codes('inactive')).toEqual(['I', 'PI'])
    expect(codes('updated-this-year')).toEqual(['F', 'I', 'U'])
    expect(codes('pending-active')).toEqual(['PA'])
    expect(codes('follow-up')).toEqual(['F'])
    expect(codes('updates-due')).toEqual(['PA'])
  })

  it('no cuenta inactivos como pendientes de actualizar', () => {
    const currentYear = getBusinessToday().getUTCFullYear()
    const inactive = {
      ...row('I', `${currentYear - 1}-01-15`),
      status: 'INACTIVE' as const,
      filingYear: currentYear - 1,
    }
    const service = createService([inactive])

    expect(service.getSummary().annual.inactive.pendingUpdate).toBe(0)
  })

  it('aísla los datos de Arriendos, Colocadores, Clientes y Proveedores por fuente', () => {
    const arriendos = [row('A', filingDateForDue(1))]
    const colocadores = [row('C', filingDateForDue(2))]
    const clientes = [row('L', filingDateForDue(3))]
    const proveedores = [row('P', filingDateForDue(4))]
    const cache = {
      getSnapshot: vi.fn((source = 'arriendos') => ({
        rows:
          source === 'colocadores'
            ? colocadores
            : source === 'clientes'
              ? clientes
              : source === 'proveedores'
                ? proveedores
                : arriendos,
      })),
      getStatus: vi.fn(() => status),
    }
    const service = new ExternalDataService(
      {} as ExternalDataConfigService,
      cache as unknown as ExternalDataCacheService,
      {} as ExternalWorkbookReaderService,
      {} as ExternalAnnualMapperService,
    )

    expect(service.getSummary('arriendos').totals.total).toBe(1)
    expect(service.getSummary('colocadores').totals.total).toBe(1)
    expect(service.getSummary('clientes').totals.total).toBe(1)
    expect(service.getSummary('proveedores').totals.total).toBe(1)
    expect(
      service.findAll({ page: 1, pageSize: 10 }, 'colocadores').data[0]
        .code,
    ).toBe('C')
    expect(
      service.findAll({ page: 1, pageSize: 10 }, 'clientes').data[0]
        .code,
    ).toBe('L')
    expect(cache.getSnapshot).toHaveBeenCalledWith('clientes')
  })

  it('inicializa caché para cuatro fuentes y refreshea solo las configuradas', () => {
    const { service, cache } = createMockService({
      enabled: true,
      readConfigured: true,
      colocadoresReadConfigured: false,
      clientesReadConfigured: true,
      proveedoresReadConfigured: true,
      webhookConfigured: true,
      pollMs: 120000,
    })
    const refresh = vi.spyOn(service, 'refresh').mockResolvedValue(status)

    service.onModuleInit()

    expect(cache.initialize).toHaveBeenCalledTimes(4)
    expect(cache.initialize).toHaveBeenNthCalledWith(
      1,
      {
        enabled: true,
        configured: true,
        webhookConfigured: true,
        pollMs: 120000,
      },
      'arriendos',
    )
    expect(cache.initialize).toHaveBeenNthCalledWith(
      2,
      {
        enabled: true,
        configured: false,
        webhookConfigured: false,
        pollMs: 120000,
      },
      'colocadores',
    )
    expect(cache.initialize).toHaveBeenNthCalledWith(
      3,
      {
        enabled: true,
        configured: true,
        webhookConfigured: false,
        pollMs: 120000,
      },
      'clientes',
    )
    expect(cache.initialize).toHaveBeenNthCalledWith(
      4,
      {
        enabled: true,
        configured: true,
        webhookConfigured: false,
        pollMs: 120000,
      },
      'proveedores',
    )
    expect(refresh.mock.calls).toEqual([
      ['inicio', 'arriendos'],
      ['inicio', 'clientes'],
      ['inicio', 'proveedores'],
    ])
  })

  it('no inicia refrescos cuando la integración está desactivada', () => {
    const { service, cache } = createMockService({
      enabled: false,
      readConfigured: false,
      colocadoresReadConfigured: false,
      clientesReadConfigured: false,
      proveedoresReadConfigured: false,
    })
    const refresh = vi.spyOn(service, 'refresh').mockResolvedValue(status)

    service.onModuleInit()

    expect(cache.initialize).toHaveBeenCalledTimes(4)
    expect(cache.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, configured: false }),
      'arriendos',
    )
    expect(refresh).not.toHaveBeenCalled()
  })

  it('no refreshea cuando la integración está desactivada', async () => {
    const { service, cache, reader } = createMockService({
      enabled: false,
    })

    const result = await service.refresh('manual')

    expect(cache.setUnconfigured).toHaveBeenCalledWith(
      'La integración externa está desactivada',
      'arriendos',
    )
    expect(reader.read).not.toHaveBeenCalled()
    expect(result.source).toBe('arriendos')
  })

  it('informa el motivo por fuente cuando no está configurada', async () => {
    const cases: Array<[ExternalSource, Record<string, unknown>, string]> = [
      [
        'arriendos',
        { source: 'file', readConfigured: false },
        'Falta EXTERNAL_WORKBOOK_PATH para la fuente local',
      ],
      [
        'arriendos',
        { source: 'graph', readConfigured: false },
        'Faltan credenciales o identificadores de Microsoft Graph',
      ],
      [
        'colocadores',
        { colocadoresReadConfigured: false },
        'Falta EXTERNAL_COLOCADORES_WORKBOOK_PATH para leer FR-SG-81',
      ],
      [
        'clientes',
        { clientesReadConfigured: false },
        'Falta EXTERNAL_CLIENTES_WORKBOOK_PATH para leer FR-SG-80',
      ],
      [
        'proveedores',
        { proveedoresReadConfigured: false },
        'Falta EXTERNAL_PROVEEDORES_WORKBOOK_PATH para leer FR-SG-83',
      ],
    ]

    for (const [source, overrides, message] of cases) {
      const { service, cache, reader } = createMockService(overrides)

      const result = await service.refresh('manual', source)

      expect(cache.setUnconfigured).toHaveBeenCalledWith(message, source)
      expect(reader.read).not.toHaveBeenCalled()
      expect(reader.readWorkbook).not.toHaveBeenCalled()
      expect(result.source).toBe(source)
    }
  })

  it('sincroniza arriendos con lector y mapeador simulados', async () => {
    const sourceWorkbook = makeWorkbook()
    const mapping: ExternalAnnualMapping = {
      code: 'nit',
      businessName: 'nombre',
    }
    const mappedRows = [row('OK', filingDateForDue(1))]
    const { service, cache, reader, mapper } = createMockService(
      { rawColumnMap: '{"code":"nit"}' },
      { readWorkbook: sourceWorkbook, mapping, mappedRows },
    )

    const result = await service.refresh('manual')

    expect(reader.read).toHaveBeenCalledTimes(1)
    expect(reader.readWorkbook).not.toHaveBeenCalled()
    expect(mapper.resolveMapping).toHaveBeenCalledWith(
      sourceWorkbook,
      '{"code":"nit"}',
    )
    expect(mapper.mapWorkbook).toHaveBeenCalledWith(
      sourceWorkbook,
      mapping,
      expect.any(String),
    )
    expect(cache.setSyncing).toHaveBeenCalledWith('arriendos')
    expect(cache.setSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: mappedRows,
        mapping,
        mappingErrors: [],
        headers: sourceWorkbook.headers,
        version: sourceWorkbook.version,
        fileName: sourceWorkbook.fileName,
        stats: expect.any(Object),
        source: 'arriendos',
      }),
    )
    expect(cache.setError).not.toHaveBeenCalled()
    expect(result.source).toBe('arriendos')
  })

  it('sincroniza colocadores y clientes con la ruta de cada fuente', async () => {
    const cases: Array<[ExternalSource, string, string]> = [
      ['colocadores', 'colocadores.xlsx', 'FR-SG-81'],
      ['clientes', 'clientes.xlsx', 'FR-SG-80'],
      ['proveedores', 'proveedores.xlsx', 'FR-SG-83'],
    ]

    for (const [source, path, worksheetName] of cases) {
      const { service, cache, reader, mapper } = createMockService()

      const result = await service.refresh('manual', source)

      expect(reader.readWorkbook).toHaveBeenCalledWith(path, worksheetName)
      expect(reader.read).not.toHaveBeenCalled()
      expect(cache.setSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ source }),
      )
      expect(result.source).toBe(source)

      if (source === 'clientes' || source === 'proveedores') {
        expect(mapper.resolveMapping).toHaveBeenCalledWith(
          expect.any(Object),
          '',
        )
      } else {
        const [prepared] = mapper.mapWorkbook.mock.calls[0]
        expect(prepared.headers.at(-1)).toEqual({
          value: '__annual_status',
          label: 'Estado anual',
        })
      }
    }
  })

  it('registra un error cuando el lector rechaza la promesa', async () => {
    const { service, cache, reader } = createMockService()
    reader.read.mockRejectedValueOnce(new Error('libro no disponible'))

    const result = await service.refresh('manual')

    expect(cache.setError).toHaveBeenCalledWith(
      'libro no disponible',
      'arriendos',
    )
    expect(cache.setSuccess).not.toHaveBeenCalled()
    expect(result.source).toBe('arriendos')
  })

  it('registra errores de mapeo como error de sincronización', async () => {
    const { service, cache } = createMockService(
      {},
      { mappingErrors: ['Falta la columna obligatoria "Código"'] },
    )

    await service.refresh('manual')

    expect(cache.setError).toHaveBeenCalledWith(
      'Falta la columna obligatoria "Código"',
      'arriendos',
    )
    expect(cache.setSuccess).not.toHaveBeenCalled()
  })

  it('dedupe refrescos simultáneos de una misma fuente', async () => {
    const { service } = createMockService()
    let resolveRefresh!: (value: ExternalDataStatus) => void
    const pending = new Promise<ExternalDataStatus>((resolve) => {
      resolveRefresh = resolve
    })
    const doRefresh = vi.fn(() => pending)
    const internals = service as unknown as {
      doRefresh: (
        reason: string,
        source: ExternalSource,
      ) => Promise<ExternalDataStatus>
    }
    internals.doRefresh = doRefresh

    const first = service.refresh('primera')
    const second = service.refresh('segunda')

    expect(doRefresh).toHaveBeenCalledTimes(1)
    expect(doRefresh).toHaveBeenCalledWith('primera', 'arriendos')

    resolveRefresh(status)
    await expect(Promise.all([first, second])).resolves.toEqual([
      status,
      status,
    ])
    await vi.waitFor(() => expect(doRefresh).toHaveBeenCalledTimes(2))
  })

  it('filtra seguimientos clientes antes de mapear', async () => {
    const sourceWorkbook = makeWorkbook(followUpHeaders, followUpRows)
    const mappedRows = [
      row('1', filingDateForDue(1)),
      row('2', filingDateForDue(2)),
    ]
    const { service, reader, mapper } = createMockService(
      {
        clientesWorkbookPath: 'clientes.xlsx',
        clientesWorksheetName: 'FR-SG-80',
        rawClientesColumnMap: '{"code":"nit"}',
      },
      { readWorkbook: sourceWorkbook, mappedRows },
    )

    const result = await service.getClientesFollowUpRows()

    expect(reader.readWorkbook).toHaveBeenCalledWith(
      'clientes.xlsx',
      'FR-SG-80',
    )
    const [filtered] = mapper.mapWorkbook.mock.calls[0]
    expect(filtered.rows.map((item) => item.rowNumber)).toEqual([2, 3])
    expect(mapper.resolveMapping).toHaveBeenCalledWith(
      filtered,
      '{"code":"nit"}',
    )
    expect(result).toEqual(mappedRows)
  })

  it('propaga errores de mapeo de clientes', async () => {
    const sourceWorkbook = makeWorkbook(followUpHeaders, followUpRows)
    const { service, mapper } = createMockService(
      {},
      {
        readWorkbook: sourceWorkbook,
        resolveErrors: ['Falta la columna obligatoria "Código"'],
      },
    )

    await expect(service.getClientesFollowUpRows()).rejects.toThrow(
      'Falta la columna obligatoria "Código"',
    )
    expect(mapper.mapWorkbook).not.toHaveBeenCalled()
  })

  it('filtra y prepara seguimientos de colocadores antes de mapear', async () => {
    const sourceWorkbook = makeWorkbook(followUpHeaders, followUpRows)
    const mappedRows = [row('1', filingDateForDue(1))]
    const { service, reader, mapper } = createMockService(
      {},
      { readWorkbook: sourceWorkbook, mappedRows },
    )

    const result = await service.getColocadoresFollowUpRows()

    expect(reader.readWorkbook).toHaveBeenCalledWith(
      'colocadores.xlsx',
      'FR-SG-81',
    )
    const [prepared, mapping] = mapper.mapWorkbook.mock.calls[0]
    expect(prepared.rows.map((item) => item.rowNumber)).toEqual([2])
    expect(prepared.rows[0].values.at(-1)).toBe('A')
    expect(prepared.headers.at(-1)).toEqual({
      value: '__annual_status',
      label: 'Estado anual',
    })
    expect(mapping).toMatchObject({
      code: 'nit',
      nit: 'nit',
      businessName: 'nombre',
      status: '__annual_status',
      filingDate: 'fecha debida diligencia',
      requiresSemiannualFollowUp: 'seguimiento',
    })
    expect(result).toEqual(mappedRows)
  })

  it('no pasa filas al mapeador si falta la columna de seguimiento', async () => {
    const headers = followUpHeaders.filter(
      (header) => header.value !== 'seguimiento',
    )
    const sourceWorkbook = makeWorkbook(headers, followUpRows)
    const { service, mapper } = createMockService(
      {},
      { readWorkbook: sourceWorkbook },
    )

    await service.getClientesFollowUpRows()
    await service.getColocadoresFollowUpRows()

    expect(mapper.mapWorkbook).toHaveBeenCalledTimes(2)
    for (const [prepared] of mapper.mapWorkbook.mock.calls) {
      expect(prepared.rows).toEqual([])
    }
  })

  it('delega estado y obtención de filas en el caché por fuente', () => {
    const rows = [row('A', `${getBusinessToday().getUTCFullYear()}-01-15`)]
    const { service, cache } = createMockService({}, { rows })

    expect(service.getStatus('clientes')).toEqual({
      ...status,
      source: 'clientes',
    })
    expect(cache.getStatus).toHaveBeenCalledWith('clientes')
    expect(service.getAllRows().map((item) => item.code)).toEqual(['A'])
    expect(service.getAllColocadoresRows().map((item) => item.code)).toEqual(
      ['A'],
    )
    expect(service.getAllClientesRows().map((item) => item.code)).toEqual([
      'A',
    ])
    expect(
      service.getAllProveedoresRows().map((item) => item.code),
    ).toEqual(['A'])
    expect(
      cache.getSnapshot.mock.calls.map(([source]) => source),
    ).toEqual(['arriendos', 'colocadores', 'clientes', 'proveedores'])
  })

  it('delega el reporte de pendientes activos al generador de reportes', () => {
    const { service } = createMockService()
    const report = {
      metric: 'pending-active' as const,
      title: 'Pendientes de actualizar (activos)',
      subtitle: '1 activo',
      generatedAt: '2026-11-20T12:00:00.000Z',
      currentYear: getBusinessToday().getUTCFullYear(),
      rows: [],
    }
    const getReport = vi.spyOn(service, 'getReport').mockReturnValue(report)

    expect(service.getPendingActiveReport('clientes')).toBe(report)
    expect(getReport).toHaveBeenCalledWith('pending-active', 'clientes')
  })
})
