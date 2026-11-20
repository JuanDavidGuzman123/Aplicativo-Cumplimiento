import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import type { AuthenticatedUser } from '../common/types/authenticated-user.js'
import { CreateSubprocessDto } from './dto/create-subprocess.dto.js'
import { UpdateSubprocessDto } from './dto/update-subprocess.dto.js'
import { SubprocessesService } from './subprocesses.service.js'

@Controller('subprocesses')
export class SubprocessesController {
  constructor(
    private readonly subprocessesService: SubprocessesService,
  ) {}

  @Get()
  findAll() {
    return this.subprocessesService.findAll()
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body() dto: CreateSubprocessDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.subprocessesService.create(dto, actor.id)
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubprocessDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.subprocessesService.update(id, dto, actor.id)
  }
}
