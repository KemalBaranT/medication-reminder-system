import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

  register(userId: string, fcmToken: string, platform: string) {
    return this.prisma.device.upsert({
      where: { userId_fcmToken: { userId, fcmToken } },
      update: { platform },
      create: { userId, fcmToken, platform },
    });
  }

  async tokensForUser(userId: string): Promise<string[]> {
    const devices = await this.prisma.device.findMany({ where: { userId } });
    return devices.map((d) => d.fcmToken);
  }
}
