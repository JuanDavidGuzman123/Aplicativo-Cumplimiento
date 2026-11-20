import { Controller, Get, Post, Query, Sse } from '@nestjs/common'
import type { MessageEvent } from '@nestjs/common'
import { map, type Observable } from 'rxjs'
import { ExternalDataCacheService } from './external-data.cache.service.js'
import { ExternalDataService } from './external-data.service.js'
import { ListExternalUpdatesDueQueryDto } from './dto/list-external-updates-due-query.dto.js'
import { ListExternalUpdatesQueryDto } from './dto/list-external-updates-query.dto.js'

@Controller('external-data')
export class ExternalDataController {
  constructor(
    private readonly dataService: ExternalDataService,
    private readonly cache: ExternalDataCacheService,
  ) {}

  @Get('summary')
  getSummary() {
    return this.dataService.getSummary()
  }

  @Get('updates-due')
  getUpdatesDue(@Query() query: ListExternalUpdatesDueQueryDto) {
    return this.dataService.getUpdatesDue({
      page: query.page,
      pageSize: query.pageSize,
    })
  }

  @Get('status')
  getStatus() {
    return this.dataService.getStatus()
  }

  @Post('refresh')
  refresh() {
    return this.dataService.refresh('manual')
  }

  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.cache.events.pipe(
      map((event) => ({
        type: event.type,
        id: event.at,
        data: event,
      })),
    )
  }

  @Get()
  findAll(@Query() query: ListExternalUpdatesQueryDto) {
    return this.dataService.findAll({
      search: query.search,
      status: query.status as never,
      annualStatus: query.annualStatus as never,
      requiresSemiannualFollowUp: query.requiresSemiannualFollowUp,
      page: query.page,
      pageSize: query.pageSize,
    })
  }
}
