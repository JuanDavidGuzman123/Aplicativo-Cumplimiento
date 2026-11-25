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
  ) {}

  @Get()
  findAll(@Query() query: ListCounterpartiesQueryDto) {
    return this.counterpartiesService.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
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
  syncColocadores(@CurrentUser() actor: AuthenticatedUser) {
    return this.syncService.syncColocadores(actor.id)
  }

  @Post('sync-clientes')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @HttpCode(HttpStatus.OK)
  syncClientes(@CurrentUser() actor: AuthenticatedUser) {
    return this.syncService.syncClientes(actor.id)
  }

  @Post('sync-proveedores')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @HttpCode(HttpStatus.OK)
  syncProveedores(@CurrentUser() actor: AuthenticatedUser) {
    return this.syncService.syncProveedores(actor.id)
  }

  @Post(':id/risk-evaluation')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @HttpCode(HttpStatus.OK)
  evaluateRisk(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvaluateRiskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.counterpartiesService.evaluateRisk(id, dto, actor.id)
  }

  @Post(':id/reactivate')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @HttpCode(HttpStatus.OK)
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReactivateCounterpartyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.counterpartiesService.reactivate(id, dto, actor.id)
  }
}
