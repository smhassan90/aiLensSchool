import { PlannerAccessService } from './planner-access.service';

describe('PlannerAccessService.assertCanArchive', () => {
  const access = new PlannerAccessService({} as never, {} as never);

  const planner = {
    createdById: 'user-owner',
    teacherId: 'teacher-1',
    archivedAt: null as Date | null,
  };

  it('allows assigned teacher', () => {
    expect(() =>
      access.assertCanArchive(
        {
          userId: 'other',
          schoolId: 's1',
          isTeacher: true,
          isPrincipalOrAdmin: false,
          isHeadTeacher: false,
          teacherProfileId: 'teacher-1',
        },
        planner,
      ),
    ).not.toThrow();
  });

  it('denies unrelated teacher', () => {
    expect(() =>
      access.assertCanArchive(
        {
          userId: 'other',
          schoolId: 's1',
          isTeacher: true,
          isPrincipalOrAdmin: false,
          isHeadTeacher: false,
          teacherProfileId: 'teacher-2',
        },
        planner,
      ),
    ).toThrow();
  });
});
