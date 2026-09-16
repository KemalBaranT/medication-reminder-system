import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMedicationDto } from './dto/create-medication.dto';

@Injectable()
export class MedicationsService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateMedicationDto) {
    return this.prisma.medication.create({ data: dto });
  }

  findAll() {
    return this.prisma.medication.findMany({ orderBy: { name: 'asc' } });
  }

  async findByBarcode(barcode: string) {
    const medication = await this.prisma.medication.findUnique({ where: { barcode } });
    if (!medication) throw new NotFoundException('Barkod eslesen ilac bulunamadi');
    return medication;
  }
}
