import { ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import {
  CLIENTES_WORKBOOK_LABEL,
  ClientesWorkbookService,
} from './clientes-workbook.service.js'
import type { ColocadoresWorkbookWriterService } from './colocadores-workbook.writer.service.js'
import type { ExternalDataConfigService } from './external-data.config.service.js'

function createService(
  overrides: Partial<ExternalDataConfigService> = {},
  writeFieldsByDocument = vi.fn(),
) {
  const config = {
    clientesReadConfigured: true,
    source: 'file',
    clientesWorkbookPath: 'C:\\datos\\clientes.xlsx',
    clientesWorksheetName: 'FR-SG-80',
    ...overrides,
  } as unknown as ExternalDataConfigService
  const writer = {
    writeFieldsByDocument,
  } as unknown as ColocadoresWorkbookWriterService

  return {
    service: new ClientesWorkbookService(config, writer),
    writeFieldsByDocument,
  }
}

describe('ClientesWorkbookService', () => {
  it('rechaza la escritura cuando Clientes no está configurado', async () => {
    const { service, writeFieldsByDocument } = createService({
      clientesReadConfigured: false,
    })

    await expect(
      service.writeFollowUp('900123', 'Sí', 'Observación'),
    ).rejects.toThrow(ServiceUnavailableException)
    expect(writeFieldsByDocument).not.toHaveBeenCalled()
  })

  it('rechaza la escritura cuando la fuente no es archivo local', async () => {
    const { service, writeFieldsByDocument } = createService({
      source: 'graph',
    })

    await expect(
      service.writeFollowUp('900123', 'Sí', 'Observación'),
    ).rejects.toThrow(ServiceUnavailableException)
    expect(writeFieldsByDocument).not.toHaveBeenCalled()
  })

  it('delega en el writer con los argumentos exactos y devuelve el snapshot', async () => {
    const snapshot = { followUp: 'No', observations: 'Sin novedades' }
    const writeFieldsByDocument = vi.fn().mockResolvedValue(snapshot)
    const { service } = createService(
      {
        clientesWorkbookPath: 'C:\\datos\\FR-SG-80.xlsx',
        clientesWorksheetName: 'Clientes 2026',
      },
      writeFieldsByDocument,
    )

    const result = await service.writeFollowUp(
      '900123456-7',
      'Sí',
      'Actualizar diligenciamiento',
    )

    expect(result).toEqual(snapshot)
    expect(writeFieldsByDocument).toHaveBeenCalledWith(
      'C:\\datos\\FR-SG-80.xlsx',
      'Clientes 2026',
      '900123456-7',
      {
        followUp: 'Sí',
        observations: 'Actualizar diligenciamiento',
      },
      CLIENTES_WORKBOOK_LABEL,
    )
  })
})
