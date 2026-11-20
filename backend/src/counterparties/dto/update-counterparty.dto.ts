import { Transform } from 'class-transformer'
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'
import { NIT_PATTERN } from '../../common/utils/nit.js'

export class UpdateCounterpartyDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'El NIT no es válido' })
  @MaxLength(30, { message: 'El NIT es demasiado largo' })
  @Matches(NIT_PATTERN, {
    message:
      'El NIT debe contener entre 6 y 15 dígitos y solo puede incluir números, puntos, guiones y espacios',
  })
  nit?: string

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'La razón social no es válida' })
  @MinLength(2, { message: 'La razón social debe tener al menos 2 caracteres' })
  @MaxLength(200, { message: 'La razón social es demasiado larga' })
  businessName?: string

  @IsOptional()
  @IsUUID('all', { message: 'El subproceso no es válido' })
  subprocessId?: string

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value
    }

    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones no son válidas' })
  @MaxLength(2000, { message: 'Las observaciones son demasiado largas' })
  observations?: string | null
}
