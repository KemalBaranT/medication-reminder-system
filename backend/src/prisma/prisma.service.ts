import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Veritabani erisimine ihtiyac duyan her servise enjekte edilen, uygulama
 * genelindeki Prisma istemcisi. Baglanti yasam donguysunu Nest'in modul
 * yasam dongusune baglar; boylece havuz istek basina degil, aciliste bir
 * kez acilir ve kapaniste temiz sekilde kapanir.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
