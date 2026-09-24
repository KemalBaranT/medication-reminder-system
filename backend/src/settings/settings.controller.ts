import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

/**
 * Tek bir dagitimin kod degisikligi veya yeniden dagitim yapilmadan bir
 * musteri icin yeniden etiketlenmesine olanak taniyan kiraci seviyesinde
 * markalama (su anda hastanenin goruntulenen adi). Okuma herkese aciktir;
 * boylece giris ekrani bir oturum olusmadan once hastane adini
 * gosterebilir. Yazma islemleri idari rollerle sinirlandirilmistir.
 */
@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  /** Markalama giristen once render edilebilsin diye kasitli olarak kimlik dogrulamasi gerektirmez. */
  @Get()
  get() {
    return this.settingsService.get();
  }

  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'head_nurse', 'secretary')
  update(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(dto);
  }
}
