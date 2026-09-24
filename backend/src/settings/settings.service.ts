import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

/** Her dagitim icin tam olarak tek bir ayarlar satiri vardir; sabit bir id, bir sorgu yapmadan upsert'lerin idempotent kalmasini saglar. */
const SETTINGS_ID = 'singleton';

/**
 * Bu dagitim icin beyaz etiket yapilandirmasinin tek satirini kalici
 * hale getirir. Bir ortam degiskeni yerine tablo olarak modellenmistir;
 * boylece bir operator, yeniden dagitim gerektirmeden hastane adini
 * calisma zamaninda admin arayuzu uzerinden yeniden markalandirabilir.
 */
@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  /** Ilk okumada ayarlar satirini upsert'ler; boylece API, bir admin herhangi bir sey yapilandirmadan once asla 404 dondurmez. */
  async get() {
    const settings = await this.prisma.hospitalSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
    return { hospitalName: settings.hospitalName };
  }

  async update(dto: UpdateSettingsDto) {
    const settings = await this.prisma.hospitalSettings.upsert({
      where: { id: SETTINGS_ID },
      update: { hospitalName: dto.hospitalName },
      create: { id: SETTINGS_ID, hospitalName: dto.hospitalName },
    });
    return { hospitalName: settings.hospitalName };
  }
}
