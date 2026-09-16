import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreatePatientDto) {
    return this.prisma.patient.create({
      data: {
        ...dto,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      },
    });
  }

  findAll() {
    return this.prisma.patient.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findByWristbandCode(code: string) {
    const patient = await this.prisma.patient.findUnique({ where: { wristbandCode: code } });
    if (!patient) throw new NotFoundException('Bileklik kodu eslesen hasta bulunamadi');
    return patient;
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: { prescriptions: { include: { medication: true } } },
    });
    if (!patient) throw new NotFoundException('Hasta bulunamadi');
    return patient;
  }
}
