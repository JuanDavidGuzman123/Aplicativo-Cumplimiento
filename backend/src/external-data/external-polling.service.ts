import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { ExternalDataService } from './external-data.service.js'

@Injectable()
export class ExternalPollingService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExternalPollingService.name)
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly config: ExternalDataConfigService,
    private readonly dataService: ExternalDataService,
  ) {}

  onModuleInit(): void {
    if (!this.config.readConfigured) {
      return
    }

    this.timer = setInterval(() => {
      void this.dataService.refresh('polling de respaldo').catch(
        (error: unknown) => {
          this.logger.warn(
            `No se pudo ejecutar el polling externo: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        },
      )
    }, this.config.pollMs)
    this.timer.unref?.()
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
