import { Transform, Type } from 'class-transformer'
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { CounterpartyStatus } from '@prisma/client'
import {
  CALENDAR_STATUSES,
  type CalendarStatus,
} from '../../common/utils/calendar-status.js'

export const COUNTERPARTY_SORT_FIELDS = [
  'businessName',
  'nit',
  'status',
  'registrationDate',
  'lastFollowUpDate',
  'nextFollowUpDate',
] as const

export type CounterpartySortField =
  (typeof COUNTERPARTY_SORT_FIELDS)[number]

export const COUNTERPARTY_SORT_DIRECTIONS = ['asc', 'desc'] as const

export type CounterpartySortDirection =
  (typeof COUNTERPARTY_SORT_DIRECTIONS)[number]

export class ListCounterpartiesQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'La búsqueda no es válida' })
  @MaxLength(150, { message: 'La búsqueda es demasiado larga' })
  search?: string

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'La categoría no es válida' })
  @MaxLength(64, { message: 'La categoría no es válida' })
  category?: string

  @IsOptional()
  @IsUUID('all', { message: 'El subproceso no es válido' })
  subprocessId?: string

  @IsOptional()
  @IsEnum(CounterpartyStatus, {
    message: 'El estado de la contraparte no es válido',
  })
  status?: CounterpartyStatus

  @IsOptional()
  @IsIn([...CALENDAR_STATUSES], {
    message: 'El estado del calendario no es válido',
  })
  calendarStatus?: CalendarStatus

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsIn([...COUNTERPARTY_SORT_FIELDS], {
    message: 'El campo de ordenamiento no es válido',
  })
  sort?: CounterpartySortField

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn([...COUNTERPARTY_SORT_DIRECTIONS], {
    message: 'La dirección de ordenamiento no es válida',
  })
  dir?: CounterpartySortDirection

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1' })
  page = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamaño de página debe ser un número entero' })
  @Min(1, { message: 'El tamaño de página debe ser mayor o igual a 1' })
  @Max(100, { message: 'El tamaño de página no puede superar 100' })
  pageSize = 10
}
