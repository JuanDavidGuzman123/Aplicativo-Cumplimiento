import { Module } from '@nestjs/common'
import { ReplaySubject } from 'rxjs'
import { ArriendosWorkbookService } from './arriendos-workbook.service.js'
import { ColocadoresWorkbookService } from './colocadores-workbook.service.js'
import { ColocadoresWorkbookWriterService } from './colocadores-workbook.writer.service.js'
import { ClientesWorkbookService } from './clientes-workbook.service.js'
import { ProveedoresWorkbookService } from './proveedores-workbook.service.js'
import { DelegatedTokenStore } from './delegated-token.store.js'
import { ExternalAnnualMapperService } from './external-annual-mapper.service.js'
import { ExternalChangeDetectionService } from './external-change-detection.service.js'
import { ExternalDataCacheService } from './external-data.cache.service.js'
import { ExternalDataConfigService } from './external-data.config.service.js'
import {
  ExternalClientesDataController,
  ExternalDataController,
  ExternalProveedoresDataController,
} from './external-data.controller.js'
import { ExternalDataReportService } from './external-data-report.service.js'
import { ExternalDataService } from './external-data.service.js'
import { EXTERNAL_EVENTS_SUBJECT } from './external-data.tokens.js'
import { ExternalPollingService } from './external-polling.service.js'
import { ExternalSubscriptionService } from './external-subscription.service.js'
import { ExternalWebhookController } from './external-webhook.controller.js'
import { ExternalWorkbookReaderService } from './external-workbook-reader.service.js'
import { MicrosoftGraphService } from './microsoft-graph.service.js'
import type { ExternalStreamEvent } from './types.js'

@Module({
  controllers: [
    ExternalDataController,
    ExternalClientesDataController,
    ExternalProveedoresDataController,
    ExternalWebhookController,
  ],
  providers: [
    {
      provide: EXTERNAL_EVENTS_SUBJECT,
      useFactory: () => new ReplaySubject<ExternalStreamEvent>(1),
    },
    ExternalDataConfigService,
    ColocadoresWorkbookWriterService,
    ColocadoresWorkbookService,
    ArriendosWorkbookService,
    ClientesWorkbookService,
    ProveedoresWorkbookService,
    ExternalDataCacheService,
    DelegatedTokenStore,
    MicrosoftGraphService,
    ExternalWorkbookReaderService,
    ExternalAnnualMapperService,
    ExternalDataService,
    ExternalDataReportService,
    ExternalPollingService,
    ExternalSubscriptionService,
    ExternalChangeDetectionService,
  ],
  exports: [
    ExternalDataService,
    ColocadoresWorkbookService,
    ArriendosWorkbookService,
    ClientesWorkbookService,
    ProveedoresWorkbookService,
  ],
})
export class ExternalDataModule {}
