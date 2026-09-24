import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { ReportsService } from './reports.service';

/**
 * Hastane yonetimi icin salt-okunur analitik: doz uyumlulugu, zamanindalik
 * ve hemsire basina is yuku. Hemsire rolunu kasitli olarak disarida
 * birakir, cunku bu goruntuler tek bir klinisyenin vardiyasi yerine servis
 * genelini toplulastirir ve yatak basi kullanim icin degil, denetim icin
 * tasarlanmistir.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'head_nurse', 'doctor', 'secretary')
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  /** Opsiyonel bir tarih araliginda planlanan dozlari sonuca gore sayar (bekliyor, uygulandi, kacirildi, ...). */
  @Get('status-summary')
  statusSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.statusSummary(from, to);
  }

  /** Uygulanan dozlari zamaninda ve gecikmeli olarak ayristirir; servis icin temel hasta guvenligi KPI'sidir. */
  @Get('timeliness')
  timeliness(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.timelinessSummary(from, to);
  }

  /** Is yuku ve hesap verebilirlik incelemesi icin hemsire basina uygulanan ve uygulanmayan dozlari toplulastirir. */
  @Get('by-nurse')
  byNurse() {
    return this.reportsService.byNurse();
  }
}
