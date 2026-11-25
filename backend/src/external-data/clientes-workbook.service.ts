import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  ColocadoresWorkbookWriterService,
  type WorkbookFieldsSnapshot,
} from './colocadores-workbook.writer.service.js'
import { ExternalDataConfigService } from './external-data.config.service.js'

export const CLIENTES_CATEGORY_KEY = 'CLIENTES'
export const CLIENTES_WORKBOOK_LABEL = 'FR-SG-80'

@Injectable()
export class ClientesWorkbookService {
  constructor(
    private readonly config: ExternalDataConfigService,
    private readonly writer: ColocadoresWorkbookWriterService,
  ) {}

  async writeFollowUp(
    document: string,
    followUp: string,
    observations: string,
    status?: string,
  ): Promise<WorkbookFieldsSnapshot> {
    if (!this.config.clientesReadConfigured) {
      throw new ServiceUnavailableException(
        'El libro FR-SG-80 no está configurado',
      )
    }

    if (this.config.source !== 'file') {
      throw new ServiceUnavailableException(
        'La actualización de FR-SG-80 solo está disponible en modo archivo local',
      )
    }

    return this.writer.writeFieldsByDocument(
      this.config.clientesWorkbookPath,
      this.config.clientesWorksheetName,
      document,
      { followUp, observations, ...(status ? { status } : {}) },
      CLIENTES_WORKBOOK_LABEL,
    )
  }
}
