import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePrescriptionDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  medicationId: string;

  @IsString()
  dosage: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsInt()
  @Min(1)
  frequencyHours: number;

  @IsDateString()
  startAt: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  nurseNote?: string;
}
