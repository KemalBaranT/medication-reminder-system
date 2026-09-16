import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from '../notifications/notifications.module';
import { DevicesModule } from '../devices/devices.module';
import { ScheduleService } from './schedule.service';
import { ScheduleProcessor } from './schedule.processor';
import { ScheduleController } from './schedule.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'medication-notifications' }),
    NotificationsModule,
    DevicesModule,
  ],
  providers: [ScheduleService, ScheduleProcessor],
  controllers: [ScheduleController],
  exports: [ScheduleService],
})
export class ScheduleAppModule {}
