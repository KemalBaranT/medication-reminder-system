import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreatePatientDto {
  @IsString()
  hospitalPatientNo: string;

  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  roomNo?: string;

  @IsOptional()
  @IsString()
  bedNo?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsString()
  wristbandCode: string;
}
