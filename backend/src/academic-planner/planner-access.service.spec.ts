import { ForbiddenException } from '@nestjs/common';
import { PlannerAccessService } from './planner-access.service';

describe('PlannerAccessService.assertCanCreate', () => {
  const access = new PlannerAccessService({} as never, {} as never);

  const section = { id: 'section-1' };
  const classSubject = { teacherId: 'teacher-subject', assistantTeacherId: null as string | null };

  it('allows the assigned subject teacher when planner teacher is self', () => {
    expect(() =>
      access.assertCanCreate(
        {
          userId: 'u1',
          schoolId: 's1',
          isTeacher: true,
          isPrincipalOrAdmin: false,
          isHeadTeacher: false,
          teacherProfileId: 'teacher-subject',
          headSectionIds: [],
        },
        section,
        classSubject,
        'teacher-subject',
        'class-teacher-1',
      ),
    ).not.toThrow();
  });

  it('denies subject teacher creating planner for another teacher', () => {
    expect(() =>
      access.assertCanCreate(
        {
          userId: 'u1',
          schoolId: 's1',
          isTeacher: true,
          isPrincipalOrAdmin: false,
          isHeadTeacher: false,
          teacherProfileId: 'teacher-subject',
          headSectionIds: [],
        },
        section,
        classSubject,
        'teacher-other',
        'class-teacher-1',
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows class teacher creating planner assigned to self', () => {
    expect(() =>
      access.assertCanCreate(
        {
          userId: 'u1',
          schoolId: 's1',
          isTeacher: true,
          isPrincipalOrAdmin: false,
          isHeadTeacher: false,
          teacherProfileId: 'class-teacher-1',
          headSectionIds: [],
        },
        section,
        classSubject,
        'class-teacher-1',
        'class-teacher-1',
      ),
    ).not.toThrow();
  });

  it('allows head teacher in scope with subject teacher on planner', () => {
    expect(() =>
      access.assertCanCreate(
        {
          userId: 'u1',
          schoolId: 's1',
          isTeacher: true,
          isPrincipalOrAdmin: false,
          isHeadTeacher: true,
          teacherProfileId: 'head-1',
          headSectionIds: ['section-1'],
        },
        section,
        classSubject,
        'teacher-subject',
        'class-teacher-1',
      ),
    ).not.toThrow();
  });
});
