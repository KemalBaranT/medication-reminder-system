import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/**
 * Personel hesabi yonetimi ("Personel Yonetimi" modulu). Sistem erisimi
 * vermek veya geri almak, olagan klinik is akislarindan farkli, hassas bir
 * islem oldugundan, controller seviyesinde yalnizca admin ve basemsire
 * rolleriyle sinirlandirilmistir.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'head_nurse')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.usersService.create(dto, user.id);
  }

  @Get()
  findAll(@Query('role') role?: string) {
    return this.usersService.findAll(role);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return this.usersService.update(id, dto, user.id);
  }

  /** Isteyi yapan kisinin kendi id'si iletilir; boylece servis kendi kendini silmeyi engelleyebilir. */
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.remove(id, user.id);
  }
}
