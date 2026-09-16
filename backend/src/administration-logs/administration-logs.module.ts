import { Module } from '@nestjs/common';
import { AdministrationLogsService } from './administration-logs.service';
import { AdministrationLogsController } from './administration-logs.controller';

@Module({
  providers: [AdministrationLogsService],
  controllers: [AdministrationLogsController],
})
export class AdministrationLogsModule {}
