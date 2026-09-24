import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

/**
 * Sistem genelinde tüm rol kısıtlamalarından muaf tutulan Super Admin rolü.
 *
 * **Super Admin geçersiz kılması (override):** Bu rol, sistemi yönetmek,
 * test etmek ve acil durumlarda her türlü veriyi düzeltebilmek amacıyla
 * tüm modüllerde sınırsız yetkiye sahiptir. `RolesGuard`, bu role sahip bir
 * kullanıcı için rota bazındaki `@Roles()` kısıtlamasını değerlendirmeden
 * geçişe izin verir; böylece hiçbir rotada 403 (Forbidden) almaz ve yeni
 * eklenen bir rotaya `admin` eklemeyi unutmak bu yetkiyi daraltamaz.
 *
 * **Denetim izlenebilirliği:** Geçersiz kılma yalnızca *yetkilendirmeyi*
 * atlar, *kimliği* değil. Kaydı yapan kişi her durumda JWT'den alınır;
 * Super Admin'in yaptığı bir ilaç uygulaması, reçete veya düzeltme kendi
 * hesabıyla denetim kaydına geçer ve başka bir personel adına yapılmış gibi
 * görünemez.
 */
export const SUPER_ADMIN_ROLE: Role = 'admin';

/**
 * `@Roles()` ile eklenen rol listesini zorunlu kılar. Bir controller'ın
 * guard zincirinde `JwtAuthGuard`'dan sonra çalışmalıdır, çünkü JWT
 * stratejisinin doldurduğu `request.user`'ı okur; `@Roles()` meta verisi
 * olmayan bir rotaya kimliği doğrulanmış her kullanıcı erişebilir.
 *
 * Super Admin yetkisiyle ([SUPER_ADMIN_ROLE]) yapılan isteklerde sistem
 * genelindeki tüm güvenlik ve operasyon kısıtlamaları, yönetim ve denetim
 * amacıyla bilinçli olarak aşılır: rol listesi hiç değerlendirilmez.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.role === SUPER_ADMIN_ROLE) return true;

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    return requiredRoles.includes(user?.role);
  }
}
