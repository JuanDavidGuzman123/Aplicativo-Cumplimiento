import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsString,
  IsOptional,
  Max,
  Min,
} from 'class-validator'

export class ImportOptionsDto {
  @IsOptional()
  @IsObject({ message: 'El mapeo de columnas no es válido' })
  mapping?: Record<string, unknown>

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'La opción de subprocesos no es válida' })
  createMissingSubprocesses?: boolean

  @IsOptional()
  @IsString({ message: 'La categoría no es válida' })
  categoryKey?: string

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'La autorización de fechas no es válida' })
  authorizeDateChanges?: boolean
}

export class ListImportsQueryDto {
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
  pageSize = 20
}
