import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { ExternalWorkbookReaderService } from './external-workbook-reader.service.js'
import { MicrosoftGraphService } from './microsoft-graph.service.js'
import type { ExternalWorkbookData } from './types.js'

function workbookData(
  overrides: Partial<ExternalWorkbookData> = {},
): ExternalWorkbookData {
  return {
    fileName: 'base-anual.xlsx',
    sourceName: 'Hoja: Base Anual',
    sourceUrl: null,
    tableOrWorksheet: 'Hoja: Base Anual',
    headers: [
      { value: 'nit', label: 'NIT' },
      { value: 'razon social', label: 'RAZÓN SOCIAL' },
      { value: 'estado', label: 'ESTADO' },
    ],
    rows: [
      {
        rowNumber: 2,
        values: ['900123', 'ACME S.A.S.', 'ACTIVO'],
      },
    ],
    version:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    lastModifiedDateTime: '2026-11-20T12:00:00.000Z',
    ...overrides,
  }
}

function createGraphMock() {
  return {
    getDriveItem: vi.fn(async () => ({
      id: 'item-1',
      name: 'base.xlsx',
      eTag: 'etag-1',
      lastModifiedDateTime: '2026-11-20T12:00:00.000Z',
      webUrl: 'https://example.test/base.xlsx',
    })),
    listTables: vi.fn(async () => [] as Array<{ id: string; name: string }>),
    getTableHeader: vi.fn(async () => [] as unknown[]),
    getTableRows: vi.fn(async () => [] as unknown[][]),
    listWorksheets: vi.fn(
      async () => [] as Array<{ id: string; name: string }>,
    ),
    getWorksheetValues: vi.fn(async () => [] as unknown[][]),
  }
}

function createReader(
  configOverrides: Record<string, unknown> = {},
  graph = createGraphMock(),
) {
  const config = {
    source: 'graph',
    tableName: '',
    worksheetName: '',
    maxRows: 5000,
    ...configOverrides,
  } as unknown as ExternalDataConfigService

  return {
    service: new ExternalWorkbookReaderService(
      config,
      graph as unknown as MicrosoftGraphService,
    ),
    config,
    graph,
  }
}

