import { Transform } from 'class-transformer'
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'

export class CreateSubprocessDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El nombre es obligatorio' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(150, { message: 'El nombre es demasiado largo' })
  name!: string

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value
    }

    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })
  @MaxLength(500, { message: 'La descripción es demasiado larga' })
  @IsOptional()
  @IsString({ message: 'La descripción no es válida' })
  description?: string | null
}
