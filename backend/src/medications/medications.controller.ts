import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { MedicationsService } from './medications.service';
import { CreateMedicationDto } from './dto/create-medication.dto';

/**
 * Okuma erisimi kimlik dogrulanmis her role aciktir, cunku hemsireler,
 * doktorlar ve idari personelin tumu ilac aramasi gerekir (rececte yazmak,
 * barkod dogrulama adimi veya katalog bakimi icin); yalnizca hastane
 * stogunu yoneten roller yeni kayit ekleyebilir.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('medications')
export class MedicationsController {
  constructor(private medicationsService: MedicationsService) {}

  @Post()
  @Roles('secretary', 'head_nurse', 'doctor', 'admin')
  create(@Body() dto: CreateMedicationDto) {
    return this.medicationsService.create(dto);
  }

  @Get()
  findAll() {
    return this.medicationsService.findAll();
  }

  @Get('barcode/:code')
  findByBarcode(@Param('code') code: string) {
    return this.medicationsService.findByBarcode(code);
  }
}
