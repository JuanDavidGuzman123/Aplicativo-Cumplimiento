import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { AuthenticatedUser } from '../common/types/authenticated-user.js'
import { AnnualNotificationsService } from './annual-notifications.service.js'

@Controller('annual-notifications')
export class AnnualNotificationsController {
  constructor(
    private readonly annualNotificationsService: AnnualNotificationsService,
  ) {}

  @Get()
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.annualNotificationsService.findAll(actor.id)
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.annualNotificationsService.markRead(id, actor.id)
  }
}