describe('ExternalWorkbookReaderService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lee la hoja configurada de un archivo xlsx local', async () => {
    const expected = workbookData()
    const readWorkbook = vi
      .spyOn(ExternalWorkbookReaderService.prototype, 'readWorkbook')
      .mockResolvedValue(expected)
    const { service } = createReader({
      source: 'file',
      localWorkbookPath: 'base-anual.xlsx',
      worksheetName: 'Base Anual',
    })

    const result = await service.read()

    expect(readWorkbook).toHaveBeenCalledWith(
      'base-anual.xlsx',
      'Base Anual',
    )
    expect(result.fileName).toBe('base-anual.xlsx')
    expect(result.sourceName).toBe('Hoja: Base Anual')
    expect(result.sourceUrl).toBeNull()
    expect(result.headers.map((header) => header.label)).toEqual([
      'NIT',
      'RAZÓN SOCIAL',
      'ESTADO',
    ])
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        values: ['900123', 'ACME S.A.S.', 'ACTIVO'],
      },
    ])
    expect(result.version).toMatch(/^[a-f0-9]{64}$/)
  })

  it('falla con un mensaje claro si el archivo no existe', async () => {
    vi.spyOn(ExternalWorkbookReaderService.prototype, 'readWorkbook')
      .mockRejectedValueOnce(
        new Error('No se encontró el archivo local: base-anual.xlsx'),
      )
    const { service } = createReader({
      source: 'file',
      localWorkbookPath: 'base-anual.xlsx',
    })

    await expect(service.read()).rejects.toThrow(
      'No se encontró el archivo local',
    )
  })

  it('selecciona la tabla de Graph por nombre o por id', async () => {
    const graph = createGraphMock()
    graph.listTables.mockResolvedValue([
      { id: 't1', name: 'Ventas' },
      { id: 't2', name: 'Otra' },
    ])
    graph.getTableHeader.mockResolvedValue(['Codigo'])
    graph.getTableRows.mockResolvedValue([['A']])
    const cases: Array<[string, string, string]> = [
      ['Ventas', 't1', 'Ventas'],
      ['t2', 't2', 'Otra'],
    ]

    for (const [tableName, tableId, sourceName] of cases) {
      const { service } = createReader({ tableName }, graph)

      const result = await service.read()

      expect(graph.getTableHeader).toHaveBeenCalledWith(tableId)
      expect(graph.getTableRows).toHaveBeenCalledWith(tableId)
      expect(result.sourceName).toBe(sourceName)
      expect(result.tableOrWorksheet).toBe(sourceName)
      expect(result.headers).toEqual([
        { value: 'Codigo', label: 'Codigo' },
      ])
      expect(result.rows).toEqual([
        { rowNumber: 2, values: ['A'] },
      ])
      graph.getTableHeader.mockClear()
      graph.getTableRows.mockClear()
    }

    expect(graph.listWorksheets).not.toHaveBeenCalled()
  })

  it('usa la primera tabla cuando no hay una tabla configurada', async () => {
    const graph = createGraphMock()
    graph.listTables.mockResolvedValue([{ id: 't1', name: 'Principal' }])
    graph.getTableHeader.mockResolvedValue(['Codigo'])
    graph.getTableRows.mockResolvedValue([['A']])
    const { service } = createReader({ tableName: '' }, graph)

    const result = await service.read()

    expect(graph.getTableHeader).toHaveBeenCalledWith('t1')
    expect(graph.getTableRows).toHaveBeenCalledWith('t1')
    expect(result.sourceName).toBe('Tabla: Principal')
  })

  it('usa la hoja configurada cuando Graph no tiene tablas', async () => {
    const graph = createGraphMock()
    graph.listWorksheets.mockResolvedValue([
      { id: 'w1', name: 'Otra' },
      { id: 'w2', name: 'Datos' },
    ])
    graph.getWorksheetValues.mockResolvedValue([['Codigo'], ['A']])
    const { service } = createReader({ worksheetName: 'Datos' }, graph)

    const result = await service.read()

    expect(graph.listTables).toHaveBeenCalled()
    expect(graph.getWorksheetValues).toHaveBeenCalledWith('w2')
    expect(result.sourceName).toBe('Hoja: Datos')
    expect(result.headers).toEqual([
      { value: 'Codigo', label: 'Codigo' },
    ])
    expect(result.rows).toEqual([{ rowNumber: 2, values: ['A'] }])
  })

  it('usa la primera hoja cuando no hay tablas ni hoja configurada', async () => {
    const graph = createGraphMock()
    graph.listWorksheets.mockResolvedValue([
      { id: 'w1', name: 'Primera' },
      { id: 'w2', name: 'Segunda' },
    ])
    graph.getWorksheetValues.mockResolvedValue([['Codigo'], ['A']])
    const { service } = createReader({ worksheetName: '' }, graph)

    const result = await service.read()

    expect(graph.getWorksheetValues).toHaveBeenCalledWith('w1')
    expect(result.sourceName).toBe('Hoja: Primera')
  })

  it('falla cuando el libro no tiene encabezados', async () => {
    const graph = createGraphMock()
    graph.listTables.mockResolvedValue([{ id: 't1', name: 'Vacia' }])
    graph.getTableHeader.mockResolvedValue([])
    const { service } = createReader({}, graph)

    await expect(service.read()).rejects.toThrow(
      'No se encontraron encabezados en el libro externo',
    )
  })

  it('falla cuando no hay tablas ni hojas legibles', async () => {
    const { service } = createReader()

    await expect(service.read()).rejects.toThrow(
      'El libro externo no tiene tablas ni hojas de cálculo legibles',
    )
  })

  it('normaliza encabezados, filas y tipos de celda mediante read', async () => {
    const graph = createGraphMock()
    graph.listTables.mockResolvedValue([{ id: 't1', name: 'Datos' }])
    graph.getTableHeader.mockResolvedValue([
      'Codigo',
      'Codigo',
      null,
      'Fecha',
    ])
    graph.getTableRows.mockResolvedValue([
      [' A ', 123, true, new Date('2026-11-20T00:00:00.000Z')],
      [null, undefined, '', {}],
      [{ text: 'B' }, { value: 456 }, false, { value: 'x' }],
      ['C', 7.5, Number.NaN, ' fin '],
    ])
    const { service } = createReader({ maxRows: 2 }, graph)

    const result = await service.read()

    expect(result.headers).toEqual([
      { value: 'Codigo', label: 'Codigo' },
      { value: 'Codigo 2', label: 'Codigo' },
      { value: 'columna 3', label: 'Columna 3' },
      { value: 'Fecha', label: 'Fecha' },
    ])
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        values: ['A', '123', 'true', '2026-11-20'],
      },
      {
        rowNumber: 4,
        values: ['B', '456', 'false', 'x'],
      },
    ])
  })

  it('calcula una versión determinista que cambia con los datos', async () => {
    const graph = createGraphMock()
    graph.listTables.mockResolvedValue([{ id: 't1', name: 'Datos' }])
    graph.getTableHeader.mockResolvedValue(['Codigo'])
    graph.getTableRows.mockResolvedValue([['A']])
    const { service } = createReader({}, graph)

    const first = await service.read()
    const second = await service.read()

    expect(first.version).toMatch(/^[a-f0-9]{64}$/)
    expect(second.version).toBe(first.version)

    graph.getTableRows.mockResolvedValueOnce([['B']])
    const changed = await service.read()

    expect(changed.version).not.toBe(first.version)
  })
})
