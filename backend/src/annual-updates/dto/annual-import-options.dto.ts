import { Transform } from 'class-transformer'
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'
import { ANNUAL_SOURCES } from '../annual-sources.js'

export class AnnualImportOptionsDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsIn([...ANNUAL_SOURCES], {
    message: 'El origen de la actualización anual no es válido',
  })
  source?: string

  @IsOptional()
  @IsString({ message: 'El mapeo no es válido' })
  @MaxLength(10000, { message: 'El mapeo es demasiado grande' })
  mapping?: string
}
