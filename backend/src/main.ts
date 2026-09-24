import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Uygulama giris noktasi. API, her biri kendi origin'inde calisan birden
 * fazla birinci taraf istemciden (web paneli ve Flutter uygulamasi)
 * cagrildigindan CORS varsayilan olarak aciktir; global ValidationPipe,
 * bilinmeyen alanlari herhangi bir controller'a ulasmadan once ayiklar ve
 * hatali govdeleri reddeder, boylece her servis aldigi DTO'lara guvenebilir.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Backend hazir: http://localhost:${port}`);
}
bootstrap();
