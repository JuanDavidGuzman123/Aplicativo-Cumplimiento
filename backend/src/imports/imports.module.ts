import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module.js'
import { ImportsController } from './imports.controller.js'
import { ImportsService } from './imports.service.js'

@Module({
  imports: [NotificationsModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
