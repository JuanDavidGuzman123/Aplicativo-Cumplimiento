import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  Sse,
} from '@nestjs/common'
import type { MessageEvent } from '@nestjs/common'
import type { Response } from 'express'
import { filter, map, type Observable } from 'rxjs'
import { ExternalDataCacheService } from './external-data.cache.service.js'
import { ExternalDataReportService } from './external-data-report.service.js'
import { ExternalDataService } from './external-data.service.js'
import { ListExternalUpdatesDueQueryDto } from './dto/list-external-updates-due-query.dto.js'
import { ListExternalUpdatesQueryDto } from './dto/list-external-updates-query.dto.js'
import {
  EXTERNAL_REPORT_METRICS,
  type ExternalReportMetric,
} from './types.js'

@Controller('external-data')
export class ExternalDataController {
  constructor(
    private readonly dataService: ExternalDataService,
    private readonly cache: ExternalDataCacheService,
    private readonly reportService: ExternalDataReportService,
  ) {}

  @Get('summary')
  getSummary() {
    return this.dataService.getSummary()
  }

  @Get('updates-due')
  getUpdatesDue(@Query() query: ListExternalUpdatesDueQueryDto) {
    return this.dataService.getUpdatesDue({
      sort: query.sort,
      dir: query.dir,
      page: query.page,
      pageSize: query.pageSize,
    })
  }

  @Get('status')
  getStatus() {
    return this.dataService.getStatus()
  }

  @Get('reports/pending-active')
  async getPendingActiveReport(@Res() response: Response) {
    await this.sendReport('pending-active', response)
  }

  @Get('reports/:metric')
  async getReport(
    @Param('metric') metric: string,
    @Res() response: Response,
  ) {
    if (
      !EXTERNAL_REPORT_METRICS.includes(metric as ExternalReportMetric)
    ) {
      throw new BadRequestException(
        'Métrica de reporte no válida',
      )
    }

    await this.sendReport(metric as ExternalReportMetric, response)
  }

  @Post('refresh')
  refresh() {
    return this.dataService.refresh('manual')
  }

  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.cache.events.pipe(
      filter((event) => event.source === 'arriendos'),
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
      code: query.code,
      search: query.search,
      status: query.status as never,
      annualStatus: query.annualStatus as never,
      requiresSemiannualFollowUp: query.requiresSemiannualFollowUp,
      sort: query.sort,
      dir: query.dir,
      page: query.page,
      pageSize: query.pageSize,
    })
  }

  private async sendReport(
    metric: ExternalReportMetric,
    response: Response,
  ): Promise<void> {
    const file = await this.reportService.generate(metric)
    const fileName = `reporte-${metric}-${new Date().toISOString().slice(0, 10)}.xlsx`

    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    })
    response.send(file)
  }
}

@Controller('external-data/clientes')
export class ExternalClientesDataController {
  constructor(
    private readonly dataService: ExternalDataService,
    private readonly cache: ExternalDataCacheService,
    private readonly reportService: ExternalDataReportService,
  ) {}

  @Get('summary')
  getSummary() {
    return this.dataService.getSummary('clientes')
  }

  @Get('updates-due')
  getUpdatesDue(@Query() query: ListExternalUpdatesDueQueryDto) {
    return this.dataService.getUpdatesDue(
      {
        page: query.page,
        pageSize: query.pageSize,
      },
      'clientes',
    )
  }

  @Get('status')
  getStatus() {
    return this.dataService.getStatus('clientes')
  }

  @Get('reports/pending-active')
  async getPendingActiveReport(@Res() response: Response) {
    await this.sendReport('pending-active', response)
  }

  @Get('reports/:metric')
  async getReport(
    @Param('metric') metric: string,
    @Res() response: Response,
  ) {
    if (
      !EXTERNAL_REPORT_METRICS.includes(metric as ExternalReportMetric)
    ) {
      throw new BadRequestException('Métrica de reporte no válida')
    }

    await this.sendReport(metric as ExternalReportMetric, response)
  }

  @Post('refresh')
  refresh() {
    return this.dataService.refresh(
      'actualización manual de Clientes',
      'clientes',
    )
  }

  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.cache.events.pipe(
      filter((event) => event.source === 'clientes'),
      map((event) => ({
        type: event.type,
        id: event.at,
        data: event,
      })),
    )
  }

  @Get()
  findAll(@Query() query: ListExternalUpdatesQueryDto) {
    return this.dataService.findAll(
      {
        code: query.code,
        search: query.search,
        status: query.status as never,
        annualStatus: query.annualStatus as never,
        requiresSemiannualFollowUp: query.requiresSemiannualFollowUp,
        sort: query.sort,
        dir: query.dir,
        page: query.page,
        pageSize: query.pageSize,
      },
      'clientes',
    )
  }

  private async sendReport(
    metric: ExternalReportMetric,
    response: Response,
  ): Promise<void> {
    const file = await this.reportService.generate(metric, 'clientes')
    const fileName = `reporte-clientes-${metric}-${new Date().toISOString().slice(0, 10)}.xlsx`

    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    })
    response.send(file)
  }
}
