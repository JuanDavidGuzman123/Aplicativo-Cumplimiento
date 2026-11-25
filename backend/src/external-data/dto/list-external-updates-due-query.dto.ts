import { Transform, Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator'
import {
  EXTERNAL_DUE_SORT_FIELDS,
  SORT_DIRECTIONS,
  type ExternalDueSortField,
  type SortDirection,
} from '../types.js'

export class ListExternalUpdatesDueQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsIn([...EXTERNAL_DUE_SORT_FIELDS], {
    message: 'El campo de ordenamiento no es válido',
  })
  sort?: ExternalDueSortField

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn([...SORT_DIRECTIONS], {
    message: 'La dirección de ordenamiento no es válida',
  })
  dir?: SortDirection

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
