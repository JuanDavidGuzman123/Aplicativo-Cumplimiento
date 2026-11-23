import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import type { AuthenticatedUser } from '../common/types/authenticated-user.js'
import {
  COLOCADORES_CATEGORY_KEY,
  ColocadoresWorkbookService,
} from '../external-data/colocadores-workbook.service.js'
import { CounterpartySyncService } from './counterparty-sync.service.js'
import { CounterpartiesService } from './counterparties.service.js'
import { ReactivateCounterpartyDto } from './dto/counterparty-action.dto.js'
import { ListCounterpartiesQueryDto } from './dto/list-counterparties-query.dto.js'
import { EvaluateRiskDto } from './dto/risk-evaluation.dto.js'

@Controller('counterparties')
export class CounterpartiesController {
  constructor(
    private readonly counterpartiesService: CounterpartiesService,
    private readonly syncService: CounterpartySyncService,
    private readonly colocadores: ColocadoresWorkbookService,
  ) {}

  @Get()
  findAll(@Query() query: ListCounterpartiesQueryDto) {
    if (query.category === COLOCADORES_CATEGORY_KEY) {
      return this.colocadores.list(query)
    }

    return this.counterpartiesService.findAll(query)
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    if (await this.colocadores.has(id)) {
      return this.colocadores.findOne(id)
    }

    return this.counterpartiesService.findOne(id)
  }

  @Post('sync-arriendos')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @HttpCode(HttpStatus.OK)
  syncArriendos(@CurrentUser() actor: AuthenticatedUser) {
    return this.syncService.syncArriendos(actor.id)
  }

  @Post('sync-colocadores')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @HttpCode(HttpStatus.OK)
  syncColocadores(@CurrentUser() _actor: AuthenticatedUser) {
    return this.colocadores.prepareWorkbook()
  }

  @Post(':id/risk-evaluation')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @HttpCode(HttpStatus.OK)
  async evaluateRisk(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvaluateRiskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (await this.colocadores.has(id)) {
      return this.colocadores.evaluateRisk(id, dto, actor.id)
    }

    return this.counterpartiesService.evaluateRisk(id, dto, actor.id)
  }

  @Post(':id/reactivate')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @HttpCode(HttpStatus.OK)
  async reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReactivateCounterpartyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (await this.colocadores.has(id)) {
      return this.colocadores.reactivate(id, dto, actor.id)
    }

    return this.counterpartiesService.reactivate(id, dto, actor.id)
  }
}
