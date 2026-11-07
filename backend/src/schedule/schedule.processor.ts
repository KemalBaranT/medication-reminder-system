import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { DoseAlertDispatcher, type DoseAlertPayload } from '../notifications/dose-alert.dispatcher';
import { DevicesService } from '../devices/devices.service';
import { ScheduleService } from './schedule.service';
import { DEFAULT_OVERDUE_MINUTES, ESCALATE_JOB, NOTIFY_JOB, PREPARE_JOB } from './schedule.constants';

type ScheduleWithContext = NonNullable<Awaited<ReturnType<ScheduleProcessor['loadSchedule']>>>;

/**
 * Kademeli bildirim zaman çizelgesinin (Hazırlık → Uygulama Zamanı →
 * Gecikme) sunucu tarafı yürütücüsü.
 *
 * Her kademe, dozun o anki durumunu veritabanından yeniden okur ve yalnızca
 * doz hâlâ açıksa işlem yapar: hemşire dozu kademeler arasında kaydettiyse
 * sonraki kademeler sessizce düşer. Durum geçişleri koşullu `updateMany`
 * ile yapılır; bildirim gönderimi sürerken hemşirenin kaydettiği bir doz
 * geri "bekliyor" durumuna düşürülemez.
 *
 * Bildirimin hangi cihaza hangi biçimde gideceği (sessiz senkron sinyali
 * veya görünür eskalasyon) `DoseAlertDispatcher`'da belgelenmiştir.
 */
@Injectable()
@Processor('medication-notifications')
export class ScheduleProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduleProcessor.name);

  constructor(
    private prisma: PrismaService,
    private dispatcher: DoseAlertDispatcher,
    private devicesService: DevicesService,
    private scheduleService: ScheduleService,
    private config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<{ scheduleId: string }>): Promise<void> {
    if (job.name === PREPARE_JOB) return this.handlePrepare(job.data.scheduleId);
    if (job.name === NOTIFY_JOB) return this.handleNotify(job.data.scheduleId);
    if (job.name === ESCALATE_JOB) return this.handleEscalate(job.data.scheduleId);
  }

  /** Kademe 1 — "Hazırlık": planlanan saatten 15 dk önce hemşire cihazlarına senkron sinyali. */
  private async handlePrepare(scheduleId: string) {
    const schedule = await this.loadSchedule(scheduleId);
    if (!schedule || schedule.status !== 'pending') return;
    await this.dispatcher.sendSyncSignal(await this.nurseTokensFor(schedule), this.toPayload(schedule), 'prepare');
  }

  /**
   * Kademe 2 — "Uygulama Zamanı": dozu `notified` yapar, hemşire
   * cihazlarına senkron sinyali gönderir ve gecikme kademesini kuyruğa alır.
   */
  private async handleNotify(scheduleId: string) {
    const schedule = await this.loadSchedule(scheduleId);
    // Hasta taburcu olmus / recete iptal edilmis olabilir - artik pending degilse atla
    if (!schedule || schedule.status !== 'pending') return;

    await this.dispatcher.sendSyncSignal(await this.nurseTokensFor(schedule), this.toPayload(schedule), 'due');

    // Kosullu guncelleme: gonderim suren saniyeler icinde hemsire dozu
    // erken uygulamis olabilir. Kosulsuz bir `update`, "administered"
    // durumunu "notified"a geri cevirir ve verilmis bir dozu tekrar bekleyen
    // olarak listeleyerek mukerrer uygulamaya yol acabilirdi.
    const marked = await this.prisma.administrationSchedule.updateMany({
      where: { id: scheduleId, status: 'pending' },
      data: { status: 'notified', notifiedAt: new Date() },
    });
    if (marked.count === 0) return;

    await this.scheduleService.enqueueEscalation(scheduleId, this.overdueMinutes());
  }

  /**
   * Kademe 3 — "Gecikme": doz hâlâ açıksa `missed` yapılır, başhemşirelere
   * görünür kritik uyarı ve hemşire cihazlarına senkron sinyali gönderilir.
   * `missed` nihai bir durum değildir; hemşire dozu geç de olsa kaydedebilir.
   */
  private async handleEscalate(scheduleId: string) {
    const schedule = await this.loadSchedule(scheduleId);
    // Bu sure icinde hemsire islem yaptiysa (administered/skipped) status zaten degismistir
    if (!schedule || schedule.status !== 'notified') return;

    // Ayni yaris durumu: kontrol ile yazma arasinda hemsire dozu kaydetmis
    // olabilir; kosullu guncelleme verilmis bir dozun "missed"e dusmesini
    // ve bashemsireye yanlis alarm gitmesini engeller.
    const escalated = await this.prisma.administrationSchedule.updateMany({
      where: { id: scheduleId, status: 'notified' },
      data: { status: 'missed' },
    });
    if (escalated.count === 0) return;

    const payload = this.toPayload(schedule);
    await Promise.all([
      this.dispatcher.sendOverdueEscalation(await this.tokensForRole('head_nurse'), payload),
      this.dispatcher.sendSyncSignal(await this.nurseTokensFor(schedule), payload, 'overdue'),
    ]);

    this.logger.warn(`Ilac gecikti: schedule=${scheduleId}, hasta=${schedule.prescription.patient.fullName}`);
  }

  private loadSchedule(scheduleId: string) {
    return this.prisma.administrationSchedule.findUnique({
      where: { id: scheduleId },
      include: { prescription: { include: { patient: true, medication: true } } },
    });
  }

  private toPayload(schedule: ScheduleWithContext): DoseAlertPayload {
    const { patient, medication, dosage } = schedule.prescription;
    return {
      scheduleId: schedule.id,
      patientName: patient.fullName,
      patientWristbandCode: patient.wristbandCode,
      roomNo: patient.roomNo ?? '',
      medicationName: medication.name,
      dosage,
      scheduledTime: schedule.scheduledTime,
    };
  }

  /** Gecikme eşiği (dakika); `ESCALATION_MINUTES` ile hastane bazında ayarlanır. */
  private overdueMinutes(): number {
    const configured = Number(this.config.get('ESCALATION_MINUTES'));
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_OVERDUE_MINUTES;
  }

  /** Atanmış hemşirenin cihazları; doz atanmamışsa (yayın) tüm hemşirelerin cihazları. */
  private async nurseTokensFor(schedule: ScheduleWithContext): Promise<string[]> {
    return schedule.assignedNurseId
      ? this.devicesService.tokensForUser(schedule.assignedNurseId)
      : this.tokensForRole('nurse');
  }

  private async tokensForRole(role: string): Promise<string[]> {
    const devices = await this.prisma.device.findMany({ where: { user: { role: role as never, isActive: true } } });
    return devices.map((d) => d.fcmToken);
  }
}
