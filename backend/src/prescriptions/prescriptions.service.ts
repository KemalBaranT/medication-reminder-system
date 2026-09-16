import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleService } from '../schedule/schedule.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';

@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private scheduleService: ScheduleService,
  ) {}

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
      },
    });

    // Ilk 48 saatlik doz zamanlarini uret ve bildirim kuyruguna ekle
    await this.scheduleService.generateForPrescription(prescription.id);

    return prescription;
  }

  findForPatient(patientId: string) {
    return this.prisma.prescription.findMany({
      where: { patientId },
      include: { medication: true, schedules: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancel(id: string) {
    // Henuz uygulanmamis bekleyen dozlari da iptal et; BullMQ isleri zamaninda tetiklense bile
    // processor status !== 'pending' oldugunda bildirim gondermeyi atlar.
    await this.prisma.administrationSchedule.updateMany({
      where: { prescriptionId: id, status: { in: ['pending', 'notified'] } },
      data: { status: 'skipped' },
    });
    return this.prisma.prescription.update({ where: { id }, data: { status: 'cancelled' } });
  }
}
