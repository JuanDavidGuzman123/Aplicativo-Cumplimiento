import { Transform } from 'class-transformer'
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'

export class UpdateSubprocessDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'El nombre no es válido' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(150, { message: 'El nombre es demasiado largo' })
  name?: string

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value
    }

    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })
  @IsOptional()
  @IsString({ message: 'La descripción no es válida' })
  @MaxLength(500, { message: 'La descripción es demasiado larga' })
  description?: string | null

  @IsOptional()
  @IsBoolean({ message: 'El estado debe ser verdadero o falso' })
  active?: boolean
}
