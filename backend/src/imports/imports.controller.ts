import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express'
import { UserRole } from '@prisma/client'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import type { AuthenticatedUser } from '../common/types/authenticated-user.js'
import {
  ImportOptionsDto,
  ListImportsQueryDto,
} from './dto/import-options.dto.js'
import {
  ImportsService,
  type UploadedImportFile,
} from './imports.service.js'

@Controller('imports')
@Roles(UserRole.ADMIN)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Get()
  findAll(@Query() query: ListImportsQueryDto) {
    return this.importsService.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.importsService.findOne(id)
  }

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'files', maxCount: 10 },
        { name: 'file', maxCount: 1 },
      ],
      { limits: { fileSize: 10 * 1024 * 1024 } },
    ),
  )
  upload(
    @UploadedFiles()
    uploaded:
      | {
          files?: UploadedImportFile[]
          file?: UploadedImportFile[]
        }
      | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const files = [
      ...(uploaded?.files ?? []),
      ...(uploaded?.file ?? []),
    ]

    return this.importsService.upload(files, actor.id)
  }

  @Post(':id/preview')
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportOptionsDto,
  ) {
    return this.importsService.preview(id, dto)
  }

  @Post(':id/confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportOptionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.importsService.confirm(id, dto, actor.id)
  }
}
