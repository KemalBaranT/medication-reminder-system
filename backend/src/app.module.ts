import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { MedicationsModule } from './medications/medications.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { ScheduleAppModule } from './schedule/schedule.module';
import { AdministrationLogsModule } from './administration-logs/administration-logs.module';
import { DevicesModule } from './devices/devices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    NestScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    MedicationsModule,
    PrescriptionsModule,
    ScheduleAppModule,
    AdministrationLogsModule,
    DevicesModule,
    NotificationsModule,
    ReportsModule,
  ],
})
export class AppModule {}
