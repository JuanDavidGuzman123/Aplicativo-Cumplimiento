import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ExternalDataCacheService } from './external-data.cache.service.js'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { MicrosoftGraphService } from './microsoft-graph.service.js'

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000
const RENEW_WINDOW_MS = 6 * 60 * 60 * 1000

@Injectable()
export class ExternalSubscriptionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExternalSubscriptionService.name)
  private timer: ReturnType<typeof setInterval> | null = null
  private ensurePromise: Promise<void> | null = null

  constructor(
    private readonly config: ExternalDataConfigService,
    private readonly graph: MicrosoftGraphService,
    private readonly cache: ExternalDataCacheService,
  ) {}

  get notificationUrl(): string {
    return `${this.config.webhookUrl}/external-data/webhook`
  }

  onModuleInit(): void {
    if (!this.config.webhookConfigured) {
      this.cache.setSubscriptionStatus({
        state: this.config.enabled ? 'unconfigured' : 'disabled',
        id: null,
        expiresAt: null,
        message: this.config.enabled
          ? 'Falta la URL pública o el clientState del webhook'
          : null,
      })
      return
    }

    void this.ensureSubscription().catch((error: unknown) => {
      this.logger.warn(
        `No se pudo preparar la suscripción de Microsoft Graph: ${this.errorMessage(error)}`,
      )
    })

    this.timer = setInterval(() => {
      void this.ensureSubscription().catch((error: unknown) => {
        this.logger.warn(
          `No se pudo renovar la suscripción de Microsoft Graph: ${this.errorMessage(error)}`,
        )
      })
    }, 60 * 60 * 1000)
    this.timer.unref?.()
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async handleLifecycleEvent(event: string): Promise<void> {
    if (!this.config.webhookConfigured) {
      return
    }

    if (
      event === 'subscriptionRemoved' ||
      event === 'missed' ||
      event === 'reauthorizationRequired'
    ) {
      await this.ensureSubscription()
    }
  }

  async ensureSubscription(): Promise<void> {
    if (!this.config.webhookConfigured) {
      this.cache.setSubscriptionStatus({
        state: 'unconfigured',
        id: null,
        expiresAt: null,
        message: 'Webhook de Microsoft Graph no configurado',
      })
      return
    }

    if (this.ensurePromise) {
      return this.ensurePromise
    }

    this.ensurePromise = this.doEnsureSubscription().finally(() => {
      this.ensurePromise = null
    })

    return this.ensurePromise
  }

  private async doEnsureSubscription(): Promise<void> {
    const now = Date.now()
    const subscriptions = await this.graph.listSubscriptions()
    const existing = subscriptions.find(
      (subscription) =>
        subscription.notificationUrl === this.notificationUrl &&
        subscription.resource === this.graph.resource,
    )

    if (
      existing?.id &&
      Date.parse(existing.expirationDateTime) > now + RENEW_WINDOW_MS
    ) {
      this.cache.setSubscriptionStatus({
        state: 'active',
        id: existing.id,
        expiresAt: existing.expirationDateTime,
        message: null,
      })
      return
    }

    const expiration = new Date(now + TWO_DAYS_MS).toISOString()
    const subscription = existing?.id
      ? await this.graph.renewSubscription(existing.id, expiration)
      : await this.graph.createSubscription(expiration)

    this.cache.setSubscriptionStatus({
      state: 'active',
      id: subscription.id,
      expiresAt: subscription.expirationDateTime,
      message: null,
    })
    this.logger.log(
      `Suscripción de Microsoft Graph activa hasta ${subscription.expirationDateTime}`,
    )
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
