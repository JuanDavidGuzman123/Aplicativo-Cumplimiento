import { Transform } from 'class-transformer'
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CounterpartyActionDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'La justificación es obligatoria' })
  @MinLength(5, {
    message: 'La justificación debe tener al menos 5 caracteres',
  })
  @MaxLength(1000, {
    message: 'La justificación es demasiado larga',
  })
  reason!: string
}

export class ReactivateCounterpartyDto extends CounterpartyActionDto {
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
