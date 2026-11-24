import { ServiceUnavailableException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ArriendosWorkbookService } from './arriendos-workbook.service.js'
import type { ColocadoresWorkbookWriterService } from './colocadores-workbook.writer.service.js'
import type { ExternalDataConfigService } from './external-data.config.service.js'

describe('ArriendosWorkbookService', () => {
  let config: {
    enabled: boolean
    source: 'file' | 'graph'
    localWorkbookPath: string
    worksheetName: string
  }
  let writer: {
    writeFieldsByDocument: ReturnType<typeof vi.fn>
  }
  let service: ArriendosWorkbookService

  beforeEach(() => {
    config = {
      enabled: true,
      source: 'file',
      localWorkbookPath: 'W:/FR-SG-79.xlsx',
      worksheetName: 'FR-SG-79',
    }
    writer = { writeFieldsByDocument: vi.fn() }
    service = new ArriendosWorkbookService(
      config as unknown as ExternalDataConfigService,
      writer as unknown as ColocadoresWorkbookWriterService,
    )
  })

  it('escribe las dos celdas de FR-SG-79 por número de documento', async () => {
    writer.writeFieldsByDocument.mockResolvedValue({
      followUp: 'Si',
      observations: '',
    })

    await service.writeFollowUp('93082817', 'No', 'Observación')

    expect(writer.writeFieldsByDocument).toHaveBeenCalledWith(
      'W:/FR-SG-79.xlsx',
      'FR-SG-79',
      '93082817',
      { followUp: 'No', observations: 'Observación' },
      'FR-SG-79',
    )
  })

  it('rechaza la escritura si el libro no está configurado', async () => {
    config.localWorkbookPath = ''

    await expect(
      service.writeFollowUp('93082817', 'No', ''),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(writer.writeFieldsByDocument).not.toHaveBeenCalled()
  })

  it('rechaza la escritura si la fuente no es archivo local', async () => {
    config.source = 'graph'

    await expect(
      service.writeFollowUp('93082817', 'No', ''),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(writer.writeFieldsByDocument).not.toHaveBeenCalled()
  })
})
