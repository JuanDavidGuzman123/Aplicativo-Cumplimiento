import { Module } from '@nestjs/common'
import { SubprocessesController } from './subprocesses.controller.js'
import { SubprocessesService } from './subprocesses.service.js'

@Module({
  controllers: [SubprocessesController],
  providers: [SubprocessesService],
  exports: [SubprocessesService],
})
export class SubprocessesModule {}
