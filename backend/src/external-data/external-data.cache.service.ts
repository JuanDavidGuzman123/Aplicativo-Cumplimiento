import { Inject, Injectable } from '@nestjs/common'
import type { ReplaySubject } from 'rxjs'
import { EXTERNAL_EVENTS_SUBJECT } from './external-data.tokens.js'
import type {
  ExternalAnnualMapping,
  ExternalAnnualRow,
  ExternalDataStatus,
  ExternalImportHeader,
  ExternalStreamEvent,
  ExternalSubscriptionStatus,
  ExternalSyncStats,
} from './types.js'

type Snapshot = {
  rows: ExternalAnnualRow[]
  mapping: ExternalAnnualMapping
  mappingErrors: string[]
  headers: ExternalImportHeader[]
  version: string
  fileName: string | null
  sourceName: string | null
  sourceUrl: string | null
  lastModifiedDateTime: string | null
  stats: ExternalSyncStats
}

@Injectable()
export class ExternalDataCacheService {
  private readonly eventsSubject: ReplaySubject<ExternalStreamEvent>
  private snapshot: Snapshot | null = null
  private status: ExternalDataStatus = {
    enabled: false,
    configured: false,
    connection: 'disabled',
    freshness: 'never',
    sourceName: null,
    sourceUrl: null,
    version: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastChangeAt: null,
    lastError: null,
    rowCount: 0,
    mappingErrors: [],
    subscription: {
      state: 'disabled',
      id: null,
      expiresAt: null,
      message: null,
    },
    webhookConfigured: false,
    pollMs: 900000,
    serverNow: new Date().toISOString(),
  }

  constructor(
    @Inject(EXTERNAL_EVENTS_SUBJECT)
    eventsSubject: ReplaySubject<ExternalStreamEvent>,
  ) {
    this.eventsSubject = eventsSubject
  }

  get events() {
    return this.eventsSubject.asObservable()
  }

  getStatus(): ExternalDataStatus {
    return {
      ...this.status,
      subscription: { ...this.status.subscription },
      mappingErrors: [...this.status.mappingErrors],
      serverNow: new Date().toISOString(),
    }
  }

  getSnapshot(): Snapshot | null {
    return this.snapshot
  }

  initialize(options: {
    enabled: boolean
    configured: boolean
    webhookConfigured: boolean
    pollMs: number
  }): void {
    this.status = {
      ...this.status,
      enabled: options.enabled,
      configured: options.configured,
      webhookConfigured: options.webhookConfigured,
      pollMs: options.pollMs,
      connection: !options.enabled
        ? 'disabled'
        : options.configured
          ? 'connecting'
          : 'unconfigured',
      freshness: this.snapshot ? this.status.freshness : 'never',
      serverNow: new Date().toISOString(),
    }
    this.publish('status')
  }

  setSyncing(): void {
    this.status = {
      ...this.status,
      connection: this.snapshot ? 'connected' : 'connecting',
      lastAttemptAt: new Date().toISOString(),
      lastError: null,
      serverNow: new Date().toISOString(),
    }
    this.publish('status')
  }

  setSuccess(input: {
    rows: ExternalAnnualRow[]
    mapping: ExternalAnnualMapping
    mappingErrors: string[]
    headers: ExternalImportHeader[]
    version: string
    fileName: string
    sourceName: string
    sourceUrl: string | null
    lastModifiedDateTime: string | null
    stats: ExternalSyncStats
  }): ExternalSyncStats {
    const previous = this.snapshot?.rows ?? []
    const currentById = new Map(
      input.rows.map((row) => [row.id, row]),
    )
    const previousById = new Map(
      previous.map((row) => [row.id, row]),
    )
    let added = 0
    let updated = 0
    let unchanged = 0

    for (const [id, row] of currentById) {
      const old = previousById.get(id)

      if (!old) {
        added += 1
        continue
      }

      if (JSON.stringify(old) === JSON.stringify(row)) {
        unchanged += 1
      } else {
        updated += 1
      }
    }

    const removed = previous.filter((row) => !currentById.has(row.id)).length
    const stats: ExternalSyncStats = {
      ...input.stats,
      added,
      updated,
      unchanged,
      removed,
    }
    const versionChanged =
      this.snapshot?.version !== input.version || previous.length === 0
    const now = new Date().toISOString()

    this.snapshot = {
      rows: input.rows,
      mapping: input.mapping,
      mappingErrors: input.mappingErrors,
      headers: input.headers,
      version: input.version,
      fileName: input.fileName,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      lastModifiedDateTime: input.lastModifiedDateTime,
      stats,
    }

    this.status = {
      ...this.status,
      connection: 'connected',
      freshness: 'fresh',
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      version: input.version,
      lastAttemptAt: now,
      lastSuccessAt: now,
      lastChangeAt: versionChanged
        ? now
        : this.status.lastChangeAt,
      lastError: null,
      rowCount: input.rows.length,
      mappingErrors: input.mappingErrors,
      serverNow: now,
    }

    this.publish(versionChanged ? 'updated' : 'status', stats)
    return stats
  }

  setError(message: string): void {
    const now = new Date().toISOString()
    this.status = {
      ...this.status,
      connection: this.snapshot ? 'degraded' : 'error',
      freshness: this.snapshot ? 'stale' : 'error',
      lastAttemptAt: now,
      lastError: message,
      serverNow: now,
    }
    this.publish('error')
  }

  setUnconfigured(message: string): void {
    this.status = {
      ...this.status,
      connection: 'unconfigured',
      freshness: this.snapshot ? 'stale' : 'never',
      lastAttemptAt: new Date().toISOString(),
      lastError: message,
      serverNow: new Date().toISOString(),
    }
    this.publish('status')
  }

  setSubscriptionStatus(status: ExternalSubscriptionStatus): void {
    this.status = {
      ...this.status,
      subscription: { ...status },
      serverNow: new Date().toISOString(),
    }
    this.publish('status')
  }

  private publish(
    type: ExternalStreamEvent['type'],
    changes?: ExternalSyncStats,
  ): void {
    this.eventsSubject.next({
      type,
      at: new Date().toISOString(),
      status: this.getStatus(),
      ...(changes ? { changes } : {}),
    })
  }
}
