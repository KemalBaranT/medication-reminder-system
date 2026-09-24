-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "floor" TEXT;

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "nurseNote" TEXT;

-- CreateTable
CREATE TABLE "hospital_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "hospitalName" TEXT NOT NULL DEFAULT 'Ilac Takip Sistemi',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_settings_pkey" PRIMARY KEY ("id")
);
