import { IsString, MinLength } from 'class-validator';

export class UpdateSettingsDto {
  @IsString()
  @MinLength(1)
  hospitalName: string;
}
