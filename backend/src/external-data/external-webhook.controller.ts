import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common'
import { Public } from '../common/decorators/public.decorator.js'
import { ExternalChangeDetectionService } from './external-change-detection.service.js'

@Public()
@Controller('external-data/webhook')
export class ExternalWebhookController {
  constructor(
    private readonly changeDetection: ExternalChangeDetectionService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  validate(@Query('validationToken') validationToken?: string): string {
    return validationToken ?? ''
  }

  @Post()
  @HttpCode(202)
  async notifications(@Body() payload: unknown): Promise<{ ok: true }> {
    await this.changeDetection.handleWebhook(payload)
    return { ok: true }
  }
}
