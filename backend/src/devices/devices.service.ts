import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bir personel ile push bildirimlerini almasi gereken mobil cihazlar
 * arasindaki eslesmeyi yonetir. Bir kullanici birden fazla cihazda oturum
 * acmis olabilir, bu yuzden token'lar kullanici basina degil, (kullanici,
 * token) cifti basina anahtarlanir.
 */
@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Bir cihaz icin FCM push token'ini kaydeder veya yeniler. (userId,
   * fcmToken) uzerinde upsert yapmak, ayni cihazdan gelen tekrar kaydin
   * idempotent kalmasini saglar; bu onemlidir cunku mobil uygulama her
   * acilista ve Firebase token'i her degistirdiginde kendi token'ini
   * yeniden gonderir.
   */
  register(userId: string, fcmToken: string, platform: string) {
    return this.prisma.device.upsert({
      where: { userId_fcmToken: { userId, fcmToken } },
      update: { platform },
      create: { userId, fcmToken, platform },
    });
  }

  /** Bir kullanicinin tum push token'larini bulur; boylece bir bildirim, oturum actigi her cihaza dagitilabilir. */
  async tokensForUser(userId: string): Promise<string[]> {
    const devices = await this.prisma.device.findMany({ where: { userId } });
    return devices.map((d) => d.fcmToken);
  }
}
