import { Inject, Injectable } from '@nestjs/common'
import type { ReplaySubject } from 'rxjs'
import { EXTERNAL_EVENTS_SUBJECT } from './external-data.tokens.js'
import type {
  ExternalAnnualMapping,
  ExternalAnnualRow,
  ExternalDataStatus,
  ExternalImportHeader,
  ExternalSource,
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

function createStatus(source: ExternalSource): ExternalDataStatus {
  return {
    source,
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
}

@Injectable()
export class ExternalDataCacheService {
  private readonly eventsSubject: ReplaySubject<ExternalStreamEvent>
  private readonly snapshots = new Map<ExternalSource, Snapshot>()
  private readonly statuses = new Map<ExternalSource, ExternalDataStatus>()

  constructor(
    @Inject(EXTERNAL_EVENTS_SUBJECT)
    eventsSubject: ReplaySubject<ExternalStreamEvent>,
  ) {
    this.eventsSubject = eventsSubject
  }

  get events() {
    return this.eventsSubject.asObservable()
  }

  getStatus(source: ExternalSource = 'arriendos'): ExternalDataStatus {
    const status = this.statuses.get(source) ?? createStatus(source)

    return {
      ...status,
      subscription: { ...status.subscription },
      mappingErrors: [...status.mappingErrors],
      serverNow: new Date().toISOString(),
    }
  }

  getSnapshot(source: ExternalSource = 'arriendos'): Snapshot | null {
    return this.snapshots.get(source) ?? null
  }

  initialize(
    options: {
      enabled: boolean
      configured: boolean
      webhookConfigured: boolean
      pollMs: number
    },
    source: ExternalSource = 'arriendos',
  ): void {
    const current = this.statuses.get(source) ?? createStatus(source)
    const snapshot = this.snapshots.get(source)

    this.statuses.set(source, {
      ...current,
      enabled: options.enabled,
      configured: options.configured,
      webhookConfigured: options.webhookConfigured,
      pollMs: options.pollMs,
      connection: !options.enabled
        ? 'disabled'
        : options.configured
          ? 'connecting'
          : 'unconfigured',
      freshness: snapshot ? current.freshness : 'never',
      serverNow: new Date().toISOString(),
    })
    this.publish('status', undefined, source)
  }

  setSyncing(source: ExternalSource = 'arriendos'): void {
    const current = this.statuses.get(source) ?? createStatus(source)

    this.statuses.set(source, {
      ...current,
      connection: this.snapshots.has(source) ? 'connected' : 'connecting',
      lastAttemptAt: new Date().toISOString(),
      lastError: null,
      serverNow: new Date().toISOString(),
    })
    this.publish('status', undefined, source)
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
    source?: ExternalSource
  }): ExternalSyncStats {
    const source = input.source ?? 'arriendos'
    const previous = this.snapshots.get(source)?.rows ?? []
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
      this.snapshots.get(source)?.version !== input.version ||
      previous.length === 0
    const now = new Date().toISOString()
    const current = this.statuses.get(source) ?? createStatus(source)

    this.snapshots.set(source, {
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
    })

    this.statuses.set(source, {
      ...current,
      source,
      connection: 'connected',
      freshness: 'fresh',
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      version: input.version,
      lastAttemptAt: now,
      lastSuccessAt: now,
      lastChangeAt: versionChanged ? now : current.lastChangeAt,
      lastError: null,
      rowCount: input.rows.length,
      mappingErrors: input.mappingErrors,
      serverNow: now,
    })

    this.publish(versionChanged ? 'updated' : 'status', stats, source)
    return stats
  }

  setError(message: string, source: ExternalSource = 'arriendos'): void {
    const now = new Date().toISOString()
    const current = this.statuses.get(source) ?? createStatus(source)

    this.statuses.set(source, {
      ...current,
      source,
      connection: this.snapshots.has(source) ? 'degraded' : 'error',
      freshness: this.snapshots.has(source) ? 'stale' : 'error',
      lastAttemptAt: now,
      lastError: message,
      serverNow: now,
    })
    this.publish('error', undefined, source)
  }

  setUnconfigured(
    message: string,
    source: ExternalSource = 'arriendos',
  ): void {
    const now = new Date().toISOString()
    const current = this.statuses.get(source) ?? createStatus(source)

    this.statuses.set(source, {
      ...current,
      source,
      connection: 'unconfigured',
      freshness: this.snapshots.has(source) ? 'stale' : 'never',
      lastAttemptAt: now,
      lastError: message,
      serverNow: now,
    })
    this.publish('status', undefined, source)
  }

  setSubscriptionStatus(
    status: ExternalSubscriptionStatus,
    source: ExternalSource = 'arriendos',
  ): void {
    const current = this.statuses.get(source) ?? createStatus(source)

    this.statuses.set(source, {
      ...current,
      source,
      subscription: { ...status },
      serverNow: new Date().toISOString(),
    })
    this.publish('status', undefined, source)
  }

  private publish(
    type: ExternalStreamEvent['type'],
    changes: ExternalSyncStats | undefined,
    source: ExternalSource,
  ): void {
    this.eventsSubject.next({
      type,
      source,
      at: new Date().toISOString(),
      status: this.getStatus(source),
      ...(changes ? { changes } : {}),
    })
  }
}
