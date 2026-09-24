import { IsOptional, IsString } from 'class-validator';

/**
 * Sadece zamanlamayi etkilemeyen alanlar duzenlenebilir. Sıklik (frequencyHours)
 * veya baslangic zamani degisirse zaten uretilmis doz kayitlarinin/BullMQ
 * islerinin yeniden hesaplanmasi gerekir; bu karmasikligi onlemek icin
 * sikligi degistirmek isteyen doktor receteyi iptal edip yenisini olusturur.
 */
export class UpdatePrescriptionDto {
  @IsOptional()
  @IsString()
  dosage?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  nurseNote?: string;
}
