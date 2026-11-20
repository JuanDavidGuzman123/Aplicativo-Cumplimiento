import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ExternalGraphSubscription } from './types.js'
import { ExternalDataConfigService } from './external-data.config.service.js'

type TokenResponse = {
  access_token: string
  expires_in: number
}

type GraphValueResponse<T> = {
  value: T[]
  '@odata.nextLink'?: string
}

type GraphDriveItem = {
  id: string
  name: string
  eTag?: string | null
  lastModifiedDateTime?: string | null
  webUrl?: string | null
}

type GraphTable = {
  id: string
  name: string
}

type GraphWorksheet = {
  id: string
  name: string
}

type GraphRangeResponse = {
  values?: unknown[][]
}

type GraphTableRow = {
  values?: unknown[]
}

type GraphSubscriptionResponse = {
  id: string
  resource?: string
  notificationUrl?: string
  expirationDateTime?: string
  clientState?: string | null
}

@Injectable()
export class MicrosoftGraphService {
  private readonly logger = new Logger(MicrosoftGraphService.name)
  private accessToken = ''
  private tokenExpiresAt = 0
  private tokenPromise: Promise<string> | null = null

  constructor(private readonly config: ExternalDataConfigService) {}

  get driveItemsPath(): string {
    return `/drives/${encodeURIComponent(this.config.driveId)}/items/${encodeURIComponent(this.config.itemId)}`
  }

  get resource(): string {
    return `/drives/${this.config.driveId}/items/${this.config.itemId}`
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken
    }

    if (this.tokenPromise) {
      return this.tokenPromise
    }

    this.tokenPromise = this.requestAccessToken().finally(() => {
      this.tokenPromise = null
    })

    return this.tokenPromise
  }

  async getDriveItem(): Promise<GraphDriveItem> {
    const select = encodeURIComponent(
      'id,name,eTag,lastModifiedDateTime,webUrl',
    )
    return this.request<GraphDriveItem>(
      `${this.driveItemsPath}?$select=${select}`,
    )
  }

  async listTables(): Promise<GraphTable[]> {
    const result = await this.request<GraphValueResponse<GraphTable>>(
      `${this.driveItemsPath}/workbook/tables`,
    )
    return result.value ?? []
  }

  async listWorksheets(): Promise<GraphWorksheet[]> {
    const result = await this.request<
      GraphValueResponse<GraphWorksheet>
    >(`${this.driveItemsPath}/workbook/worksheets`)
    return result.value ?? []
  }

  async getTableHeader(tableId: string): Promise<unknown[]> {
    const result = await this.request<GraphRangeResponse>(
      `${this.driveItemsPath}/workbook/tables/${encodeURIComponent(tableId)}/headerRowRange`,
    )
    return result.values?.[0] ?? []
  }

  async getTableRows(tableId: string): Promise<unknown[][]> {
    const values: unknown[][] = []
    let next: string | undefined = `${this.driveItemsPath}/workbook/tables/${encodeURIComponent(tableId)}/rows`

    while (next) {
      const result: GraphValueResponse<GraphTableRow> =
        await this.request<GraphValueResponse<GraphTableRow>>(next)
      values.push(
        ...(result.value ?? []).map(
          (row: GraphTableRow) => row.values ?? [],
        ),
      )
      next = result['@odata.nextLink']
    }

    return values
  }

  async getWorksheetValues(worksheetId: string): Promise<unknown[][]> {
    const result = await this.request<GraphRangeResponse>(
      `${this.driveItemsPath}/workbook/worksheets/${encodeURIComponent(worksheetId)}/usedRange`,
    )
    return result.values ?? []
  }

  async listSubscriptions(): Promise<ExternalGraphSubscription[]> {
    const result = await this.request<
      GraphValueResponse<GraphSubscriptionResponse>
    >('/subscriptions')
    return (result.value ?? []).map((subscription) => ({
      id: subscription.id,
      resource: subscription.resource ?? '',
      notificationUrl: subscription.notificationUrl ?? '',
      expirationDateTime: subscription.expirationDateTime ?? '',
      clientState: subscription.clientState ?? null,
    }))
  }

  async createSubscription(
    expirationDateTime: string,
  ): Promise<ExternalGraphSubscription> {
    const result = await this.request<GraphSubscriptionResponse>(
      '/subscriptions',
      {
        method: 'POST',
        body: JSON.stringify({
          notificationUrl: `${this.config.webhookUrl}/external-data/webhook`,
          lifecycleNotificationUrl: `${this.config.webhookUrl}/external-data/webhook`,
          resource: this.resource,
          expirationDateTime,
          clientState: this.config.webhookClientState,
          changeType: 'updated',
        }),
      },
    )

    return {
      id: result.id,
      resource: result.resource ?? this.resource,
      notificationUrl: result.notificationUrl ?? '',
      expirationDateTime:
        result.expirationDateTime ?? expirationDateTime,
      clientState: result.clientState ?? null,
    }
  }

  async renewSubscription(
    subscriptionId: string,
    expirationDateTime: string,
  ): Promise<ExternalGraphSubscription> {
    const result = await this.request<GraphSubscriptionResponse>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expirationDateTime }),
      },
    )

    return {
      id: result.id ?? subscriptionId,
      resource: result.resource ?? this.resource,
      notificationUrl: result.notificationUrl ?? '',
      expirationDateTime:
        result.expirationDateTime ?? expirationDateTime,
      clientState: result.clientState ?? null,
    }
  }

  private async requestAccessToken(): Promise<string> {
    const tenant = encodeURIComponent(this.config.tenantId)
    const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(this.config.graphTimeoutMs),
    })

    if (!response.ok) {
      const detail = await this.readError(response)
      throw new ServiceUnavailableException(
        `No fue posible autenticar con Microsoft Graph (${response.status}): ${detail}`,
      )
    }

    const data = (await response.json()) as TokenResponse

    if (!data.access_token) {
      throw new ServiceUnavailableException(
        'Microsoft Graph no devolvió un token de acceso',
      )
    }

    this.accessToken = data.access_token
    this.tokenExpiresAt =
      Date.now() + Math.max(data.expires_in - 60, 60) * 1000

    return this.accessToken
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: string } = {},
  ): Promise<T> {
    const token = await this.getAccessToken()
    const url = path.startsWith('http')
      ? path
      : `${this.config.graphBaseUrl}${path}`
    let lastError = ''

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(url, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(init.body
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        body: init.body,
        signal: AbortSignal.timeout(this.config.graphTimeoutMs),
      })

      if (response.ok) {
        if (response.status === 204) {
          return undefined as T
        }
        return (await response.json()) as T
      }

      lastError = await this.readError(response)

      if (
        response.status !== 429 &&
        response.status !== 500 &&
        response.status !== 502 &&
        response.status !== 503 &&
        response.status !== 504
      ) {
        break
      }

      const retryAfter = Number(response.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : 500 * 2 ** attempt
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }

    this.logger.error(
      `Error de Microsoft Graph en ${path}: ${lastError}`,
    )
    throw new ServiceUnavailableException(
      `Microsoft Graph respondió un error: ${lastError}`,
    )
  }

  private async readError(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as {
        error?: { message?: string; code?: string }
      }
      return (
        body.error?.message ??
        body.error?.code ??
        response.statusText ??
        `HTTP ${response.status}`
      )
    } catch {
      return response.statusText || `HTTP ${response.status}`
    }
  }
}
