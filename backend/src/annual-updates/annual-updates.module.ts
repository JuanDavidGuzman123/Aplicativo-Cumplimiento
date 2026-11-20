import { Module } from '@nestjs/common'
import { AnnualNotificationsModule } from '../annual-notifications/annual-notifications.module.js'
import { AnnualUpdatesController } from './annual-updates.controller.js'
import { AnnualUpdatesService } from './annual-updates.service.js'

@Module({
  imports: [AnnualNotificationsModule],
  controllers: [AnnualUpdatesController],
  providers: [AnnualUpdatesService],
})
export class AnnualUpdatesModule {}
