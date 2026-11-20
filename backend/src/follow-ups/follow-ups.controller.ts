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
} from '@nestjs/common'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { AuthenticatedUser } from '../common/types/authenticated-user.js'
import { CreateFollowUpDto } from './dto/create-follow-up.dto.js'
import { FinalizeFollowUpDto } from './dto/finalize-follow-up.dto.js'
import { UpdateFollowUpDto } from './dto/update-follow-up.dto.js'
import { FollowUpsService } from './follow-ups.service.js'

@Controller()
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @Get('counterparties/:counterpartyId/follow-ups')
  findAll(
    @Param('counterpartyId', ParseUUIDPipe) counterpartyId: string,
  ) {
    return this.followUpsService.findAll(counterpartyId)
  }

  @Post('counterparties/:counterpartyId/follow-ups')
  create(
    @Param('counterpartyId', ParseUUIDPipe) counterpartyId: string,
    @Body() dto: CreateFollowUpDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.followUpsService.create(counterpartyId, dto, actor)
  }

  @Patch('follow-ups/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFollowUpDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.followUpsService.update(id, dto, actor)
  }

  @Post('follow-ups/:id/finalize')
  @HttpCode(HttpStatus.OK)
  finalize(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinalizeFollowUpDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.followUpsService.finalize(id, dto, actor)
  }
}
