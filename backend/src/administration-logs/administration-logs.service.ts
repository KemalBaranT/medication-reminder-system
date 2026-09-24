import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ScheduleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLogDto } from './dto/create-log.dto';

/**
 * Bir dozun klinik sonucu henuz kaydedilmemis sayildigi durumlar.
 * `missed` kasitli olarak dahildir: eskalasyon zamanlayicisi dozu
 * "kacirildi" olarak isaretledikten sonra gec de olsa uygulanan bir doz,
 * gercekte ne oldugunu yansitmasi icin kaydedilebilmelidir. `administered`
 * ve `skipped` ise nihai sonuclardir ve degistirilemez.
 */
const RECORDABLE_STATUSES: ScheduleStatus[] = ['pending', 'notified', 'missed'];

/**
 * Istemcinin bildirdigi uygulama zamaninin kabul edilecegi en eski sinir.
 * Cevrimdisi kuyruk bir vardiya boyunca birikebilir; daha eski bir zaman
 * ise bozuk bir cihaz saatine veya kurcalanmis bir istege isaret eder.
 */
const MAX_BACKDATE_MS = 24 * 60 * 60 * 1000;

/** Cihaz ile sunucu saati arasindaki kucuk farklara taninan tolerans. */
const CLOCK_SKEW_TOLERANCE_MS = 2 * 60 * 1000;

/**
 * Planlanmis bir ilac dozunun klinik sonucunu (uygulandi veya uygulanmadi),
 * dozu isleyen hemsirenin bildirdigi sekilde kaydeder. Bu, uyumluluk
 * raporlamasi icin tek dogruluk kaynagidir ve bir dozu kapatarak artik
 * hicbir hemsirenin cihazinda bekleyen olarak gorunmemesini saglar.
 */
@Injectable()
export class AdministrationLogsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Hemsirenin uygulama kararini kalici hale getirir: dozun durumunu
   * gunceller ve kimin, ne zaman, barkod dogrulamasiyla mi karar verdigini
   * iceren denetim kaydini (AdministrationLog) olusturur.
   *
   * **Atomiklik:** Iki yazma tek bir transaction icinde yapilir; bir
   * adimin basarisiz olmasi, "durumu Verildi ama kaydi olmayan" (veya tersi)
   * bir doz birakamaz.
   *
   * **Eszamanlilik:** Durum gecisi, okunan degere guvenmek yerine
   * kosullu bir `updateMany` ile yapilir ("yalnizca hala kaydedilebilir
   * durumdaysa guncelle"). Ayni dozu iki hemsire ayni anda kaydetmeye
   * calisirsa (veya cevrimdisi kuyruk ayni istegi ikinci kez gonderirse)
   * yalnizca biri kazanir; digeri 409 Conflict alir. Mobil istemci 409'u
   * "bu doz zaten kapatilmis" olarak ele alir ve istegi kuyruktan duser.
   *
   * Yanit, istemcinin listeyi yeniden cekmeden karti aninda "Verildi" olarak
   * gosterebilmesi icin dozun yeni durumunu ve denetim bilgisini icerir.
   */
  async create(nurseId: string, dto: CreateLogDto) {
    const nextStatus: ScheduleStatus = dto.action === 'administered' ? 'administered' : 'skipped';
    const performedAt = this.resolvePerformedAt(dto.performedAt);

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.administrationSchedule.updateMany({
        where: { id: dto.scheduleId, status: { in: RECORDABLE_STATUSES } },
        data: { status: nextStatus },
      });

      if (claimed.count === 0) {
        const exists = await tx.administrationSchedule.count({ where: { id: dto.scheduleId } });
        if (!exists) throw new NotFoundException('Uygulama zamanı bulunamadı');
        throw new ConflictException('Bu doz için zaten bir kayıt girilmiş');
      }

      const log = await tx.administrationLog.create({
        data: {
          scheduleId: dto.scheduleId,
          nurseId,
          action: dto.action,
          reason: dto.reason,
          barcodeVerified: dto.barcodeVerified,
          notes: dto.notes,
          performedAt,
        },
        include: { nurse: { select: { fullName: true } } },
      });

      return {
        id: log.id,
        scheduleId: log.scheduleId,
        scheduleStatus: nextStatus,
        action: log.action,
        reason: log.reason,
        barcodeVerified: log.barcodeVerified,
        notes: log.notes,
        performedAt: log.performedAt,
        performedById: log.nurseId,
        performedByName: log.nurse.fullName,
      };
    });
  }

  /**
   * Denetim kaydina yazilacak uygulama zamanini belirler. Cevrimici
   * kayitlarda sunucu saati kullanilir (tek, guvenilir saat kaynagi).
   * Cevrimdisi kuyruktan gelen kayitlarda cihazin bildirdigi zaman, son 24
   * saat icinde ve gelecekte degilse kabul edilir; aksi halde istek
   * reddedilir, cunku yanlis zamanli bir ilac kaydi hic kayit olmamasindan
   * daha tehlikelidir (ornegin bir sonraki dozun zamanlamasi buna gore
   * degerlendirilir).
   */
  private resolvePerformedAt(reported?: string): Date {
    const now = Date.now();
    if (!reported) return new Date(now);
    const at = new Date(reported).getTime();
    if (at > now + CLOCK_SKEW_TOLERANCE_MS || at < now - MAX_BACKDATE_MS) {
      throw new BadRequestException('Uygulama zamanı geçerli aralığın dışında');
    }
    return new Date(Math.min(at, now));
  }
}
