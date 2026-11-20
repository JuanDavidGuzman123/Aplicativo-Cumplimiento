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
import { NotificationsService } from './notifications.service.js'

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.notificationsService.findAll(actor.id)
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notificationsService.markRead(id, actor.id)
  }
}
