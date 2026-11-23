import { Transform } from 'class-transformer'
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'
import { NIT_PATTERN } from '../../common/utils/nit.js'

export class CreateCounterpartyDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El NIT es obligatorio' })
  @MaxLength(30, { message: 'El NIT es demasiado largo' })
  @Matches(NIT_PATTERN, {
    message:
      'El NIT debe contener entre 6 y 15 dígitos y solo puede incluir números, puntos, guiones y espacios',
  })
  nit!: string

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'La razón social es obligatoria' })
  @MinLength(2, { message: 'La razón social debe tener al menos 2 caracteres' })
  @MaxLength(200, { message: 'La razón social es demasiado larga' })
  businessName!: string

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'La categoría no es válida' })
  @MaxLength(64, { message: 'La categoría no es válida' })
  categoryKey?: string

  @IsUUID('all', { message: 'El subproceso no es válido' })
  subprocessId!: string

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

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value
    }

    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'La fecha de registro no es válida' },
  )
  registrationDate?: string

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value
    }

    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'La fecha de próximo seguimiento no es válida' },
  )
  nextFollowUpDate?: string
}
