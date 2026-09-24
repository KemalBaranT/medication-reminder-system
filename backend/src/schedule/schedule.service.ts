import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ESCALATE_JOB, GENERATION_HORIZON_HOURS, NOTIFY_JOB } from './schedule.constants';

/** Klinik sonucu henuz karara baglanmamis durumlar; saati yalnizca bunlar icin degistirilebilir. */
const RESCHEDULABLE_STATUSES = ['pending', 'notified'];

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('medication-notifications') private notificationQueue: Queue,
  ) {}

  /**
   * Bir recete icin, simdiki zamandan itibaren GENERATION_HORIZON_HOURS ileriye kadar
   * "su saatte verilecek" kayitlarini uretir ve her biri icin tam zamaninda tetiklenecek
   * gecikmeli bir bildirim isi (BullMQ delayed job) kuyruga ekler.
   */
  async generateForPrescription(prescriptionId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
    });
    if (!prescription || prescription.status !== 'active') return;

    const now = new Date();
    const horizonEnd = new Date(now.getTime() + GENERATION_HORIZON_HOURS * 60 * 60 * 1000);
    const windowEnd = prescription.endAt && prescription.endAt < horizonEnd ? prescription.endAt : horizonEnd;

    const intervalMs = prescription.frequencyHours * 60 * 60 * 1000;
    let cursor = new Date(prescription.startAt);
    // Gecmiste kalan dozlari atla, bir sonraki gelecek zamana ilerle
    while (cursor < now) {
      cursor = new Date(cursor.getTime() + intervalMs);
    }

    while (cursor <= windowEnd) {
      await this.createOccurrenceIfMissing(prescription.id, cursor);
      cursor = new Date(cursor.getTime() + intervalMs);
    }
  }

  private async createOccurrenceIfMissing(prescriptionId: string, scheduledTime: Date) {
    const existing = await this.prisma.administrationSchedule.findFirst({
      where: { prescriptionId, scheduledTime },
    });
    if (existing) return;

    const schedule = await this.prisma.administrationSchedule.create({
      data: { prescriptionId, scheduledTime },
    });

    await this.enqueueNotifyJob(schedule.id, scheduledTime);
  }

  private async enqueueNotifyJob(scheduleId: string, scheduledTime: Date) {
    const delay = Math.max(0, scheduledTime.getTime() - Date.now());
    await this.notificationQueue.add(
      NOTIFY_JOB,
      { scheduleId },
      { jobId: `notify-${scheduleId}`, delay, removeOnComplete: true, removeOnFail: true },
    );
  }

  /**
   * Tek bir doz olayini, recetenin tekrarlanan sikligindan bagimsiz olarak
   * yeni bir saate tasir. Yalnizca henuz kaydedilmis bir sonucu olmayan
   * dozlar tasinabilir; daha once kuyruga alinmis BullMQ bildirim isi
   * degistirilir, boylece hemsire orijinal saat yerine duzeltilmis saatte
   * uyarilir.
   */
  async rescheduleDose(scheduleId: string, newTime: Date) {
    const schedule = await this.prisma.administrationSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException('Doz kaydı bulunamadı');
    if (!RESCHEDULABLE_STATUSES.includes(schedule.status)) {
      throw new BadRequestException('Sadece bekleyen dozların saati değiştirilebilir');
    }

    const updated = await this.prisma.administrationSchedule.update({
      where: { id: scheduleId },
      data: { scheduledTime: newTime, status: 'pending', notifiedAt: null },
    });

    await this.notificationQueue.remove(`notify-${scheduleId}`);
    await this.enqueueNotifyJob(scheduleId, newTime);

    return updated;
  }

  async enqueueEscalation(scheduleId: string, delayMinutes: number) {
    await this.notificationQueue.add(
      ESCALATE_JOB,
      { scheduleId },
      { jobId: `escalate-${scheduleId}`, delay: delayMinutes * 60 * 1000, removeOnComplete: true, removeOnFail: true },
    );
  }

  /**
   * Her gece calisip aktif tum receteler icin ufku ileri kaydiran uretici.
   * Sunucu yeniden baslasa da BullMQ delayed job'lari Redis'te kalici oldugundan
   * mevcut bildirimler kaybolmaz; bu sadece yeni doz zamanlarini ekler.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async generateForAllActivePrescriptions() {
    const activePrescriptions = await this.prisma.prescription.findMany({
      where: { status: 'active' },
      select: { id: true },
    });
    this.logger.log(`Gunluk uretim: ${activePrescriptions.length} aktif recete islenecek`);
    for (const p of activePrescriptions) {
      await this.generateForPrescription(p.id);
    }
  }
}
