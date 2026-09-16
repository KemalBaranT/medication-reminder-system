import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AdministrationLogsService } from './administration-logs.service';
import { CreateLogDto } from './dto/create-log.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('administration-logs')
export class AdministrationLogsController {
  constructor(private logsService: AdministrationLogsService) {}

  @Post()
  @Roles('nurse')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLogDto) {
    return this.logsService.create(user.id, dto);
  }
}
