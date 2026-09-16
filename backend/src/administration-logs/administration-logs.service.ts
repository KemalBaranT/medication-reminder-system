import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLogDto } from './dto/create-log.dto';

@Injectable()
export class AdministrationLogsService {
  constructor(private prisma: PrismaService) {}

  async create(nurseId: string, dto: CreateLogDto) {
    const schedule = await this.prisma.administrationSchedule.findUnique({
      where: { id: dto.scheduleId },
    });
    if (!schedule) throw new NotFoundException('Uygulama zamani bulunamadi');
    if (schedule.status === 'administered' || schedule.status === 'skipped') {
      throw new BadRequestException('Bu doz icin zaten bir kayit girilmis');
    }

    const log = await this.prisma.administrationLog.create({
      data: {
        scheduleId: dto.scheduleId,
        nurseId,
        action: dto.action,
        reason: dto.reason,
        barcodeVerified: dto.barcodeVerified,
        notes: dto.notes,
      },
    });

    await this.prisma.administrationSchedule.update({
      where: { id: dto.scheduleId },
      data: { status: dto.action === 'administered' ? 'administered' : 'skipped' },
    });

    return log;
  }
}
