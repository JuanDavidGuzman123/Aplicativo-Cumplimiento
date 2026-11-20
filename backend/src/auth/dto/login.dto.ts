import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @MaxLength(180, { message: 'El correo electrónico es demasiado largo' })
  email!: string;

  @IsString({ message: 'La contraseña es obligatoria' })
  @MinLength(1, { message: 'La contraseña es obligatoria' })
  @MaxLength(72, { message: 'La contraseña es demasiado larga' })
  password!: string;
}
