import { Transform } from 'class-transformer'
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

export class FinalizeFollowUpDto {
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
    { message: 'La fecha de realización no es válida' },
  )
  performedAt?: string

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value
    }

    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })
  @IsOptional()
  @IsString({ message: 'El resultado no es válido' })
  @MaxLength(5000, { message: 'El resultado es demasiado largo' })
  result?: string | null

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value
    }

    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones no son válidas' })
  @MaxLength(5000, { message: 'Las observaciones son demasiado largas' })
  observations?: string | null
}
