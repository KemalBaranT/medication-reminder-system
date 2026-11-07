import { IsIn, IsString } from 'class-validator';

/**
 * Bir cihazın push kanalı kaydı. Alan adı geriye dönük uyumluluk için
 * `fcmToken` olarak korunur; Expo istemcisi buraya Expo push token'ını
 * (`ExponentPushToken[...]`), önceki Flutter istemcisi ham FCM token'ını
 * gönderir. Hangi teslimat servisinin kullanılacağına token biçimine
 * bakılarak `DoseAlertDispatcher` karar verir.
 */
export class RegisterDeviceDto {
  @IsString()
  fcmToken: string;

  @IsIn(['android', 'ios'])
  platform: 'android' | 'ios';
}
