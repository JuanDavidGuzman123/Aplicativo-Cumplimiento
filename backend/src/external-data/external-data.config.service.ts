import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class ExternalDataConfigService {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('EXTERNAL_DATA_ENABLED') === true
  }

  get tenantId(): string {
    return this.config.get<string>('MICROSOFT_TENANT_ID')?.trim() ?? ''
  }

  get clientId(): string {
    return this.config.get<string>('MICROSOFT_CLIENT_ID')?.trim() ?? ''
  }

  get clientSecret(): string {
    return this.config.get<string>('MICROSOFT_CLIENT_SECRET') ?? ''
  }

  get driveId(): string {
    return this.config.get<string>('SHAREPOINT_DRIVE_ID')?.trim() ?? ''
  }

  get itemId(): string {
    return this.config.get<string>('SHAREPOINT_ITEM_ID')?.trim() ?? ''
  }

  get tableName(): string {
    return (
      this.config.get<string>('EXTERNAL_DATA_TABLE_NAME')?.trim() ?? ''
    )
  }

  get worksheetName(): string {
    return (
      this.config.get<string>('EXTERNAL_DATA_WORKSHEET_NAME')?.trim() ??
      ''
    )
  }

  get rawColumnMap(): string {
    return (
      this.config.get<string>('EXTERNAL_DATA_COLUMN_MAP')?.trim() ?? ''
    )
  }

  get webhookUrl(): string {
    return (
      this.config
        .get<string>('EXTERNAL_WEBHOOK_PUBLIC_URL')
        ?.trim()
        .replace(/\/+$/, '') ?? ''
    )
  }

  get webhookClientState(): string {
    return (
      this.config.get<string>('EXTERNAL_WEBHOOK_CLIENT_STATE') ?? ''
    )
  }

  get graphBaseUrl(): string {
    return (
      this.config
        .get<string>('EXTERNAL_GRAPH_BASE_URL')
        ?.trim()
        .replace(/\/+$/, '') ?? 'https://graph.microsoft.com/v1.0'
    )
  }

  get graphTimeoutMs(): number {
    return this.config.get<number>('EXTERNAL_GRAPH_TIMEOUT_MS') ?? 15000
  }

  get pollMs(): number {
    return this.config.get<number>('EXTERNAL_FALLBACK_POLL_MS') ?? 900000
  }

  get debounceMs(): number {
    return (
      this.config.get<number>('EXTERNAL_REFRESH_DEBOUNCE_MS') ?? 2000
    )
  }

  get maxRows(): number {
    return this.config.get<number>('EXTERNAL_MAX_ROWS') ?? 5000
  }

  get readConfigured(): boolean {
    return Boolean(
      this.enabled &&
        this.tenantId &&
        this.clientId &&
        this.clientSecret &&
        this.driveId &&
        this.itemId,
    )
  }

  get webhookConfigured(): boolean {
    return Boolean(
      this.readConfigured &&
        this.webhookUrl &&
        this.webhookClientState.length >= 16,
    )
  }
}
