import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EnrollmentStatus, RoleName } from '@prisma/client';
import { AcademicsService } from './academics.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
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

describe('AcademicsService', () => {
  let service: AcademicsService;
  let prisma: {
    $transaction: jest.Mock;
    branch: { findFirst: jest.Mock };
    grade: { create: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock };
    section: { create: jest.Mock; findFirst: jest.Mock };
    academicYear: { findFirst: jest.Mock };
    student: { findFirst: jest.Mock };
    studentEnrollment: { findFirst: jest.Mock; create: jest.Mock; count: jest.Mock };
    subject: { findFirst: jest.Mock };
    teacherProfile: { findMany: jest.Mock };
    classSubject: { upsert: jest.Mock };
  };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
        }
        return Promise.all(arg as Promise<unknown>[]);
      }),
      branch: { findFirst: jest.fn() },
      grade: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
      section: { create: jest.fn(), findFirst: jest.fn() },
      academicYear: { findFirst: jest.fn() },
      student: { findFirst: jest.fn() },
      studentEnrollment: { findFirst: jest.fn(), create: jest.fn(), count: jest.fn() },
      subject: { findFirst: jest.fn() },
      teacherProfile: { findMany: jest.fn() },
      classSubject: { upsert: jest.fn() },
    };
    audit = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcademicsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        TenantService,
      ],
    }).compile();

    service = module.get(AcademicsService);
  });

  it('creates a class with a default section for single-section schools', async () => {
    prisma.branch.findFirst.mockResolvedValue({ id: 'branch-1', schoolId: 'school-1' });
    prisma.grade.create.mockResolvedValue({ id: 'grade-1', name: 'Class 1', level: 1 });
    prisma.section.create.mockResolvedValue({ id: 'sec-1', name: 'A' });
    prisma.grade.findUnique.mockResolvedValue({
      id: 'grade-1',
      name: 'Class 1',
      sections: [{ id: 'sec-1', name: 'A' }],
      _count: { sections: 1, enrollments: 0 },
    });

    const result = await service.createGrade(
      {
        name: 'Class 1',
        level: 1,
        createDefaultSection: true,
        branchId: 'branch-1',
      },
      admin,
    );

    expect(prisma.section.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gradeId: 'grade-1',
        branchId: 'branch-1',
        name: 'A',
      }),
    });
    expect(result).toEqual(expect.objectContaining({ id: 'grade-1' }));
  });

  it('requires a branch when creating the default section', async () => {
    await expect(
      service.createGrade({ name: 'Class 1', level: 1, createDefaultSection: true }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assigns a primary teacher and assistant', async () => {
    prisma.section.findFirst.mockResolvedValue({ id: 'sec-1', schoolId: 'school-1' });
    prisma.subject.findFirst.mockResolvedValue({ id: 'sub-1', schoolId: 'school-1' });
    prisma.teacherProfile.findMany.mockResolvedValue([{ id: 't-1' }, { id: 't-2' }]);
    prisma.classSubject.upsert.mockResolvedValue({
      id: 'cs-1',
      teacherId: 't-1',
      assistantTeacherId: 't-2',
    });

    const result = await service.assignClassSubject(
      {
        sectionId: 'sec-1',
        subjectId: 'sub-1',
        academicYearId: 'year-1',
        branchId: 'branch-1',
        teacherId: 't-1',
        assistantTeacherId: 't-2',
      },
      admin,
    );

    expect(prisma.classSubject.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ teacherId: 't-1', assistantTeacherId: 't-2' }),
        update: expect.objectContaining({ teacherId: 't-1', assistantTeacherId: 't-2' }),
      }),
    );
    expect(result.assistantTeacherId).toBe('t-2');
  });

  it('rejects using the same person as teacher and assistant', async () => {
    prisma.section.findFirst.mockResolvedValue({ id: 'sec-1', schoolId: 'school-1' });
    prisma.subject.findFirst.mockResolvedValue({ id: 'sub-1', schoolId: 'school-1' });

    await expect(
      service.assignClassSubject(
        {
          sectionId: 'sec-1',
          subjectId: 'sub-1',
          academicYearId: 'year-1',
          branchId: 'branch-1',
          teacherId: 't-1',
          assistantTeacherId: 't-1',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enrolls a student into a class section', async () => {
    prisma.student.findFirst.mockResolvedValue({ id: 'st-1', schoolId: 'school-1' });
    prisma.grade.findFirst.mockResolvedValue({ id: 'grade-1', schoolId: 'school-1' });
    prisma.section.findFirst.mockResolvedValue({
      id: 'sec-1',
      schoolId: 'school-1',
      gradeId: 'grade-1',
      capacity: 30,
    });
    prisma.academicYear.findFirst.mockResolvedValue({ id: 'year-1', schoolId: 'school-1' });
    prisma.studentEnrollment.findFirst.mockResolvedValue(null);
    prisma.studentEnrollment.count.mockResolvedValue(2);
    prisma.studentEnrollment.create.mockResolvedValue({
      id: 'en-1',
      status: EnrollmentStatus.ACTIVE,
    });

    const result = await service.createEnrollment(
      {
        studentId: 'st-1',
        academicYearId: 'year-1',
        gradeId: 'grade-1',
        sectionId: 'sec-1',
      },
      admin,
    );

    expect(result.id).toBe('en-1');
  });

  it('rejects enrollment when the section is not in the class', async () => {
    prisma.student.findFirst.mockResolvedValue({ id: 'st-1', schoolId: 'school-1' });
    prisma.grade.findFirst.mockResolvedValue({ id: 'grade-1', schoolId: 'school-1' });
    prisma.section.findFirst.mockResolvedValue({
      id: 'sec-1',
      schoolId: 'school-1',
      gradeId: 'other-grade',
    });
    prisma.academicYear.findFirst.mockResolvedValue({ id: 'year-1', schoolId: 'school-1' });

    await expect(
      service.createEnrollment(
        {
          studentId: 'st-1',
          academicYearId: 'year-1',
          gradeId: 'grade-1',
          sectionId: 'sec-1',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a second active enrollment in the same year', async () => {
    prisma.student.findFirst.mockResolvedValue({ id: 'st-1', schoolId: 'school-1' });
    prisma.grade.findFirst.mockResolvedValue({ id: 'grade-1', schoolId: 'school-1' });
    prisma.section.findFirst.mockResolvedValue({
      id: 'sec-1',
      schoolId: 'school-1',
      gradeId: 'grade-1',
    });
    prisma.academicYear.findFirst.mockResolvedValue({ id: 'year-1', schoolId: 'school-1' });
    prisma.studentEnrollment.findFirst.mockResolvedValue({ id: 'en-existing' });

    await expect(
      service.createEnrollment(
        {
          studentId: 'st-1',
          academicYearId: 'year-1',
          gradeId: 'grade-1',
          sectionId: 'sec-1',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns not found for a missing class', async () => {
    prisma.grade.findFirst.mockResolvedValue(null);
    await expect(service.getGrade('missing', admin)).rejects.toBeInstanceOf(NotFoundException);
  });
});
