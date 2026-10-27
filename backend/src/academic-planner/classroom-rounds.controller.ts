import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { ClassroomRoundsService } from './classroom-rounds.service';
import { CreateObservationDto } from './dto/classroom-rounds.dto';

@Controller({ path: 'classroom-rounds', version: '1' })
@Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER, RoleName.PRINCIPAL)
export class ClassroomRoundsController {
  constructor(private readonly rounds: ClassroomRoundsService) {}

  @Get('now')
  now(
    @CurrentUser() user: AuthUser,
    @Query('at') at?: string,
    @Query('sectionIds') sectionIds?: string,
  ) {
    return this.rounds.now(user, at, sectionIds);
  }

  @Post('observations')
  createObservation(@CurrentUser() user: AuthUser, @Body() dto: CreateObservationDto) {
    return this.rounds.createObservation(user, dto);
  }
}
