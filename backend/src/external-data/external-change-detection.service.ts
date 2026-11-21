import {
  Injectable,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common'
import { createHash } from 'node:crypto'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { ExternalDataService } from './external-data.service.js'
import { ExternalSubscriptionService } from './external-subscription.service.js'

type GraphNotification = {
  subscriptionId?: string
  clientNotificationId?: string
  changeType?: string
  resource?: string
  clientState?: string
  resourceData?: Record<string, unknown>
  lifecycle?: { event?: string }
}

type GraphNotificationPayload = {
  value?: GraphNotification[]
}

@Injectable()
export class ExternalChangeDetectionService implements OnModuleDestroy {
  private readonly logger = new Logger(ExternalChangeDetectionService.name)
  private readonly seen = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private refreshReason = 'webhook'

  constructor(
    private readonly config: ExternalDataConfigService,
    private readonly dataService: ExternalDataService,
    private readonly subscription: ExternalSubscriptionService,
  ) {}

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  async handleWebhook(payload: unknown): Promise<void> {
    if (this.config.source === 'file') {
      return
    }

    const notifications = this.readNotifications(payload)

    if (notifications.length === 0) {
      this.logger.warn('Notificación de Microsoft Graph sin entradas')
      return
    }

    let shouldRefresh = false
    const lifecycleEvents: string[] = []

    for (const notification of notifications) {
      if (notification.clientState !== this.config.webhookClientState) {
        throw new UnauthorizedException(
          'clientState de Microsoft Graph no válido',
        )
      }

      const key = this.dedupeKey(notification)

      if (this.seen.has(key)) {
        continue
      }

      this.remember(key)

      if (notification.lifecycle?.event) {
        lifecycleEvents.push(notification.lifecycle.event)
        continue
      }

      if (
        notification.changeType === 'updated' ||
        notification.changeType === 'created'
      ) {
        shouldRefresh = true
      }
    }

    if (lifecycleEvents.length > 0) {
      await Promise.all(
        lifecycleEvents.map((event) =>
          this.subscription.handleLifecycleEvent(event),
        ),
      )
    }

    if (shouldRefresh) {
      this.scheduleRefresh('cambio en Microsoft Graph')
    }
  }

  private scheduleRefresh(reason: string): void {
    this.refreshReason = reason

    if (this.timer) {
      clearTimeout(this.timer)
    }

    this.timer = setTimeout(() => {
      this.timer = null
      const refreshReason = this.refreshReason
      void this.dataService.refresh(refreshReason).catch(
        (error: unknown) => {
          this.logger.error(
            `No se pudo refrescar tras la notificación: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        },
      )
    }, this.config.debounceMs)
    this.timer.unref?.()
  }

  private readNotifications(payload: unknown): GraphNotification[] {
    if (!payload || typeof payload !== 'object') {
      return []
    }

    const value = (payload as GraphNotificationPayload).value
    return Array.isArray(value) ? value : []
  }

  private dedupeKey(notification: GraphNotification): string {
    if (notification.clientNotificationId) {
      return `id:${notification.clientNotificationId}`
    }

    return `hash:${createHash('sha256')
      .update(JSON.stringify(notification))
      .digest('hex')}`
  }

  private remember(key: string): void {
    if (this.seen.size >= 1000) {
      const oldest = this.seen.values().next().value
      if (oldest) {
        this.seen.delete(oldest)
      }
    }

    this.seen.add(key)
  }
}
