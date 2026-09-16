import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AdministrationAction, NonAdministrationReason } from '@prisma/client';

export class CreateLogDto {
  @IsUUID()
  scheduleId: string;

  @IsEnum(AdministrationAction)
  action: AdministrationAction;

  @IsOptional()
  @IsEnum(NonAdministrationReason)
  reason?: NonAdministrationReason;

  @IsBoolean()
  barcodeVerified: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
