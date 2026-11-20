import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { AnnualStatus } from '@prisma/client'

export const ANNUAL_UPDATE_FILTERS = [
  'UPDATED_THIS_YEAR',
  'PENDING',
  'NO_DATE',
] as const

export type AnnualUpdateFilter =
  (typeof ANNUAL_UPDATE_FILTERS)[number]

export class ListAnnualUpdatesQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'La búsqueda no es válida' })
  @MaxLength(150, { message: 'La búsqueda es demasiado larga' })
  search?: string

  @IsOptional()
  @IsEnum(AnnualStatus, {
    message: 'El estado anual no es válido',
  })
  status?: AnnualStatus

  @IsOptional()
  @IsIn([...ANNUAL_UPDATE_FILTERS], {
    message: 'El filtro de actualización no es válido',
  })
  annualStatus?: AnnualUpdateFilter

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
