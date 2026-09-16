import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { ReportsService } from './reports.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('head_nurse', 'doctor', 'secretary')
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('status-summary')
  statusSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.statusSummary(from, to);
  }

  @Get('timeliness')
  timeliness(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.timelinessSummary(from, to);
  }

  @Get('by-nurse')
  byNurse() {
    return this.reportsService.byNurse();
  }
}
