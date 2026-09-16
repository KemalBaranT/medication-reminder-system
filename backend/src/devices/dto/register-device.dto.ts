import { IsIn, IsString } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  fcmToken: string;

  @IsIn(['android', 'ios'])
  platform: 'android' | 'ios';
}
