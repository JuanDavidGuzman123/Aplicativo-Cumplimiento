import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'
import { AnnualNotificationsService } from './annual-notifications.service.js'

@Injectable()
export class AnnualNotificationsScheduler
  implements OnModuleInit, OnApplicationBootstrap
{
  private readonly logger = new Logger(
    AnnualNotificationsScheduler.name,
  )

  constructor(
    private readonly annualNotificationsService: AnnualNotificationsService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    const configured =
      this.config.get<string>('SCHEDULE_NOTIFICATIONS_CRON') ??
      '0 7 * * *'
    let expression = configured

    try {
      new CronJob(expression, () => undefined, null, false)
    } catch {
      this.logger.warn(
        `Expresión cron inválida "${configured}"; se usará "0 7 * * *"`,
      )
      expression = '0 7 * * *'
    }

    const job = new CronJob(
      expression,
      () => {
        void this.annualNotificationsService
          .generateDaily()
          .catch((error: unknown) => {
            this.logger.error(
              'No fue posible generar las notificaciones anuales diarias',
              error instanceof Error ? error.stack : undefined,
            )
          })
      },
      null,
      false,
      'America/Bogota',
    )

    this.schedulerRegistry.addCronJob(
      'annual-notifications-daily',
      job,
    )
    job.start()
  }

  async onApplicationBootstrap() {
    try {
      const result =
        await this.annualNotificationsService.generateDaily()

      if (result.created > 0) {
        this.logger.log(
          `Generación inicial anual: ${result.created} notificaciones nuevas`,
        )
      }
    } catch (error) {
      this.logger.error(
        'No fue posible generar las notificaciones anuales iniciales',
        error instanceof Error ? error.stack : undefined,
      )
    }
  }
}
