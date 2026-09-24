import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Web panelinin ana sayfasinda gosterilen kucuk, gercek-zamanli sayac
 * kumesini hesaplar. ReportsService'in tarih araligiyla filtrelenebilen
 * tarihsel toplamlarinin aksine, buradaki her sayi mevcut ana (`now`) gore
 * degerlendirilir; boylece "gecikmis" ifadesi her zaman su an gecikmis
 * olan dozlari yansitir, bir raporun calistirildigi keyfi bir araligin
 * anlik goruntusunu degil.
 */
@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /**
   * Servis geneli anlik goruntu: su an kac hasta yatiyor, tam olarak bu
   * anda kac doz gecikmis ve bugunun doz plani ne durumda. `overdueDoses`,
   * hemsirenin mobil is listesinin kullandigi ayni "bildirildi/bekliyor ve
   * planlanan saati gecmis" kuralini yansitir (Flutter tarafinda
   * MedicationSchedule.isLate'e bakin); boylece iki yuzey de neyin gecikmis
   * sayildigi konusunda asla celiskiye dusmez.
   */
  async summary() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    const [activePatients, overdueDoses, todayDosesTotal, administeredToday] = await Promise.all([
      this.prisma.patient.count({ where: { status: 'admitted' } }),
      this.prisma.administrationSchedule.count({
        where: { status: { in: ['pending', 'notified'] }, scheduledTime: { lt: now } },
      }),
      this.prisma.administrationSchedule.count({
        where: { scheduledTime: { gte: startOfToday, lt: startOfTomorrow } },
      }),
      this.prisma.administrationLog.count({
        where: { action: 'administered', performedAt: { gte: startOfToday, lt: startOfTomorrow } },
      }),
    ]);

    return { activePatients, overdueDoses, todayDosesTotal, administeredToday };
  }
}
