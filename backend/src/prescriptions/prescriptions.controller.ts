import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';

/**
 * Reçete yazma ve yaşam döngüsü. Oluşturma ve alan düzenlemeleri klinik
 * personel arasında yalnızca doktora açıktır; bu, reçete yazmanın klinik bir
 * karar olduğunu yansıtır. İptal işlemi başhemşireye de açıktır; böylece
 * hatalı bir emir, reçeteyi yazan doktoru beklemeden durdurulabilir.
 *
 * Super Admin, sistem genelindeki geçersiz kılma gereği (bkz.
 * `SUPER_ADMIN_ROLE`) test ve acil veri düzeltmesi amacıyla tüm reçete
 * işlemlerini yapabilir; yazdığı reçete `prescribedById` alanında kendi
 * hesabıyla kayda geçer.
 */
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

  @Patch(':id')
  @Roles('doctor')
  update(@Param('id') id: string, @Body() dto: UpdatePrescriptionDto, @CurrentUser() user: AuthUser) {
    return this.prescriptionsService.update(id, dto, user.id);
  }

  @Patch(':id/cancel')
  @Roles('doctor', 'head_nurse', 'admin')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.prescriptionsService.cancel(id, user.id);
  }
}
