import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import type { TimelineEntry } from './patient-timeline.types';

/** Basili bir bileklik etiketi, tarama yerine gozle okundugunda gorsel olarak karisabilecek ciftlerden (0/O, 1/I) kacinmak icin secilmis karakterler. */
const WRISTBAND_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const WRISTBAND_CODE_LENGTH = 8;
const WRISTBAND_GENERATION_ATTEMPTS = 5;

/**
 * Hasta kayitlari icin CRUD ve yasam dongusu yonetimi; yumusak taburculuk
 * (durum degisikligi, gecmis korunur) ile kalici silme (hatali kabul
 * kayitlarini duzeltmek icin kullanilir) arasindaki ayrimi da icerir.
 * Kabul, taburculuk ve yeniden yatis islemleri de AuditLog'a yazilir;
 * boylece klinik seyir (bkz. `getTimeline`) her gecisi kimin ve ne zaman
 * yaptigina dair kalici bir kayda sahip olur.
 */
@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Bileklik kodu verilmediginde sunucu bir tane uretir; boylece her hasta,
   * on burodaki personelin bir kod uydurmasina guvenmek yerine, fiziksel
   * bir bilekligin uzerine basilabilecek taranabilir bir kimlige her zaman
   * sahip olur.
   */
  async create(dto: CreatePatientDto, actorId?: string) {
    const wristbandCode = dto.wristbandCode ?? (await this.generateUniqueWristbandCode());
    const patient = await this.prisma.patient.create({
      data: {
        ...dto,
        wristbandCode,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      },
    });
    await this.logAudit(patient.id, 'admitted', actorId);
    return patient;
  }

  findAll() {
    return this.prisma.patient.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findByWristbandCode(code: string) {
    const patient = await this.prisma.patient.findUnique({ where: { wristbandCode: code } });
    if (!patient) throw new NotFoundException('Bileklik kodu eşleşen hasta bulunamadı');
    return patient;
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: { prescriptions: { include: { medication: true } } },
    });
    if (!patient) throw new NotFoundException('Hasta bulunamadı');
    return patient;
  }

  /** Demografik/lokasyon duzenlemelerinin Patient satirinda baska bir zaman damgali izi yoktur, bu yuzden her duzenleme, diger tum hasta kaydi degisiklikleri gibi AuditLog'a yazilir. */
  async update(id: string, dto: UpdatePatientDto, actorId?: string) {
    await this.ensureExists(id);
    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        ...dto,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      },
    });
    await this.logAudit(id, 'updated', actorId);
    return patient;
  }

  /** Bir hastayi kaydini silmeden taburcu olarak isaretler; recete ve doz gecmisini denetim icin korur. */
  async discharge(id: string, actorId?: string) {
    await this.ensureExists(id);
    const patient = await this.prisma.patient.update({
      where: { id },
      data: { status: 'discharged', dischargedAt: new Date() },
    });
    await this.logAudit(id, 'discharged', actorId);
    return patient;
  }

  /** Hatali kaydedilmis bir taburculugu geri alir; recete gecmisine dokunmadan hastayi yatan durumuna geri getirir. */
  async readmit(id: string, actorId?: string) {
    await this.ensureExists(id);
    const patient = await this.prisma.patient.update({
      where: { id },
      data: { status: 'admitted', dischargedAt: null },
    });
    await this.logAudit(id, 'readmitted', actorId);
    return patient;
  }

  /**
   * Bir hasta kaydini kalici olarak kaldirir. Prisma semasinda tanimli
   * kaskatli yabanci anahtarlara dayanir; boylece bu hastaya ait receteler,
   * doz planlari ve uygulama kayitlari yetim satirlar olarak kalmak yerine
   * onunla birlikte kaldirilir. Denetim kaydi silme isleminden *once*
   * yazilir ama sirasi ne olursa olsun ona hayatta kalir: AuditLog.entityId
   * Patient'a yabanci anahtar degil, duz bir metindir; bu ozellikle "bu
   * dosya vardi ve X tarafindan Y tarihinde silindi" seklindeki bir
   * uyumluluk kaydinin, tarif ettigi satirdan daha uzun omurlu olmasi
   * icindir.
   */
  async remove(id: string, actorId?: string) {
    await this.ensureExists(id);
    await this.logAudit(id, 'deleted', actorId);
    await this.prisma.patient.delete({ where: { id } });
  }

  /**
   * Hasta detay sayfasinda gosterilen "Klinik Seyir" zaman cizelgesini,
   * her seyi AuditLog'a tekrar yazmak yerine birbirinden bagimsiz uc
   * zaman-damgali kaynagi birlestirerek olusturur: hastanin kendi kabul/
   * taburculuk zaman damgalari, recete olusturma kayitlari (zaten yazarini
   * ve createdAt'ini tasir) ve uygulama kayitlari (zaten hemsireyi ve
   * performedAt'i tasir). AuditLog yalnizca baska turlu hicbir iz
   * birakmayacak olaylari saglar: taburculuk, yeniden yatis ve recete
   * iptali.
   */
  async getTimeline(patientId: string): Promise<TimelineEntry[]> {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Hasta bulunamadı');

    const [auditLogs, prescriptions] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { entity: 'patient', entityId: patientId, action: { in: ['admitted', 'discharged', 'readmitted'] } },
        include: { user: { select: { fullName: true, title: true } } },
      }),
      this.prisma.prescription.findMany({
        where: { patientId },
        include: {
          medication: true,
          prescribedBy: { select: { fullName: true, title: true } },
          schedules: { include: { log: { include: { nurse: { select: { fullName: true, title: true } } } } } },
        },
      }),
    ]);

    const entries: TimelineEntry[] = [];
    const ADMISSION_TYPE_BY_ACTION: Record<string, TimelineEntry['type']> = {
      admitted: 'admission',
      discharged: 'discharge',
      readmitted: 'readmission',
    };

    for (const log of auditLogs) {
      entries.push({ type: ADMISSION_TYPE_BY_ACTION[log.action], timestamp: log.createdAt, actor: log.user });
    }

    // AuditLog devreye alinmadan once yatirilan hastalarin 'admitted' kaydi yoktur; bilinen bir aktor olmadan createdAt'e geri donulur.
    if (!auditLogs.some((log) => log.action === 'admitted')) {
      entries.push({ type: 'admission', timestamp: patient.createdAt, actor: null });
    }

    for (const prescription of prescriptions) {
      entries.push({
        type: 'prescription_created',
        timestamp: prescription.createdAt,
        actor: prescription.prescribedBy,
        medicationName: prescription.medication.name,
        dosage: prescription.dosage,
      });

      for (const schedule of prescription.schedules) {
        if (!schedule.log) continue;
        entries.push({
          type: schedule.log.action === 'administered' ? 'dose_administered' : 'dose_withheld',
          timestamp: schedule.log.performedAt,
          actor: schedule.log.nurse,
          medicationName: prescription.medication.name,
          dosage: prescription.dosage,
          reason: schedule.log.reason,
        });
      }
    }

    const cancelledPrescriptionLogs = await this.prisma.auditLog.findMany({
      where: { entity: 'prescription', entityId: { in: prescriptions.map((p) => p.id) }, action: 'cancelled' },
      include: { user: { select: { fullName: true, title: true } } },
    });
    for (const log of cancelledPrescriptionLogs) {
      const prescription = prescriptions.find((p) => p.id === log.entityId);
      entries.push({
        type: 'prescription_cancelled',
        timestamp: log.createdAt,
        actor: log.user,
        medicationName: prescription?.medication.name,
        dosage: prescription?.dosage,
      });
    }

    return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Fiziksel bir bileklik kayboldugunda, hasar gordugunde veya hatali
   * basildiginda, hastanin mevcut bileklik kodunu gecersiz kilar ve yeni
   * bir tane verir. Eski kod, bu islem tamamlandigi anda
   * `findByWristbandCode` uzerinden artik cozumlenmez; boylece bir
   * yenisi basildiktan sonra kaybolan bileklik, yatak basinda hastayi
   * yanlis tanimlamak icin kullanilamaz.
   */
  async regenerateWristbandCode(id: string, actorId?: string) {
    await this.ensureExists(id);
    const wristbandCode = await this.generateUniqueWristbandCode();
    const patient = await this.prisma.patient.update({ where: { id }, data: { wristbandCode } });
    await this.logAudit(id, 'wristband_regenerated', actorId);
    return patient;
  }

  /** Rastgeleligin tek basina yeterli oldugunu varsaymak yerine, mevcut bir kodla astronomik olarak dusuk olasilikli bir catisma durumunda tekrar dener. */
  private async generateUniqueWristbandCode(): Promise<string> {
    for (let attempt = 0; attempt < WRISTBAND_GENERATION_ATTEMPTS; attempt += 1) {
      const candidate = `WB-${this.randomWristbandSuffix()}`;
      const exists = await this.prisma.patient.findUnique({ where: { wristbandCode: candidate }, select: { id: true } });
      if (!exists) return candidate;
    }
    throw new InternalServerErrorException('Benzersiz bileklik kodu üretilemedi, tekrar deneyin');
  }

  private randomWristbandSuffix(): string {
    const bytes = randomBytes(WRISTBAND_CODE_LENGTH);
    let code = '';
    for (let i = 0; i < WRISTBAND_CODE_LENGTH; i += 1) {
      code += WRISTBAND_CODE_ALPHABET[bytes[i] % WRISTBAND_CODE_ALPHABET.length];
    }
    return code;
  }

  private async logAudit(patientId: string, action: string, actorId?: string) {
    await this.prisma.auditLog.create({
      data: { entity: 'patient', entityId: patientId, action, userId: actorId },
    });
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.patient.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Hasta bulunamadı');
  }
}
