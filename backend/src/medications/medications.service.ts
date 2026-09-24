import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMedicationDto } from './dto/create-medication.dto';

/**
 * Recetelerin beslendigi ortak ilac katalogunu yonetir. Prescription'dan
 * ayri tutulur, boylece doz ve plan recete basina kalirken, ilacin kimligi
 * (ad, barkod, form) bir kez tanimlanir ve recete edildigi her hastada
 * yeniden kullanilir.
 */
@Injectable()
export class MedicationsService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateMedicationDto) {
    return this.prisma.medication.create({ data: dto });
  }

  findAll() {
    return this.prisma.medication.findMany({ orderBy: { name: 'asc' } });
  }

  /** Hemsirenin tara-ve-dogrula guvenlik kontrolu icin bir ilaci fiziksel ambalaj barkodundan bulur. */
  async findByBarcode(barcode: string) {
    const medication = await this.prisma.medication.findUnique({ where: { barcode } });
    if (!medication) throw new NotFoundException('Barkod eşleşen ilaç bulunamadı');
    return medication;
  }
}
