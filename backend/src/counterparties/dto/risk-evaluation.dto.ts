import { Transform } from 'class-transformer'
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'
import { RiskDecision } from '@prisma/client'

export class EvaluateRiskDto {
  @IsEnum(RiskDecision, { message: 'La decisión de riesgo no es válida' })
  @IsIn([RiskDecision.CONTINUE, RiskDecision.ARCHIVE], {
    message: 'La decisión de riesgo no es válida',
  })
  decision!: RiskDecision

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
    { message: 'La fecha de evaluación no es válida' },
  )
  evaluatedAt?: string

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value
    }

    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones no son válidas' })
  @MaxLength(1000, { message: 'Las observaciones son demasiado largas' })
  notes?: string
}
