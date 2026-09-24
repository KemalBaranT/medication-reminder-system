import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

/**
 * Panelin ana sayfasi icin tek bakista servis durumu. Kasitli olarak
 * kimlik dogrulanmis her role acik tutulur (hemsireleri yalnizca
 * yonetim analitigiyle sinirlayan ReportsController'in aksine), cunku
 * "kac hasta yatiyor" ve "su an kac doz gecikmis" bilgileri, ana sayfaya
 * gelen bir hemsirenin once ihtiyac duydugu tam olarak bu sayilardir,
 * denetim seviyesindeki raporlama degil.
 */
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('summary')
  summary() {
    return this.dashboardService.summary();
  }
}
