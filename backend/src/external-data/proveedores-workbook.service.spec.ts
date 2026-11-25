import { ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import {
  PROVEEDORES_WORKBOOK_LABEL,
  ProveedoresWorkbookService,
} from './proveedores-workbook.service.js'
import type { ColocadoresWorkbookWriterService } from './colocadores-workbook.writer.service.js'
import type { ExternalDataConfigService } from './external-data.config.service.js'

function createService(
  overrides: Partial<ExternalDataConfigService> = {},
  writeFieldsByDocument = vi.fn(),
) {
  const config = {
    proveedoresReadConfigured: true,
    source: 'file',
    proveedoresWorkbookPath: 'C:\\datos\\proveedores.xlsx',
    proveedoresWorksheetName: 'FR-SG-83',
    ...overrides,
  } as unknown as ExternalDataConfigService
  const writer = {
    writeFieldsByDocument,
  } as unknown as ColocadoresWorkbookWriterService

  return {
    service: new ProveedoresWorkbookService(config, writer),
    writeFieldsByDocument,
  }
}

describe('ProveedoresWorkbookService', () => {
  it('rechaza la escritura cuando Proveedores no está configurado', async () => {
    const { service, writeFieldsByDocument } = createService({
      proveedoresReadConfigured: false,
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
        proveedoresWorkbookPath: 'C:\\datos\\FR-SG-83.xlsx',
        proveedoresWorksheetName: 'Proveedores 2026',
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
      'C:\\datos\\FR-SG-83.xlsx',
      'Proveedores 2026',
      '900123456-7',
      {
        followUp: 'Sí',
        observations: 'Actualizar diligenciamiento',
      },
      PROVEEDORES_WORKBOOK_LABEL,
    )
  })
})
