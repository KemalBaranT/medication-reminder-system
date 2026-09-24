-- CreateEnum
CREATE TYPE "Role" AS ENUM ('doctor', 'head_nurse', 'nurse', 'secretary');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('admitted', 'discharged', 'transferred');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('pending', 'notified', 'administered', 'missed', 'skipped');

-- CreateEnum
CREATE TYPE "AdministrationAction" AS ENUM ('administered', 'not_administered');

-- CreateEnum
CREATE TYPE "NonAdministrationReason" AS ENUM ('patient_asleep', 'refused', 'discharged', 'unavailable', 'other');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "hospitalPatientNo" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "roomNo" TEXT,
    "bedNo" TEXT,
    "birthDate" TIMESTAMP(3),
    "wristbandCode" TEXT NOT NULL,
    "status" "PatientStatus" NOT NULL DEFAULT 'admitted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medications" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "form" TEXT,
    "unit" TEXT,

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "prescribedById" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "route" TEXT,
    "frequencyHours" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administration_schedule" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "assignedNurseId" TEXT,
    "scheduledTime" TIMESTAMP(3) NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'pending',
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administration_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administration_logs" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "nurseId" TEXT NOT NULL,
    "action" "AdministrationAction" NOT NULL,
    "reason" "NonAdministrationReason",
    "barcodeVerified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "devices_userId_fcmToken_key" ON "devices"("userId", "fcmToken");

-- CreateIndex
CREATE UNIQUE INDEX "patients_hospitalPatientNo_key" ON "patients"("hospitalPatientNo");

-- CreateIndex
CREATE UNIQUE INDEX "patients_wristbandCode_key" ON "patients"("wristbandCode");

-- CreateIndex
CREATE UNIQUE INDEX "medications_barcode_key" ON "medications"("barcode");

-- CreateIndex
CREATE INDEX "administration_schedule_scheduledTime_status_idx" ON "administration_schedule"("scheduledTime", "status");

-- CreateIndex
CREATE UNIQUE INDEX "administration_logs_scheduleId_key" ON "administration_logs"("scheduleId");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_prescribedById_fkey" FOREIGN KEY ("prescribedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administration_schedule" ADD CONSTRAINT "administration_schedule_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administration_schedule" ADD CONSTRAINT "administration_schedule_assignedNurseId_fkey" FOREIGN KEY ("assignedNurseId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administration_logs" ADD CONSTRAINT "administration_logs_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "administration_schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administration_logs" ADD CONSTRAINT "administration_logs_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
