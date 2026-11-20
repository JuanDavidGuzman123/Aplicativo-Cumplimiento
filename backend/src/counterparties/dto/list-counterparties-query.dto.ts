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

export class ListCounterpartiesQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'La búsqueda no es válida' })
  @MaxLength(150, { message: 'La búsqueda es demasiado larga' })
  search?: string

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
