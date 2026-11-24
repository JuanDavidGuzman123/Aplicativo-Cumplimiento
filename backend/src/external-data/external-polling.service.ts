import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { ExternalDataService } from './external-data.service.js'
import type { ExternalSource } from './types.js'

@Injectable()
export class ExternalPollingService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExternalPollingService.name)
  private readonly timers: Array<{
    source: ExternalSource
    timer: ReturnType<typeof setInterval>
  }> = []

  constructor(
    private readonly config: ExternalDataConfigService,
    private readonly dataService: ExternalDataService,
  ) {}

  onModuleInit(): void {
    const sources: Array<{
      source: ExternalSource
      configured: boolean
    }> = [
      {
        source: 'arriendos',
        configured: this.config.readConfigured,
      },
      {
        source: 'colocadores',
        configured: this.config.colocadoresReadConfigured,
      },
      {
        source: 'clientes',
        configured: this.config.clientesReadConfigured,
      },
    ]

    for (const { source, configured } of sources) {
      if (!this.config.enabled || !configured) {
        continue
      }

      const timer = setInterval(() => {
        void this.dataService
          .refresh('polling de respaldo', source)
          .catch((error: unknown) => {
            this.logger.warn(
              `No se pudo ejecutar el polling de ${source}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            )
          })
      }, this.config.pollMs)
      timer.unref?.()
      this.timers.push({ source, timer })
    }
  }

  onModuleDestroy(): void {
    for (const { timer } of this.timers) {
      clearInterval(timer)
    }
    this.timers.length = 0
  }
}
