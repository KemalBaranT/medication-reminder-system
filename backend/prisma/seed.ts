import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@hastane.test' },
    update: {},
    create: {
      fullName: 'Sistem Yöneticisi',
      email: 'admin@hastane.test',
      passwordHash,
      role: 'admin',
    },
  });

  const headNurse = await prisma.user.upsert({
    where: { email: 'bashemsire@hastane.test' },
    update: {},
    create: {
      fullName: 'Ayşe Başaran',
      email: 'bashemsire@hastane.test',
      passwordHash,
      role: 'head_nurse',
    },
  });

  const doctor = await prisma.user.upsert({
    where: { email: 'doktor@hastane.test' },
    update: { title: 'Genel Cerrah' },
    create: {
      fullName: 'Mehmet Yılmaz',
      title: 'Genel Cerrah',
      email: 'doktor@hastane.test',
      passwordHash,
      role: 'doctor',
    },
  });

  const nurse = await prisma.user.upsert({
    where: { email: 'hemsire@hastane.test' },
    update: {},
    create: {
      fullName: 'Fatma Kaya',
      email: 'hemsire@hastane.test',
      passwordHash,
      role: 'nurse',
    },
  });

  const patient = await prisma.patient.upsert({
    where: { hospitalPatientNo: 'P-0001' },
    update: {},
    create: {
      hospitalPatientNo: 'P-0001',
      fullName: 'Test Hasta',
      floor: '3',
      roomNo: '304',
      bedNo: 'A',
      wristbandCode: 'WB-P-0001',
      status: 'admitted',
    },
  });

  await prisma.hospitalSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', hospitalName: 'Memorial Hastanesi' },
  });

  const medication = await prisma.medication.upsert({
    where: { barcode: 'MED-0001' },
    update: {},
    create: {
      name: 'Parol 500mg',
      barcode: 'MED-0001',
      form: 'tablet',
      unit: 'mg',
    },
  });

  console.log({
    admin: admin.email,
    headNurse: headNurse.email,
    doctor: doctor.email,
    nurse: nurse.email,
    patient: patient.hospitalPatientNo,
    medication: medication.name,
  });
  console.log('Tüm test kullanıcılarının şifresi: Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
