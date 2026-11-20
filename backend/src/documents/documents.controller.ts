import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { createReadStream } from 'node:fs'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { AuthenticatedUser } from '../common/types/authenticated-user.js'
import {
  DocumentsService,
  type UploadedDocumentFile,
} from './documents.service.js'

@Controller()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('follow-ups/:followUpId/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  upload(
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.documentsService.upload(followUpId, file, actor)
  }

  @Get('documents/:id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, filePath } =
      await this.documentsService.getDownload(id)

    const fallbackName = document.originalName
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_')
    const encodedName = encodeURIComponent(document.originalName)

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    )
    response.setHeader('Content-Type', document.mimeType)
    response.setHeader('Content-Length', document.size.toString())

    return new StreamableFile(createReadStream(filePath))
  }
}
