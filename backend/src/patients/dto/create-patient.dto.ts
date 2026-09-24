import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreatePatientDto {
  @IsString()
  hospitalPatientNo: string;

  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsString()
  roomNo?: string;

  @IsOptional()
  @IsString()
  bedNo?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  /** Sunucunun benzersiz bir kod uretmesi icin bos birakilabilir; bkz. PatientsService.generateWristbandCode. */
  @IsOptional()
  @IsString()
  wristbandCode?: string;
}
