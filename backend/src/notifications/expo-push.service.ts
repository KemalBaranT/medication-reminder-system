import { Injectable, Logger } from '@nestjs/common';

/** Expo Push Service'in tek bir mesajı (bkz. https://docs.expo.dev/push-notifications/sending-notifications/). */
export interface ExpoPushMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, string>;
  /** iOS'ta çalınacak ses; Android'de ses, `channelId` ile seçilen kanaldan gelir. */
  sound?: string | null;
  /** Android bildirim kanalı; mobil istemcinin `ensureNotificationChannels` ile oluşturduğu kimliklerden biri. */
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  interruptionLevel?: 'passive' | 'active' | 'time-sensitive' | 'critical';
  /** Başlık ve gövde olmadan gönderilen, uygulamayı arka planda uyandıran sessiz mesaj. */
  _contentAvailable?: boolean;
  /** Mesajın teslim edilemezse ne kadar süre saklanacağı (saniye). */
  ttl?: number;
}

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo Push API tek istekte en fazla 100 mesaj kabul eder. */
const MAX_BATCH_SIZE = 100;

/**
 * Expo ile oluşturulmuş mobil istemcinin (`mobile-expo`) push token'larına
 * (`ExponentPushToken[...]`) Expo Push Service üzerinden bildirim gönderir.
 *
 * **Neden ayrı bir servis:** Expo push token'ları FCM/APNs token'ı değildir;
 * Firebase Admin SDK bunlara doğrudan gönderim yapamaz. Expo Push Service,
 * tek bir HTTPS uç noktası üzerinden hem Android (FCM) hem iOS (APNs)
 * teslimatını üstlenir. Önceki Flutter istemcisinin ham FCM token'ları için
 * `FcmService` kullanılmaya devam eder; ayrım token biçimine göre
 * `DoseAlertDispatcher` içinde yapılır.
 *
 * Harici bir SDK gerektirmez (Node.js 20+ yerleşik `fetch`). Gönderim hatası
 * bildirimi çağıran iş akışını (dozun durum geçişi) asla bozmaz; yalnızca
 * loglanır, çünkü bildirim bir yan etkidir ve dozun klinik kaydı ondan
 * bağımsız olarak tutarlı kalmalıdır.
 */
@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  static isExpoToken(token: string): boolean {
    return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
  }

  async send(messages: ExpoPushMessage[]): Promise<void> {
    for (let i = 0; i < messages.length; i += MAX_BATCH_SIZE) {
      const batch = messages.slice(i, i + MAX_BATCH_SIZE);
      try {
        const res = await fetch(EXPO_PUSH_ENDPOINT, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify(batch),
        });
        if (!res.ok) {
          this.logger.warn(`Expo Push isteği başarısız: HTTP ${res.status} ${await res.text()}`);
          continue;
        }
        const body = (await res.json()) as { data?: { status: string; message?: string }[] };
        body.data?.forEach((ticket, idx) => {
          if (ticket.status !== 'ok') {
            this.logger.warn(`Expo Push teslim edilemedi (${batch[idx]?.to}): ${ticket.message ?? 'bilinmeyen hata'}`);
          }
        });
      } catch (error) {
        this.logger.warn(`Expo Push servisine ulaşılamadı: ${(error as Error).message}`);
      }
    }
  }
}
