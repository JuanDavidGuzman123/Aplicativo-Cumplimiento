import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { createObserveModule } from '@nestjs/observe';
import { AnnualNotificationsModule } from './annual-notifications/annual-notifications.module.js';
import { AnnualUpdatesModule } from './annual-updates/annual-updates.module.js';
import { AppController } from './app.controller.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { CounterpartiesModule } from './counterparties/counterparties.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { ExternalDataModule } from './external-data/external-data.module.js';
import { FollowUpsModule } from './follow-ups/follow-ups.module.js';
import { validateEnvironment } from './config/env.validation.js';
import { ImportsModule } from './imports/imports.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SubprocessesModule } from './subprocesses/subprocesses.module.js';
import { UsersModule } from './users/users.module.js';

const observeAppKey = process.env.OBSERVE_APP_KEY ?? '';
const observeAppSecret = process.env.OBSERVE_APP_SECRET ?? '';

export const { ObserveModule, ObserveInstrument } = createObserveModule({
  sourceContext: false,
});

@Module({
  imports: [
    ObserveModule.forRoot({
      enabled:
        process.env.NODE_ENV === 'production' &&
        Boolean(observeAppKey && observeAppSecret),
      appKey: observeAppKey,
      appSecret: observeAppSecret,
      serviceId:
        process.env.OBSERVE_SERVICE_ID ??
        'seguimiento-contrapartes-api',
      serviceVersion: process.env.OBSERVE_SERVICE_VERSION,
      http: {
        getUserId: (request) => {
          const authenticatedRequest = request as {
            user?: { id?: string };
          };
          return authenticatedRequest.user?.id ?? 'anonymous';
        },
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AnnualUpdatesModule,
    AnnualNotificationsModule,
    ExternalDataModule,
    AuthModule,
    UsersModule,
    SubprocessesModule,
    CounterpartiesModule,
    DashboardModule,
    FollowUpsModule,
    DocumentsModule,
    NotificationsModule,
    ImportsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
