import { IsOptional, IsString } from 'class-validator';

export class CreateMedicationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  form?: string;

  @IsOptional()
  @IsString()
  unit?: string;
}
