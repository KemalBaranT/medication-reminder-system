import { Injectable } from '@nestjs/common';
import { ExpoPushService, type ExpoPushMessage } from './expo-push.service';
import { FcmService } from './fcm.service';

/** Kademeli bildirim zaman çizelgesinin kademeleri (bkz. `schedule.constants.ts`). */
export type DoseAlertTier = 'prepare' | 'due' | 'overdue';

/** Bir doz uyarısının istemciye taşınan, sunumdan bağımsız içeriği. */
export interface DoseAlertPayload {
  scheduleId: string;
  patientName: string;
  patientWristbandCode: string;
  roomNo: string;
  medicationName: string;
  dosage: string;
  scheduledTime: Date;
}

/**
 * Doz uyarılarının cihazlara hangi biçimde ve hangi kanaldan gideceğine
 * karar veren tek nokta.
 *
 * ## Senkronizasyon mimarisi (sunucu ↔ mobil)
 *
 * Hemşireye gösterilen üç kademe (Hazırlık / Uygulama Zamanı / Gecikme)
 * **mobil cihazda yerel bildirim olarak planlanır** (bkz. mobil
 * `DoseNotificationScheduler`). Nedenleri:
 * - Yerel bildirim ağ bağlantısı olmadan da tam saatinde tetiklenir;
 *   serviste Wi-Fi kopması ilacın unutulmasına yol açmamalıdır.
 * - Android'de kaydırılarak kapatılamayan (sticky) kritik uyarı ve özel
 *   bildirim sesi yalnızca yerel bildirimle garanti edilebilir.
 * - Expo Go, Android'de uzak bildirimleri desteklemez; yerel planlama
 *   test ortamında da aynı davranışı sağlar.
 *
 * Sunucunun bu zaman çizelgesindeki rolü ikidir:
 * 1. **Sessiz senkron sinyali** (`dose_sync`): Her kademe anında
 *    hemşire cihazlarına başlıksız, veri içerikli bir mesaj gönderilir.
 *    Mobil istemcinin arka plan bildirim görevi bu sinyalle iş listesini
 *    yeniden çeker ve yerel planı günceller; uygulama kapalıyken eklenen
 *    yeni bir reçete veya yeniden atanan bir doz, periyodik arka plan
 *    görevini (en az 15 dk) beklemeden cihaza yansır. Görünür bildirim
 *    gönderilmez, böylece yerel bildirimle mükerrer uyarı oluşmaz.
 * 2. **Sunucu kaynaklı eskalasyon** (`medication_overdue`): Gecikme
 *    kademesinde başhemşirelere görünür bir kritik uyarı gönderilir. Bu
 *    uyarı kasıtlı olarak hiçbir cihazın yerel durumuna bağlı değildir:
 *    hemşirenin telefonu kapalı, şarjı bitmiş veya uygulaması silinmiş
 *    olsa bile denetim kademesine ulaşmalıdır. Başhemşirenin kendi
 *    cihazındaki yerel uyarıyla çakışabilmesi bilinçli bir klinik
 *    fazlalıktır (redundancy).
 *
 * ## Token türleri
 * Expo istemcisinin token'ları (`ExponentPushToken[...]`) Expo Push
 * Service'e, önceki Flutter istemcisinin ham FCM token'ları Firebase'e
 * gönderilir. Geçiş döneminde iki istemci aynı backend'e bağlanabilir.
 */
@Injectable()
export class DoseAlertDispatcher {
  constructor(
    private expoPush: ExpoPushService,
    private fcm: FcmService,
  ) {}

  /** Hemşire cihazlarına, yerel bildirim planını yenilemeleri için sessiz senkron sinyali gönderir. */
  async sendSyncSignal(tokens: string[], alert: DoseAlertPayload, tier: DoseAlertTier): Promise<void> {
    const data = this.toData(alert, tier, 'dose_sync');
    const { expo, fcm } = this.partition(tokens);
    await Promise.all([
      this.expoPush.send(expo.map((to) => ({ to, data, _contentAvailable: true, priority: 'high', ttl: 15 * 60 }))),
      // Flutter istemcisi görsel bildirimi data mesajından kendisi üretir;
      // bu yüzden eski sözleşmedeki tür adıyla gönderilir.
      tier === 'due' ? this.fcm.sendDataMessage(fcm, this.toData(alert, tier, 'medication_due')) : Promise.resolve(),
    ]);
  }

  /** Başhemşire cihazlarına görünür, kritik "gecikmiş ilaç" uyarısı gönderir. */
  async sendOverdueEscalation(tokens: string[], alert: DoseAlertPayload): Promise<void> {
    const data = this.toData(alert, 'overdue', 'medication_overdue');
    const { expo, fcm } = this.partition(tokens);
    const time = alert.scheduledTime.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: process.env.TZ ?? 'Europe/Istanbul',
    });
    const messages: ExpoPushMessage[] = expo.map((to) => ({
      to,
      title: `GECİKMİŞ İLAÇ · ${alert.medicationName}`,
      body: `${alert.patientName}${alert.roomNo ? ` · Oda ${alert.roomNo}` : ''} · ${time} dozu hâlâ uygulanmadı.`,
      data,
      sound: 'chime.wav',
      channelId: 'dose-overdue',
      priority: 'high',
      interruptionLevel: 'time-sensitive',
      ttl: 60 * 60,
    }));
    await Promise.all([this.expoPush.send(messages), this.fcm.sendDataMessage(fcm, { ...data, type: 'medication_missed' })]);
  }

  /**
   * Bildirime dokunulduğunda açılacak ekranın derin bağlantısı (`url`)
   * burada üretilir; mobil istemci bu yolu Expo Router ile doğrudan açar
   * (`/patient/<bileklik kodu>` → hastanın günlük ilaç planı).
   */
  private toData(alert: DoseAlertPayload, tier: DoseAlertTier, type: string): Record<string, string> {
    return {
      type,
      tier,
      scheduleId: alert.scheduleId,
      patientName: alert.patientName,
      patientWristbandCode: alert.patientWristbandCode,
      roomNo: alert.roomNo,
      medicationName: alert.medicationName,
      dosage: alert.dosage,
      scheduledTime: alert.scheduledTime.toISOString(),
      url: `/patient/${encodeURIComponent(alert.patientWristbandCode)}`,
    };
  }

  private partition(tokens: string[]) {
    const unique = [...new Set(tokens)];
    return {
      expo: unique.filter((t) => ExpoPushService.isExpoToken(t)),
      fcm: unique.filter((t) => !ExpoPushService.isExpoToken(t)),
    };
  }
}
