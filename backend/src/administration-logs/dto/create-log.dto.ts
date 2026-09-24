import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AdministrationAction, NonAdministrationReason } from '@prisma/client';

/**
 * Yatak basi uygulama kararinin istek govdesi. Kaydi yapan personel govdeden
 * degil, JWT'den alinir; boylece bir istemci baska bir hemsire adina kayit
 * olusturamaz.
 */
export class CreateLogDto {
  @IsUUID()
  scheduleId: string;

  @IsEnum(AdministrationAction)
  action: AdministrationAction;

  @IsOptional()
  @IsEnum(NonAdministrationReason)
  reason?: NonAdministrationReason;

  @IsBoolean()
  barcodeVerified: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * Kararin cihazda verildigi an. Yalnizca cevrimdisi kuyruktan gec
   * gonderilen kayitlar icin doldurulur: bu olmadan denetim kaydindaki saat,
   * ilacin verildigi an degil baglantinin geri geldigi an olurdu. Sunucu
   * degeri yalnizca makul bir pencere icindeyse kabul eder (bkz.
   * AdministrationLogsService.resolvePerformedAt).
   */
  @IsOptional()
  @IsDateString()
  performedAt?: string;
}
