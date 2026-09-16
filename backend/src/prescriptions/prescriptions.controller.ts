import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private prescriptionsService: PrescriptionsService) {}

  @Post()
  @Roles('doctor')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptionsService.create(user.id, dto);
  }

  @Get('patient/:patientId')
  findForPatient(@Param('patientId') patientId: string) {
    return this.prescriptionsService.findForPatient(patientId);
  }

  @Patch(':id/cancel')
  @Roles('doctor', 'head_nurse')
  cancel(@Param('id') id: string) {
    return this.prescriptionsService.cancel(id);
  }
}
