import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleName } from '@prisma/client';
import { StudentsService } from './students.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { buildParentUsername, generateParentPassword } from './parent-accounts';

const admin: AuthUser = {
  id: 'u-admin',
  email: 'admin@abcschool.com',
  firstName: 'School',
  lastName: 'Admin',
  schoolId: 'school-1',
  roles: [RoleName.SCHOOL_ADMIN],
};

describe('parent account helpers', () => {
  it('builds distinct mother and father usernames', () => {
    expect(buildParentUsername('ABC', 'FATHER', 'STU-001')).toBe('abc.f.stu001');
    expect(buildParentUsername('ABC', 'MOTHER', 'STU-001')).toBe('abc.m.stu001');
  });

  it('generates an 8-character password without ambiguous characters', () => {
    const password = generateParentPassword();
    expect(password).toHaveLength(8);
    expect(password).toMatch(/^[A-Za-z0-9]+$/);
    expect(password).not.toMatch(/[IlO01]/);
  });
});

describe('StudentsService', () => {
  let service: StudentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn() } },
        TenantService,
      ],
    }).compile();
    service = module.get(StudentsService);
  });

  it('requires mother or father when creating a student', async () => {
    await expect(
      service.create(
        {
          firstName: 'Ahmed',
          lastName: 'Imran',
          studentCode: 'STU-010',
          admissionNumber: 'ADM-010',
          branchId: 'b1',
          gradeId: 'g1',
          sectionId: 's1',
          academicYearId: 'y1',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
