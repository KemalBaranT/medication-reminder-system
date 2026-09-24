import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleService } from './schedule.service';
import { RescheduleDoseDto } from './dto/reschedule-dose.dto';

/**
 * Yatak başı iş listesi okuma modeli ve tek bir doz saatini sonradan
 * düzeltme yeteneği. Olay üretiminin kendisi ScheduleService'te yaşar ve
 * burada doğrudan dışarıya açılmaz, çünkü her zaman dolaylı olarak reçete
 * oluşturma üzerinden tetiklenir.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('schedule')
export class ScheduleController {
  constructor(
    private prisma: PrismaService,
    private scheduleService: ScheduleService,
  ) {}

  /**
   * Bugünün iş listesini döndürür: açık dozlar (bekliyor/bildirildi),
   * bugün planlanıp kaçırılmış (missed) dozlar ve bugün "Verildi" olarak
   * kaydedilmiş dozlar. Bir hemşire kendi yatak başı kapsamını alır:
   * özellikle kendisine atanan dozlar, artı atanmamış (yayın) ve
   * vardiyadaki herhangi bir hemşirenin alabileceği dozlar. Doktorlar,
   * başhemşireler ve Super Admin ise servis genelinde denetim ihtiyacı
   * duyar - gecikmeleri ve hemşire başına iş yükünü denetlemek her açık
   * dozu görmeyi gerektirir - bu yüzden kapsamları kasıtlı olarak
   * assignedNurseId'ye göre filtrelenmemiştir.
   *
   * **Kaçırılmış dozlar neden listede:** Eskalasyon zamanlayıcısı, bildirim
   * sonrası belirli bir süre içinde işlem görmeyen dozu `missed` yapar ve
   * başhemşireyi uyarır. Bu, dozun artık verilemeyeceği anlamına gelmez;
   * backend kaçırılmış bir dozun geç de olsa kaydedilmesine izin verir.
   * Doz listeden düşseydi, en acil olan "gecikmiş" ilaç tam da hemşirenin
   * onu görmesi gereken anda ekrandan kaybolurdu. Bu nedenle bugün
   * planlanmış kaçırılmış dozlar listede, mobil istemcide en üstte
   * gösterilir; önceki günlerin kaçırılmış dozları raporlama konusudur ve
   * iş listesini şişirmemek için dahil edilmez.
   *
   * Bugün verilmiş dozların listede kalması, mobildeki yeşil "Verildi"
   * etiketinin ve "Verildi" durum filtresinin yenilemeden sonra da tutarlı
   * kalmasını sağlar. Uygulanmadı (skipped) dozlar iş listesinde
   * gösterilmez. Kaydı yapan personelin adı ve saati, kartta denetim
   * bilgisi olarak gösterilmek üzere yanıta eklenir.
   *
   * `prescriptionId`, mobil istemcinin iş listesini reçete başına tek kart
   * olacak şekilde gruplayabilmesi için döndürülür: aynı ilacın gün
   * içindeki tüm dozları ayrı kartlar olarak alt alta dizilmez, yalnızca en
   * acil dozu gösterilir.
   */
  @Get('mine')
  @Roles('nurse', 'doctor', 'head_nurse', 'admin')
  async mine(@CurrentUser() user: AuthUser) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const schedules = await this.prisma.administrationSchedule.findMany({
      where: {
        AND: [
          {
            OR: [
              { status: { in: ['pending', 'notified'] } },
              { status: 'missed', scheduledTime: { gte: startOfToday } },
              { status: 'administered', log: { performedAt: { gte: startOfToday } } },
            ],
          },
          user.role === 'nurse' ? { OR: [{ assignedNurseId: user.id }, { assignedNurseId: null }] } : {},
        ],
      },
      include: {
        log: { include: { nurse: { select: { fullName: true } } } },
        prescription: {
          include: {
            patient: true,
            medication: true,
            prescribedBy: { select: { fullName: true, title: true } },
          },
        },
      },
      orderBy: { scheduledTime: 'asc' },
    });

    return schedules.map((s) => ({
      id: s.id,
      prescriptionId: s.prescriptionId,
      status: s.status,
      scheduledTime: s.scheduledTime,
      patientName: s.prescription.patient.fullName,
      floor: s.prescription.patient.floor,
      roomNo: s.prescription.patient.roomNo,
      bedNo: s.prescription.patient.bedNo,
      patientWristbandCode: s.prescription.patient.wristbandCode,
      medicationName: s.prescription.medication.name,
      medicationBarcode: s.prescription.medication.barcode,
      dosage: s.prescription.dosage,
      nurseNote: s.prescription.nurseNote,
      prescribedByName: s.prescription.prescribedBy.fullName,
      prescribedByTitle: s.prescription.prescribedBy.title,
      administeredAt: s.log?.performedAt ?? null,
      administeredByName: s.log?.nurse.fullName ?? null,
    }));
  }

  /**
   * Bir doktorun veya başhemşirenin, tüm reçeteyi iptal edip yeniden
   * oluşturmadan tek bir dozun saatini düzeltmesine (örneğin bir ameliyat
   * planı geciktirdiğinde) izin verir. "Bir doz ne zaman gerekiyor" ile
   * "verildi mi" konularını ayrı tutmak için, uygulayan hemşirenin
   * kendisi değil, servis üzerinde klinik veya denetim yetkisi olan
   * rollerle sınırlandırılmıştır.
   */
  @Patch(':id')
  @Roles('doctor', 'head_nurse', 'admin')
  rescheduleDose(@Param('id') id: string, @Body() dto: RescheduleDoseDto) {
    return this.scheduleService.rescheduleDose(id, new Date(dto.scheduledTime));
  }
}
