import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  fullName: string;

  /** Unvan/brans (orn. "Kardiyolog", "Bashekim"). Opsiyoneldir, yetkilendirmeyi etkilemez. */
  @IsOptional()
  @IsString()
  title?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(Role)
  role: Role;
}
