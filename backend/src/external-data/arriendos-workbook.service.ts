import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  ColocadoresWorkbookWriterService,
  type WorkbookFieldsSnapshot,
} from './colocadores-workbook.writer.service.js'
import { ExternalDataConfigService } from './external-data.config.service.js'

export const ARRIENDOS_WORKBOOK_LABEL = 'FR-SG-79'

@Injectable()
export class ArriendosWorkbookService {
  constructor(
    private readonly config: ExternalDataConfigService,
    private readonly writer: ColocadoresWorkbookWriterService,
  ) {}

  async writeFollowUp(
    document: string,
    followUp: string,
    observations: string,
  ): Promise<WorkbookFieldsSnapshot> {
    if (!this.config.enabled || !this.config.localWorkbookPath) {
      throw new ServiceUnavailableException(
        'El libro FR-SG-79 no está configurado',
      )
    }

    if (this.config.source !== 'file') {
      throw new ServiceUnavailableException(
        'La actualización de FR-SG-79 solo está disponible en modo archivo local',
      )
    }

    return this.writer.writeFieldsByDocument(
      this.config.localWorkbookPath,
      this.config.worksheetName || ARRIENDOS_WORKBOOK_LABEL,
      document,
      { followUp, observations },
      ARRIENDOS_WORKBOOK_LABEL,
    )
  }
}
