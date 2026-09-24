import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Hastane personelinin kimlik bilgilerini dogrular ve diger tum modullerin
 * kimlik dogrulama ile rol tabanli yetkilendirme icin guvendigi JWT'yi
 * uretir. Kisa omurlu access token'in yaninda uzun omurlu bir refresh
 * token da uretir/dogrular; boylece bir vardiya ortasinda access token
 * suresi dolsa bile mobil istemci kullaniciyi login ekranina dusurmeden
 * sessizce yenileyebilir (bkz. AuthController.refresh).
 */
@Injectable()
export class AuthService {
  /** Aksi belirtilmedikce bir refresh token'in gecerlilik suresi (gun). */
  private readonly refreshTokenTtlMs =
    Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS ?? 30) * 24 * 60 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Bir personeli e-posta/sifre ile kimlik dogrular ve id, rol ile
   * e-postasini tasiyan imzali bir JWT uretir. Devre disi birakilmis bir
   * hesap (isActive: false), yanlis sifreyle ayni genel hatayla
   * reddedilir; boylece giris formu bir e-postanin var olup olmadigini
   * veya devre disi olup olmadigini asla sizdirmaz.
   */
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Geçersiz kimlik bilgileri');
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Geçersiz kimlik bilgileri');
    }

    return this.issueSession(user);
  }

  /**
   * Sunulan refresh token gecerliyse (bulunuyor, iptal edilmemis, suresi
   * gecmemis) yeni bir access+refresh token cifti uretir ve eskisini
   * rotate ederek iptal eder. Rotasyon, calinmis bir refresh token'in
   * sinirsiz sure boyunca tekrar tekrar kullanilabilir kalmasini engeller -
   * her kullanimda bir oncekini gecersiz kilar.
   */
  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Oturum geçersiz, tekrar giriş yapın.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Oturum geçersiz, tekrar giriş yapın.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(user);
  }

  /**
   * Sunulan refresh token'i sunucu tarafinda iptal eder. Bilinmeyen veya
   * zaten iptal edilmis bir token icin sessizce hicbir sey yapmaz
   * (idempotent) - `updateMany` bu yuzden `update` yerine kasitli olarak
   * kullanilir; cikis akisi hicbir zaman "token zaten gecersizdi" gibi bir
   * hatayla kesintiye ugramamalidir.
   */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(64).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + this.refreshTokenTtlMs),
      },
    });
    return token;
  }

  /** login() ve refresh() arasinda paylasilan, donen oturum govdesini kuran ortak adim. */
  private async issueSession(user: {
    id: string;
    fullName: string;
    title: string | null;
    email: string;
    role: string;
  }) {
    const payload = { sub: user.id, role: user.role, email: user.email };
    const refreshToken = await this.issueRefreshToken(user.id);
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        title: user.title,
        email: user.email,
        role: user.role,
      },
    };
  }
}
