import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import type { AuthenticatedUser } from '../common/types/authenticated-user.js'
import { CounterpartiesService } from './counterparties.service.js'
import {
  CounterpartyActionDto,
  ReactivateCounterpartyDto,
} from './dto/counterparty-action.dto.js'
import { CreateCounterpartyDto } from './dto/create-counterparty.dto.js'
import { ListCounterpartiesQueryDto } from './dto/list-counterparties-query.dto.js'
import { UpdateCounterpartyDto } from './dto/update-counterparty.dto.js'

@Controller('counterparties')
export class CounterpartiesController {
  constructor(
    private readonly counterpartiesService: CounterpartiesService,
  ) {}

  @Get()
  findAll(@Query() query: ListCounterpartiesQueryDto) {
    return this.counterpartiesService.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.counterpartiesService.findOne(id)
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body() dto: CreateCounterpartyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.counterpartiesService.create(dto, actor.id)
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCounterpartyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.counterpartiesService.update(id, dto, actor.id)
  }

  @Post(':id/archive')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CounterpartyActionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.counterpartiesService.archive(id, dto, actor.id)
  }

  @Post(':id/reactivate')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReactivateCounterpartyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.counterpartiesService.reactivate(id, dto, actor.id)
  }
}
