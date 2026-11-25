import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  ColocadoresWorkbookWriterService,
  type WorkbookFieldsSnapshot,
} from './colocadores-workbook.writer.service.js'
import { ExternalDataConfigService } from './external-data.config.service.js'

export const PROVEEDORES_CATEGORY_KEY = 'PROVEEDORES'
export const PROVEEDORES_WORKBOOK_LABEL = 'FR-SG-83'

@Injectable()
export class ProveedoresWorkbookService {
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
    if (!this.config.proveedoresReadConfigured) {
      throw new ServiceUnavailableException(
        'El libro FR-SG-83 no está configurado',
      )
    }

    if (this.config.source !== 'file') {
      throw new ServiceUnavailableException(
        'La actualización de FR-SG-83 solo está disponible en modo archivo local',
      )
    }

    return this.writer.writeFieldsByDocument(
      this.config.proveedoresWorkbookPath,
      this.config.proveedoresWorksheetName,
      document,
      { followUp, observations, ...(status ? { status } : {}) },
      PROVEEDORES_WORKBOOK_LABEL,
    )
  }
}
