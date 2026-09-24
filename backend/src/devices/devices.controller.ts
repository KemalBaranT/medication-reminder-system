import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

/**
 * Mobil uygulama tarafindan baslangicta ve FCM token'i her degistiginde
 * cagirilir; boylece backend, ilac zamani uyarilarini gonderecegi guncel
 * bir kanala her zaman sahip olur. @Roles ile sinirlanmak yerine kimlik
 * dogrulanmis her role acik tutulur, cunku sistemin baska yerinde neye
 * yetkili olduklarindan bagimsiz olarak her personelin cihazinin kayit
 * olmasi gerekir.
 */
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Post('register')
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    return this.devicesService.register(user.id, dto.fcmToken, dto.platform);
  }
}
