import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

/**
 * Ilac zamani ve eskalasyon uyarilarini hemsire cihazlarina iletmek icin
 * Firebase Admin SDK'sinin ince bir sarmalayicisi. Firebase kimlik
 * bilgileri yoksa hata firlatmak yerine yalnizca loglayan bir moda geriler;
 * boylece bir hastane, push bildirimleri yapilandirilmadan once sistemin
 * geri kalanini calistirip tanitabilir.
 */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private initialized = false;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'FIREBASE_* ortam degiskenleri eksik - push bildirimleri devre disi (sadece log).',
      );
      return;
    }

    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    this.initialized = true;
  }

  /**
   * Kilit ekraninda gorunmesi icin data-only mesaj gonderir; gorsel bildirimi
   * istemci taraf flutter_local_notifications olusturur (yuksek oncelik/ses/kanal kontrolu icin).
   */
  async sendDataMessage(tokens: string[], data: Record<string, string>) {
    if (!this.initialized) {
      this.logger.warn(`FCM devre disi, gonderilecek mesaj atlandi: ${JSON.stringify(data)}`);
      return;
    }
    if (tokens.length === 0) return;

    await admin.messaging().sendEachForMulticast({
      tokens,
      data,
      android: { priority: 'high' },
      apns: { headers: { 'apns-priority': '10' } },
    });
  }
}
