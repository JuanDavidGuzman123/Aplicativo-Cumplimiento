import { Module } from '@nestjs/common'
import { ReplaySubject } from 'rxjs'
import { ExternalAnnualMapperService } from './external-annual-mapper.service.js'
import { ExternalChangeDetectionService } from './external-change-detection.service.js'
import { ExternalDataCacheService } from './external-data.cache.service.js'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { ExternalDataController } from './external-data.controller.js'
import { ExternalDataService } from './external-data.service.js'
import { EXTERNAL_EVENTS_SUBJECT } from './external-data.tokens.js'
import { ExternalPollingService } from './external-polling.service.js'
import { ExternalSubscriptionService } from './external-subscription.service.js'
import { ExternalWebhookController } from './external-webhook.controller.js'
import { ExternalWorkbookReaderService } from './external-workbook-reader.service.js'
import { MicrosoftGraphService } from './microsoft-graph.service.js'
import type { ExternalStreamEvent } from './types.js'

@Module({
  controllers: [ExternalDataController, ExternalWebhookController],
  providers: [
    {
      provide: EXTERNAL_EVENTS_SUBJECT,
      useFactory: () => new ReplaySubject<ExternalStreamEvent>(1),
    },
    ExternalDataConfigService,
    ExternalDataCacheService,
    MicrosoftGraphService,
    ExternalWorkbookReaderService,
    ExternalAnnualMapperService,
    ExternalDataService,
    ExternalPollingService,
    ExternalSubscriptionService,
    ExternalChangeDetectionService,
  ],
  exports: [ExternalDataService],
})
export class ExternalDataModule {}
