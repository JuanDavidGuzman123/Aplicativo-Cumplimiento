import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import {
  EXTERNAL_ANNUAL_STATUSES,
  EXTERNAL_SORT_FIELDS,
  EXTERNAL_UPDATE_FILTERS,
  SORT_DIRECTIONS,
  type ExternalSortField,
  type SortDirection,
} from '../types.js'

export class ListExternalUpdatesQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'El código no es válido' })
  @MaxLength(50, { message: 'El código es demasiado largo' })
  code?: string

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'La búsqueda no es válida' })
  @MaxLength(150, { message: 'La búsqueda es demasiado larga' })
  search?: string

  @IsOptional()
  @IsIn([...EXTERNAL_ANNUAL_STATUSES], {
    message: 'El estado anual no es válido',
  })
  status?: string

  @IsOptional()
  @IsIn([...EXTERNAL_UPDATE_FILTERS], {
    message: 'El filtro de actualización no es válido',
  })
  annualStatus?: string

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') {
      return true
    }
    if (value === 'false') {
      return false
    }
    return value
  })
  @IsBoolean({
    message: 'El filtro de seguimiento semestral no es válido',
  })
  requiresSemiannualFollowUp?: boolean

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsIn([...EXTERNAL_SORT_FIELDS], {
    message: 'El campo de ordenamiento no es válido',
  })
  sort?: ExternalSortField

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
  @Max(100, {
    message: 'El tamaño de página no puede superar 100',
  })
  pageSize = 20
}
