import { Module } from '@nestjs/common'
import { AnnualNotificationsController } from './annual-notifications.controller.js'
import { AnnualNotificationsScheduler } from './annual-notifications.scheduler.js'
import { AnnualNotificationsService } from './annual-notifications.service.js'

@Module({
  controllers: [AnnualNotificationsController],
  providers: [
    AnnualNotificationsService,
    AnnualNotificationsScheduler,
  ],
  exports: [AnnualNotificationsService],
})
export class AnnualNotificationsModule {}
