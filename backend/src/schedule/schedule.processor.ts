import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { FcmService } from '../notifications/fcm.service';
import { DevicesService } from '../devices/devices.service';
import { ScheduleService } from './schedule.service';
import { ESCALATE_JOB, NOTIFY_JOB } from './schedule.constants';

@Injectable()
@Processor('medication-notifications')
export class ScheduleProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduleProcessor.name);

  constructor(
    private prisma: PrismaService,
    private fcmService: FcmService,
    private devicesService: DevicesService,
    private scheduleService: ScheduleService,
    private config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<{ scheduleId: string }>): Promise<void> {
    if (job.name === NOTIFY_JOB) return this.handleNotify(job.data.scheduleId);
    if (job.name === ESCALATE_JOB) return this.handleEscalate(job.data.scheduleId);
  }

  private async handleNotify(scheduleId: string) {
    const schedule = await this.prisma.administrationSchedule.findUnique({
      where: { id: scheduleId },
      include: { prescription: { include: { patient: true, medication: true } } },
    });
    // Hasta taburcu olmus / recete iptal edilmis olabilir - artik pending degilse atla
    if (!schedule || schedule.status !== 'pending') return;

    const tokens = schedule.assignedNurseId
      ? await this.devicesService.tokensForUser(schedule.assignedNurseId)
      : await this.tokensForAllActiveNurses();

    await this.fcmService.sendDataMessage(tokens, {
      type: 'medication_due',
      scheduleId: schedule.id,
      patientName: schedule.prescription.patient.fullName,
      roomNo: schedule.prescription.patient.roomNo ?? '',
      medicationName: schedule.prescription.medication.name,
      dosage: schedule.prescription.dosage,
      scheduledTime: schedule.scheduledTime.toISOString(),
    });

    await this.prisma.administrationSchedule.update({
      where: { id: scheduleId },
      data: { status: 'notified', notifiedAt: new Date() },
    });

    const escalationMinutes = Number(this.config.get('ESCALATION_MINUTES') ?? 15);
    await this.scheduleService.enqueueEscalation(scheduleId, escalationMinutes);
  }

  private async handleEscalate(scheduleId: string) {
    const schedule = await this.prisma.administrationSchedule.findUnique({
      where: { id: scheduleId },
      include: { prescription: { include: { patient: true, medication: true } } },
    });
    // Bu sure icinde hemsire islem yaptiysa (administered/skipped) status zaten degismistir
    if (!schedule || schedule.status !== 'notified') return;

    await this.prisma.administrationSchedule.update({
      where: { id: scheduleId },
      data: { status: 'missed' },
    });

    const headNurseTokens = await this.tokensForRole('head_nurse');
    await this.fcmService.sendDataMessage(headNurseTokens, {
      type: 'medication_missed',
      scheduleId: schedule.id,
      patientName: schedule.prescription.patient.fullName,
      roomNo: schedule.prescription.patient.roomNo ?? '',
      medicationName: schedule.prescription.medication.name,
      scheduledTime: schedule.scheduledTime.toISOString(),
    });

    this.logger.warn(`Ilac kacirildi: schedule=${scheduleId}, hasta=${schedule.prescription.patient.fullName}`);
  }

  private async tokensForRole(role: string): Promise<string[]> {
    const devices = await this.prisma.device.findMany({ where: { user: { role: role as never } } });
    return devices.map((d) => d.fcmToken);
  }

  private async tokensForAllActiveNurses(): Promise<string[]> {
    return this.tokensForRole('nurse');
  }
}
