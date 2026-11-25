import { Module } from '@nestjs/common'
import { AnnualExternalSyncModule } from '../annual-updates/annual-external-sync.module.js'
import { AnnualNotificationsController } from './annual-notifications.controller.js'
import { AnnualNotificationsScheduler } from './annual-notifications.scheduler.js'
import { AnnualNotificationsService } from './annual-notifications.service.js'

@Module({
  imports: [AnnualExternalSyncModule],
  controllers: [AnnualNotificationsController],
  providers: [
    AnnualNotificationsService,
    AnnualNotificationsScheduler,
  ],
  exports: [AnnualNotificationsService],
})
export class AnnualNotificationsModule {}
