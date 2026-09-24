import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/** Her yanittan passwordHash'i cikarir; asagidaki tum okuma/yazma sorgularinda kullanilir, boylece bir hash asla bir istemciye sizamaz. */
const SAFE_USER_SELECT = {
  id: true,
  fullName: true,
  title: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
};

/**
 * Personel Yonetimi modulu icin personel hesabi yasam dongusu: ise alma,
 * profil/rol duzenlemeleri ve isten cikarma. Silme islemi, "bir adminin
 * bir hesabi kaldirmasina izin ver" ile klinik denetim izlerinin
 * kaybedilmesini yasaklayan hastane kayit tutma gereksinimlerini
 * uzlastirmak icin kasitli olarak kosulludur (bkz. `remove`).
 */
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /** Sifreler asla duz metin olarak saklanmaz veya loglanmaz; yalnizca bcrypt hash'i kalici hale getirilir. */
  async create(dto: CreateUserDto, actorId?: string) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          title: dto.title,
          email: dto.email,
          passwordHash,
          role: dto.role,
        },
        select: SAFE_USER_SELECT,
      });
      // Kimin giris yapmaya yetkili oldugu ve hangi rolde oldugu, o hesabin
      // daha sonra yaptigi herhangi bir seyden bagimsiz olarak baslibasina
      // guvenlik acisindan hassas bir gercektir - bu yuzden hesap olusturma
      // burada denetlenir, ilk klinik eyleminden cikarilmaz.
      await this.logAudit(user.id, 'created', actorId);
      return user;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Bu e-posta adresi zaten kayıtlı');
      }
      throw e;
    }
  }

  findAll(role?: string) {
    return this.prisma.user.findMany({
      where: role ? { role: role as never } : undefined,
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * `dto.password` mevcutsa, kaydedilmeden once yeniden hash'lenir; bos
   * birakilmasi mevcut kimlik bilgisini degistirmeden birakir. Her
   * duzenleme, alan basina ayri bir eylem yerine ('role_changed',
   * 'deactivated' gibi) tek bir 'updated' eylemi altinda denetlenir,
   * cunku bu uc nokta birden fazla bagimsiz alanin kismi bir yamasini
   * ayni anda kabul eder - bir rol degisikligi ve bir unvan duzeltmesi
   * ayni istekte gelebilir - ve AuditLog'un hangi alanlarin gercekten
   * degistigini kaydedecek bir govde sutunu yoktur; korunan gercek, bu
   * zaman damgasinda, bu aktor tarafindan satirin var olmasidir.
   */
  async update(id: string, dto: UpdateUserDto, actorId?: string) {
    await this.ensureExists(id);
    const data: Prisma.UserUpdateInput = {
      fullName: dto.fullName,
      title: dto.title,
      role: dto.role,
      isActive: dto.isActive,
    };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    try {
      const user = await this.prisma.user.update({ where: { id }, data, select: SAFE_USER_SELECT });
      await this.logAudit(id, 'updated', actorId);
      return user;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Bu e-posta adresi zaten kayıtlı');
      }
      throw e;
    }
  }

  /**
   * Gecmiste recete yazmis, ilac uygulamasi kaydetmis veya baska bir denetim
   * izi (AuditLog) biraktiysa (hasta duzenleme/taburcu, baska bir personel
   * hesabi olusturma/duzenleme, vb.) personel hastane mevzuati geregi
   * denetim izini bozmamak icin kalici olarak silinmez; bunun yerine hesabi
   * pasife alinir (giris yapamaz). AuditLog.userId'nin ON DELETE SET NULL
   * olmasi kalici silmeyi veritabani seviyesinde "guvenli" kilar (hata
   * firlatmaz) ama bu tam olarak kacinilmasi gereken sonuc: gecmis bir
   * denetim kaydinin "kim yapti" alani sessizce bos kalir. Hicbir gecmis
   * kaydi olmayan (henuz hic islem yapmamis) bir personel dogrudan silinebilir.
   */
  async remove(id: string, requesterId: string) {
    if (id === requesterId) {
      throw new BadRequestException('Kendi hesabınızı silemezsiniz');
    }
    await this.ensureExists(id);

    const [prescriptionCount, logCount, auditActorCount] = await Promise.all([
      this.prisma.prescription.count({ where: { prescribedById: id } }),
      this.prisma.administrationLog.count({ where: { nurseId: id } }),
      this.prisma.auditLog.count({ where: { userId: id } }),
    ]);

    if (prescriptionCount > 0 || logCount > 0 || auditActorCount > 0) {
      await this.prisma.user.update({ where: { id }, data: { isActive: false } });
      await this.logAudit(id, 'deactivated', requesterId);
      return { deleted: false, deactivated: true };
    }

    await this.logAudit(id, 'deleted', requesterId);
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true, deactivated: false };
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Kullanıcı bulunamadı');
  }

  /** entityId, User'a yabanci anahtar degil duz bir metindir; bu yuzden bir 'deleted' kaydi tarif ettigi satirdan daha uzun omurlu olur - ayni desen icin bkz. PatientsService.remove. */
  private async logAudit(userId: string, action: string, actorId?: string) {
    await this.prisma.auditLog.create({
      data: { entity: 'user', entityId: userId, action, userId: actorId },
    });
  }
}
