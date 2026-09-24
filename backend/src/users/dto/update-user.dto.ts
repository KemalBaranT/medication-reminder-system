import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  /** Unvan/brans (orn. "Kardiyolog", "Bashekim"). Opsiyoneldir, yetkilendirmeyi etkilemez. */
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Doldurulursa sifre bcrypt ile yeniden hashlenir; bos birakilirsa mevcut sifre korunur. */
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
