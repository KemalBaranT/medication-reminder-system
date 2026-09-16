import { Module } from '@nestjs/common';
import { ScheduleAppModule } from '../schedule/schedule.module';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsController } from './prescriptions.controller';

@Module({
  imports: [ScheduleAppModule],
  providers: [PrescriptionsService],
  controllers: [PrescriptionsController],
})
export class PrescriptionsModule {}
