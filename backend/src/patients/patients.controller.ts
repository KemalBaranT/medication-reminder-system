import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

/**
 * Hasta kabul ve demografik kayitlari. Okuma erisimi (findAll/findOne)
 * kimlik dogrulanmis her role aciktir, cunku servis genelindeki klinik
 * personelin bir hastayi bulabilmesi gerekir; yazma erisimi, dosyanin
 * dogrulugunu korumak icin kabul islemlerinden sorumlu rollerle
 * sinirlandirilmistir.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

  @Post()
  @Roles('secretary', 'head_nurse', 'doctor', 'admin')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto, user.id);
  }

  @Get()
  findAll() {
    return this.patientsService.findAll();
  }

  /** Bir dozu uygulamadan once hemsirenin tara-ve-dogrula guvenlik kontrolu icin hastayi bileklik barkodundan bulur. */
  @Get('wristband/:code')
  findByWristband(@Param('code') code: string) {
    return this.patientsService.findByWristbandCode(code);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  /** Hasta detay sayfasindaki "Klinik Seyir" zaman cizelgesini besler; hasta dosyasinin geri kalani gibi kimlik dogrulanmis her role aciktir. */
  @Get(':id/timeline')
  getTimeline(@Param('id') id: string) {
    return this.patientsService.getTimeline(id);
  }

  @Patch(':id')
  @Roles('secretary', 'head_nurse', 'doctor', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto, @CurrentUser() user: AuthUser) {
    return this.patientsService.update(id, dto, user.id);
  }

  @Patch(':id/discharge')
  @Roles('secretary', 'head_nurse', 'doctor', 'admin')
  discharge(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.patientsService.discharge(id, user.id);
  }

  @Patch(':id/readmit')
  @Roles('secretary', 'head_nurse', 'doctor', 'admin')
  readmit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.patientsService.readmit(id, user.id);
  }

  /** Kayip/hasarli bir bileklik bildirildikten sonra yerine gececek bir kod uretir ve eskisini aninda gecersiz kilar. */
  @Post(':id/qr-regenerate')
  @Roles('secretary', 'head_nurse', 'doctor', 'admin')
  regenerateQr(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.patientsService.regenerateWristbandCode(id, user.id);
  }

  @Delete(':id')
  @Roles('head_nurse', 'secretary', 'admin')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.patientsService.remove(id, user.id);
    return { success: true };
  }
}
