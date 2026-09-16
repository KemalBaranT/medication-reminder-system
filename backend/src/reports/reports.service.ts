import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async statusSummary(from?: string, to?: string) {
    const where = {
      scheduledTime: {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      },
    };
    const grouped = await this.prisma.administrationSchedule.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    return grouped.map((g) => ({ status: g.status, count: g._count._all }));
  }

  /** Zamaninda mi (planlanan saatten sonraki 30 dk icinde) yoksa gecikmeli mi verildigini ozetler. */
  async timelinessSummary(from?: string, to?: string) {
    const logs = await this.prisma.administrationLog.findMany({
      where: {
        action: 'administered',
        schedule: {
          scheduledTime: {
            gte: from ? new Date(from) : undefined,
            lte: to ? new Date(to) : undefined,
          },
        },
      },
      include: { schedule: true },
    });

    let onTime = 0;
    let delayed = 0;
    for (const log of logs) {
      const diffMinutes = (log.performedAt.getTime() - log.schedule.scheduledTime.getTime()) / 60000;
      if (diffMinutes <= 30) onTime += 1;
      else delayed += 1;
    }
    return { onTime, delayed, total: logs.length };
  }

  async byNurse() {
    const nurses = await this.prisma.user.findMany({
      where: { role: 'nurse' },
      select: {
        id: true,
        fullName: true,
        administrationLogs: { select: { action: true } },
      },
    });
    return nurses.map((n) => ({
      nurseId: n.id,
      fullName: n.fullName,
      administered: n.administrationLogs.filter((l) => l.action === 'administered').length,
      notAdministered: n.administrationLogs.filter((l) => l.action === 'not_administered').length,
    }));
  }
}
