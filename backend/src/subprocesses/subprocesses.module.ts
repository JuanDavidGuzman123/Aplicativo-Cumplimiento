import { Module } from '@nestjs/common'
import { SubprocessesService } from './subprocesses.service.js'

@Module({
  providers: [SubprocessesService],
  exports: [SubprocessesService],
})
export class SubprocessesModule {}
