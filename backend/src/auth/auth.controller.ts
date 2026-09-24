import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

/**
 * Kimlik bilgisi tabanli kimlik dogrulama icin herkese acik giris noktasi.
 * Kasitli olarak hicbir rota koruyucusu yoktur, cunku bir istemcinin JWT
 * sahibi olmadan once buraya ulasabilmesi gerekir; sistemdeki diger tum
 * controller'lar bunun ureteugi token'i zorunlu kilar. /refresh ve /logout
 * de ayni sebeple korumasizdir - gecerli bir refresh token sunmak burada
 * kimligin kendisidir, JwtAuthGuard'in aradigi access token ise tam da bu
 * iki uc noktaya gelindiginde suresi dolmus veya elde olmayabilir.
 */
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  /**
   * Access token'i kullaniciyi rahatsiz etmeden (sessizce) yeniler. Mobil
   * istemci bir istekte 401 aldiginda otomatik olarak burayi cagirir (bkz.
   * ApiService._send); yalnizca bu cagri da basarisiz olursa kullanici
   * login ekranina dusurulur.
   */
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /**
   * Sunulan refresh token'i sunucu tarafinda iptal eder ki cikis yapan bir
   * cihaz artik sessiz yenileme ile oturumu canlandiramasin.
   */
  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { success: true };
  }
}
