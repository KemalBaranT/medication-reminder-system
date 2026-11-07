import { Module } from '@nestjs/common';
import { DoseAlertDispatcher } from './dose-alert.dispatcher';
import { ExpoPushService } from './expo-push.service';
import { FcmService } from './fcm.service';

@Module({
  providers: [FcmService, ExpoPushService, DoseAlertDispatcher],
  exports: [FcmService, DoseAlertDispatcher],
})
export class NotificationsModule {}
