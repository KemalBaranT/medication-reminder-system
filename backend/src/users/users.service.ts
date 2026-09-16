import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        passwordHash,
        role: dto.role,
      },
    });
    const { passwordHash: _omit, ...safeUser } = user;
    return safeUser;
  }

  findAll(role?: string) {
    return this.prisma.user.findMany({
      where: role ? { role: role as never } : undefined,
      select: { id: true, fullName: true, email: true, role: true, isActive: true, createdAt: true },
    });
  }
}
