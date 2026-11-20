import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateUserStatusDto {
  @IsBoolean({ message: 'El estado debe ser verdadero o falso' })
  @IsNotEmpty({ message: 'El estado es obligatorio' })
  active!: boolean;
}
