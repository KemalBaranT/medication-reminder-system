import { IsDateString } from 'class-validator';

export class RescheduleDoseDto {
  @IsDateString()
  scheduledTime: string;
}
