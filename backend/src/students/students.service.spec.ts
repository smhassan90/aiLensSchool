import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleName } from '@prisma/client';
import { StudentsService } from './students.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { FilesService } from '../files/files.service';
import { MemoryCacheService } from '../common/services/memory-cache.service';
import { buildParentUsername, generateParentPassword } from './parent-accounts';
import { nextPrefixedSequentialIdentifier, nextSequentialIdentifier } from './student-sequences';

const admin: AuthUser = {
  id: 'u-admin',
  email: 'admin@abcschool.com',
  firstName: 'School',
  lastName: 'Admin',
  schoolId: 'school-1',
  roles: [RoleName.SCHOOL_ADMIN],
};

describe('parent account helpers', () => {
  it('builds username from school code and phone', () => {
    expect(buildParentUsername('TPS', '032123234543')).toBe('tps.032123234543');
    expect(buildParentUsername('ABC', '0300-1234567')).toBe('abc.03001234567');
  });

  it('adds a suffix when the username already exists', () => {
    expect(buildParentUsername('TPS', '032123234543', 2)).toBe('tps.032123234543.2');
  });

  it('uses the shared default parent password', () => {
    expect(generateParentPassword()).toBe('Password123');
  });

  it('picks the next sequential identifier from existing values', () => {
    expect(nextSequentialIdentifier([])).toBe('0001');
    expect(nextSequentialIdentifier(['0001', '0002', 'STU-0009'])).toBe('0010');
    expect(nextSequentialIdentifier(['ADM-42'])).toBe('0043');
  });

  it('builds prefixed teacher employee codes from school code', () => {
    expect(nextPrefixedSequentialIdentifier('tps', [])).toBe('TPS-0001');
    expect(nextPrefixedSequentialIdentifier('TPS', ['TPS-0001', 'TPS-0009'])).toBe('TPS-0010');
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
        { provide: FilesService, useValue: {} },
        { provide: MemoryCacheService, useValue: { invalidatePrefix: jest.fn() } },
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
