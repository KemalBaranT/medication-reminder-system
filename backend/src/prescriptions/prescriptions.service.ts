import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleService } from '../schedule/schedule.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';

/**
 * Bir doktorun bir hasta için yazdığı klinik emri (doz, uygulama yolu,
 * sıklık) yönetir. Doz zamanı üretimini ScheduleService'e devreder;
 * böylece bir reçeteyi oluşturmak her zaman bir plan tetiklese de, reçete
 * yazma ve planlama ayrı ayrı test edilebilir kalır.
 */
@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private scheduleService: ScheduleService,
  ) {}

  /** Bir reçete oluşturmak, yaklaşan doz olaylarını hemen üretir; böylece hemşireler bunu iş listelerinde anında görür. */
  async create(prescribedById: string, dto: CreatePrescriptionDto) {
    const prescription = await this.prisma.prescription.create({
      data: {
        patientId: dto.patientId,
        medicationId: dto.medicationId,
        prescribedById,
        dosage: dto.dosage,
        route: dto.route,
        frequencyHours: dto.frequencyHours,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        notes: dto.notes,
        nurseNote: dto.nurseNote,
      },
    });

    await this.scheduleService.generateForPrescription(prescription.id);

    return prescription;
  }

  /**
   * Hasta dosyasındaki "Reçete / İlaçlar" bölümünü besler. Her doza, varsa
   * uygulama kaydının gerçek zamanı ve personeli eklenir: esnek uygulama
   * akışında doz planlanan saatten farklı bir anda verilebildiği için,
   * istemcinin "Planlanan 14:00 - Verildi 14:18" ayrımını gösterebilmesi
   * scheduledTime'dan bağımsız olarak performedAt'i bilmesini gerektirir.
   * Dozlar kronolojik sıralanır ki istemci sıradaki dozu doğrudan seçebilsin.
   */
  findForPatient(patientId: string) {
    return this.prisma.prescription.findMany({
      where: { patientId },
      include: {
        medication: true,
        schedules: {
          orderBy: { scheduledTime: 'asc' },
          include: {
            log: {
              select: {
                action: true,
                performedAt: true,
                nurse: { select: { fullName: true } },
              },
            },
          },
        },
        prescribedBy: { select: { id: true, fullName: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Doz zamanlamasını etkilemeyen alanlarla (doz, uygulama yolu, notlar)
   * sınırlıdır. Sıklık veya başlangıç saatini değiştirmek burada kasıtlı
   * olarak desteklenmez: bu, zaten üretilmiş plan olaylarını ve kuyruğa
   * alınmış bildirim işlerini uzlaştırmayı gerektirir; bu ihtiyacı olan
   * bir doktor bunun yerine reçeteyi iptal edip yenisini oluşturur.
   * Doz/uygulama yolu, başka zaman-damgalı bir izi olmayan (Prescription
   * satırında `updatedAt` yoktur) güvenlik açısından kritik klinik
   * alanlardır; bu yüzden her düzenleme, kim tarafından ne zaman
   * değiştirildiğine dair kayıt bırakmadan önceki değeri sessizce
   * ezmek yerine - aşağıdaki `cancel`in zaten kullandığı aynı kuralla -
   * AuditLog'a yazılır.
   */
  async update(id: string, dto: UpdatePrescriptionDto, actorId?: string) {
    const exists = await this.prisma.prescription.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Reçete bulunamadı');
    const prescription = await this.prisma.prescription.update({ where: { id }, data: dto });
    await this.prisma.auditLog.create({
      data: { entity: 'prescription', entityId: id, action: 'updated', userId: actorId },
    });
    return prescription;
  }

  /**
   * Bir reçetenin gelecekteki dozlarını durdurur. Bekliyor/bildirildi
   * durumundaki plan satırları silinmek yerine atlandı olarak işaretlenir;
   * bu denetim izini korur. Onlar için zaten kuyruğa alınmış herhangi bir
   * BullMQ bildirim işi, tetiklendiğinde işlemsiz kalır, çünkü işlemci
   * göndermeden önce durumu kontrol eder. İptalin kendisi AuditLog'a
   * yazılır, çünkü oluşturmanın aksine, Klinik Seyir zaman çizelgesinin
   * okuyabileceği doğal olarak zaman-damgalı başka bir kaydı yoktur.
   */
  async cancel(id: string, actorId?: string) {
    await this.prisma.administrationSchedule.updateMany({
      where: { prescriptionId: id, status: { in: ['pending', 'notified'] } },
      data: { status: 'skipped' },
    });
    const prescription = await this.prisma.prescription.update({ where: { id }, data: { status: 'cancelled' } });
    await this.prisma.auditLog.create({
      data: { entity: 'prescription', entityId: id, action: 'cancelled', userId: actorId },
    });
    return prescription;
  }
}
