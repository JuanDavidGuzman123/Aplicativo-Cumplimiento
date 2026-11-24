import { Transform, Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator'
import { ANNUAL_SOURCES } from '../annual-sources.js'

export class ListAnnualUpdatesDueQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsIn([...ANNUAL_SOURCES], {
    message: 'El origen de la actualización anual no es válido',
  })
  source?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1' })
  page = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'El tamaño de página debe ser un número entero',
  })
  @Min(1, {
    message: 'El tamaño de página debe ser mayor o igual a 1',
  })
  @Max(50, {
    message: 'El tamaño de página no puede superar 50',
  })
  pageSize = 10
}
