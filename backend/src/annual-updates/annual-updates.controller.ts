import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { UserRole } from '@prisma/client'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import type { AuthenticatedUser } from '../common/types/authenticated-user.js'
import {
  ANNUAL_SOURCES,
  DEFAULT_ANNUAL_SOURCE,
  type AnnualSource,
} from './annual-sources.js'
import { AnnualImportOptionsDto } from './dto/annual-import-options.dto.js'
import { ListAnnualUpdatesDueQueryDto } from './dto/list-annual-updates-due-query.dto.js'
import { ListAnnualUpdatesQueryDto } from './dto/list-annual-updates-query.dto.js'
import {
  AnnualUpdatesService,
  type UploadedAnnualFile,
} from './annual-updates.service.js'

@Controller('annual-updates')
export class AnnualUpdatesController {
  constructor(
    private readonly annualUpdatesService: AnnualUpdatesService,
  ) {}

  @Get('summary')
  getSummary(@Query('source') source?: string) {
    return this.annualUpdatesService.getSummary(
      this.resolveSource(source),
    )
  }

  @Get('updates-due')
  getUpdatesDue(@Query() query: ListAnnualUpdatesDueQueryDto) {
    return this.annualUpdatesService.getUpdatesDue(
      query,
      this.resolveSource(query.source),
    )
  }

  @Get()
  findAll(@Query() query: ListAnnualUpdatesQueryDto) {
    return this.annualUpdatesService.findAll(
      query,
      this.resolveSource(query.source),
    )
  }

  @Post('sync')
  @Roles(UserRole.ADMIN)
  syncExternal(@Query('source') source?: string) {
    return this.annualUpdatesService.syncExternal(
      this.resolveSource(source),
    )
  }

  @Post('import/preview')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  preview(
    @UploadedFile() file: UploadedAnnualFile | undefined,
    @Body() dto: AnnualImportOptionsDto,
  ) {
    return this.annualUpdatesService.preview(
      file,
      dto.mapping,
      this.resolveSource(dto.source),
    )
  }

  @Post('import/confirm')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  confirm(
    @UploadedFile() file: UploadedAnnualFile | undefined,
    @Body() dto: AnnualImportOptionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.annualUpdatesService.confirmImport(
      file,
      dto.mapping,
      actor.id,
      this.resolveSource(dto.source),
    )
  }

  private resolveSource(source?: string): AnnualSource {
    return ANNUAL_SOURCES.includes(source as AnnualSource)
      ? (source as AnnualSource)
      : DEFAULT_ANNUAL_SOURCE
  }
}
