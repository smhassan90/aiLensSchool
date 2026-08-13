import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleName } from '@prisma/client';
import { InsightsService } from './insights.service';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';

const admin: AuthUser = {
  id: 'u-admin',
  email: 'admin@abcschool.com',
  firstName: 'School',
  lastName: 'Admin',
  schoolId: 'school-1',
  roles: [RoleName.SCHOOL_ADMIN],
};

describe('InsightsService', () => {
  let service: InsightsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      student: { findMany: jest.fn(), findFirst: jest.fn() },
      parentProfile: { findMany: jest.fn(), findFirst: jest.fn() },
      teacherProfile: { findMany: jest.fn() },
      grade: { findMany: jest.fn(), findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightsService,
        { provide: PrismaService, useValue: prisma },
        TenantService,
      ],
    }).compile();

    service = module.get(InsightsService);
  });

  it('returns empty search results for short queries', async () => {
    const result = await service.search(admin, 'a');
    expect(result.students).toEqual([]);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('searches students, parents, teachers and classes', async () => {
    prisma.student.findMany.mockResolvedValue([
      {
        id: 's1',
        firstName: 'Ahmed',
        lastName: 'Imran',
        studentCode: 'STU-001',
        enrollments: [{ grade: { name: 'Grade 5' }, section: { name: 'A' } }],
      },
    ]);
    prisma.parentProfile.findMany.mockResolvedValue([]);
    prisma.teacherProfile.findMany.mockResolvedValue([]);
    prisma.grade.findMany.mockResolvedValue([]);

    const result = await service.search(admin, 'Ahmed');
    expect(result.students[0].name).toBe('Ahmed Imran');
    expect(result.students[0].className).toBe('Grade 5');
  });

  it('throws when student overview is missing', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    await expect(service.studentOverview('missing', admin)).rejects.toBeInstanceOf(NotFoundException);
  });
});
