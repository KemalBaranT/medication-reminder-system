import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AdministrationLogsService } from './administration-logs.service';
import { CreateLogDto } from './dto/create-log.dto';

/**
 * Hemşirenin cihazının, hasta ve ilacı taradıktan ve bir sonuç seçtikten
 * sonra çağırdığı yatak başı uç noktası. Hemşire ve başhemşire rolleriyle
 * sınırlıdır, çünkü bir doz hakkında ne olduğunu ancak fiilen orada
 * bulunan hemşirelik personeli doğrulayabilir. Başhemşire de servis
 * yoğunluğunda veya personel eksikliğinde bizzat ilaç uyguladığı için
 * dahildir; doktor ve sekreter ise ilaç uygulamadığından kasıtlı olarak
 * dışarıda bırakılmıştır. Super Admin, sistem genelindeki geçersiz kılma
 * gereği (bkz. `SUPER_ADMIN_ROLE`) test ve acil veri düzeltmesi için bu
 * uç noktayı da kullanabilir. Kaydı yapan kişi her durumda JWT'den
 * alındığı için denetim izinde hangi hesabın uyguladığı ayırt edilebilir.
 *
 * Bu, mobil ve web "İlaç Verme" iş akışlarının backend tarafındaki tek
 * yazma noktasıdır. Dozun durumunu `PATCH /schedule/:id` ile değiştirmek yerine
 * yeni bir denetim kaydı (`POST`) oluşturulur, çünkü klinik olarak kayıt
 * altına alınan şey bir alanın güncellenmesi değil, değiştirilemez bir
 * olaydır: "şu hemşire, şu saatte, barkod doğrulamasıyla bu dozu verdi".
 * Dozun durumu bu olayın yan etkisi olarak aynı transaction içinde
 * güncellenir (bkz. AdministrationLogsService.create). `PATCH
 * /schedule/:id` ise kasıtlı olarak yalnızca saat düzeltmesine ayrılmıştır.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('administration-logs')
export class AdministrationLogsController {
  constructor(private logsService: AdministrationLogsService) {}

  @Post()
  @Roles('nurse', 'head_nurse')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLogDto) {
    return this.logsService.create(user.id, dto);
  }
}
