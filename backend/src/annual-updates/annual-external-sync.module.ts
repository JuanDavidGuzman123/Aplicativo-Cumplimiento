import { Module } from '@nestjs/common'
import { ExternalDataModule } from '../external-data/external-data.module.js'
import { AnnualExternalSyncService } from './annual-external-sync.service.js'

@Module({
  imports: [ExternalDataModule],
  providers: [AnnualExternalSyncService],
  exports: [AnnualExternalSyncService],
})
export class AnnualExternalSyncModule {}
