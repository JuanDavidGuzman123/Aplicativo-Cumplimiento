import { IsOptional, IsString, MaxLength } from 'class-validator'

export class AnnualImportOptionsDto {
  @IsOptional()
  @IsString({ message: 'El mapeo no es válido' })
  @MaxLength(10000, { message: 'El mapeo es demasiado grande' })
  mapping?: string
}
