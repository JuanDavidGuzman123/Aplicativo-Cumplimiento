import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class ExternalDataConfigService {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('EXTERNAL_DATA_ENABLED') === true
  }

  get source(): 'graph' | 'file' {
    return this.config.get<string>('EXTERNAL_DATA_SOURCE')?.trim() ===
      'file'
      ? 'file'
      : 'graph'
  }

  get localWorkbookPath(): string {
    return (
      this.config.get<string>('EXTERNAL_WORKBOOK_PATH')?.trim() ?? ''
    )
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

  get refreshToken(): string {
    return this.config.get<string>('MICROSOFT_REFRESH_TOKEN')?.trim() ?? ''
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

  get colocadoresWorkbookPath(): string {
    return (
      this.config
        .get<string>('EXTERNAL_COLOCADORES_WORKBOOK_PATH')
        ?.trim() ?? ''
    )
  }

  get colocadoresWorksheetName(): string {
    return (
      this.config
        .get<string>('EXTERNAL_COLOCADORES_WORKSHEET_NAME')
        ?.trim() || 'FR-SG-81'
    )
  }

  get colocadoresReadConfigured(): boolean {
    return this.enabled && Boolean(this.colocadoresWorkbookPath)
  }

  get clientesWorkbookPath(): string {
    return (
      this.config.get<string>('EXTERNAL_CLIENTES_WORKBOOK_PATH')?.trim() ??
      ''
    )
  }

  get clientesWorksheetName(): string {
    return (
      this.config
        .get<string>('EXTERNAL_CLIENTES_WORKSHEET_NAME')
        ?.trim() || 'FR-SG-80'
    )
  }

  get clientesReadConfigured(): boolean {
    return this.enabled && Boolean(this.clientesWorkbookPath)
  }

  get proveedoresWorkbookPath(): string {
    return (
      this.config
        .get<string>('EXTERNAL_PROVEEDORES_WORKBOOK_PATH')
        ?.trim() ?? ''
    )
  }

  get proveedoresWorksheetName(): string {
    return (
      this.config
        .get<string>('EXTERNAL_PROVEEDORES_WORKSHEET_NAME')
        ?.trim() || 'FR-SG-83'
    )
  }

  get proveedoresReadConfigured(): boolean {
    return this.enabled && Boolean(this.proveedoresWorkbookPath)
  }

  get rawColumnMap(): string {
    return (
      this.config.get<string>('EXTERNAL_DATA_COLUMN_MAP')?.trim() ?? ''
    )
  }

  get rawClientesColumnMap(): string {
    return (
      this.config
        .get<string>('EXTERNAL_CLIENTES_COLUMN_MAP')
        ?.trim() ?? ''
    )
  }

  get rawProveedoresColumnMap(): string {
    return (
      this.config
        .get<string>('EXTERNAL_PROVEEDORES_COLUMN_MAP')
        ?.trim() ?? ''
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
    return (
      this.config.get<number>('EXTERNAL_FALLBACK_POLL_MS') ??
      (this.source === 'file' ? 60000 : 900000)
    )
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
    if (!this.enabled) {
      return false
    }

    if (this.source === 'file') {
      return Boolean(this.localWorkbookPath)
    }

    return Boolean(
      this.tenantId &&
        this.clientId &&
        this.clientSecret &&
        this.driveId &&
        this.itemId,
    )
  }

  get webhookConfigured(): boolean {
    if (this.source === 'file') {
      return false
    }

    return Boolean(
      this.readConfigured &&
        this.webhookUrl &&
        this.webhookClientState.length >= 16,
    )
  }
}
