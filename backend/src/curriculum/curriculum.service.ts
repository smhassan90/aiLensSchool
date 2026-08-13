import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, paginate } from '../common/dto/pagination.dto';

@Injectable()
export class CurriculumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  async list(user: AuthUser, query: PaginationDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { schoolId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.curriculum.findMany({
        where,
        include: { subject: true, grade: true, chapters: { include: { topics: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.curriculum.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async findOne(id: string, user: AuthUser) {
    const curriculum = await this.prisma.curriculum.findUnique({
      where: { id },
      include: { chapters: { include: { topics: { include: { concepts: true } } } } },
    });
    if (!curriculum) {
      throw new NotFoundException({ code: 'CURRICULUM_NOT_FOUND', message: 'Curriculum not found' });
    }
    this.tenant.assertSchoolAccess(user, curriculum.schoolId);
    return curriculum;
  }
}
