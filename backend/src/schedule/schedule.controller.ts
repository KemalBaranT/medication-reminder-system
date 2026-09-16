import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('schedule')
export class ScheduleController {
  constructor(private prisma: PrismaService) {}

  /** Hemsirenin telefonundaki "bugunun ilaclari" listesi: kendisine atanmis veya
   * henuz kimseye atanmamis (broadcast) bekleyen/bildirilmis dozlar. */
  @Get('mine')
  @Roles('nurse')
  async mine(@CurrentUser() user: AuthUser) {
    const schedules = await this.prisma.administrationSchedule.findMany({
      where: {
        status: { in: ['pending', 'notified'] },
        OR: [{ assignedNurseId: user.id }, { assignedNurseId: null }],
      },
      include: { prescription: { include: { patient: true, medication: true } } },
      orderBy: { scheduledTime: 'asc' },
    });

    return schedules.map((s) => ({
      id: s.id,
      status: s.status,
      scheduledTime: s.scheduledTime,
      patientName: s.prescription.patient.fullName,
      roomNo: s.prescription.patient.roomNo,
      patientWristbandCode: s.prescription.patient.wristbandCode,
      medicationName: s.prescription.medication.name,
      medicationBarcode: s.prescription.medication.barcode,
      dosage: s.prescription.dosage,
    }));
  }
}
