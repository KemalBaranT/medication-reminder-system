import { Module } from '@nestjs/common';
import { MedicationsService } from './medications.service';
import { MedicationsController } from './medications.controller';

@Module({
  providers: [MedicationsService],
  controllers: [MedicationsController],
  exports: [MedicationsService],
})
export class MedicationsModule {}
