import { Module } from '@nestjs/common'
import { AnnualExternalSyncModule } from './annual-external-sync.module.js'
import { AnnualNotificationsModule } from '../annual-notifications/annual-notifications.module.js'
import { AnnualUpdatesController } from './annual-updates.controller.js'
import { AnnualUpdatesService } from './annual-updates.service.js'

@Module({
  imports: [AnnualNotificationsModule, AnnualExternalSyncModule],
  controllers: [AnnualUpdatesController],
  providers: [AnnualUpdatesService],
})
export class AnnualUpdatesModule {}
