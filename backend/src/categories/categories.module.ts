import { Global, Module } from '@nestjs/common'
import { ExternalDataModule } from '../external-data/external-data.module.js'
import { CategoriesController } from './categories.controller.js'
import { CategoriesService } from './categories.service.js'

@Global()
@Module({
  imports: [ExternalDataModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
