import { Module } from '@nestjs/common'
import { ExternalDataModule } from '../external-data/external-data.module.js'
import { CounterpartySyncService } from './counterparty-sync.service.js'
import { CounterpartiesController } from './counterparties.controller.js'
import { CounterpartiesService } from './counterparties.service.js'

@Module({
  imports: [ExternalDataModule],
  controllers: [CounterpartiesController],
  providers: [CounterpartiesService, CounterpartySyncService],
  exports: [CounterpartiesService, CounterpartySyncService],
})
export class CounterpartiesModule {}
