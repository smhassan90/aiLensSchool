import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { TenantService } from './tenant.service';
import { AuthUser } from '../types/auth-user.type';

describe('TenantService', () => {
  const service = new TenantService();

  const superAdmin: AuthUser = {
    id: '1',
    email: 'sa@example.com',
    firstName: 'S',
    lastName: 'A',
    schoolId: null,
    roles: [RoleName.SUPER_ADMIN],
  };

  const schoolAdmin: AuthUser = {
    id: '2',
    email: 'admin@abcschool.com',
    firstName: 'A',
    lastName: 'B',
    schoolId: 'school-1',
    roles: [RoleName.SCHOOL_ADMIN],
  };

  it('allows super admin to access any school', () => {
    expect(() => service.assertSchoolAccess(superAdmin, 'school-1')).not.toThrow();
  });

  it('blocks cross-tenant school access', () => {
    expect(() => service.assertSchoolAccess(schoolAdmin, 'school-2')).toThrow(
      ForbiddenException,
    );
  });

  it('requireSchoolId returns tenant school for school admin', () => {
    expect(service.requireSchoolId(schoolAdmin)).toBe('school-1');
  });

  it('requireSchoolId rejects super admin without school context', () => {
    expect(() => service.requireSchoolId(superAdmin)).toThrow(ForbiddenException);
  });

  it('assertOwnedOrThrow enforces ownership and not-found', () => {
    expect(() => service.assertOwnedOrThrow(schoolAdmin, null)).toThrow(NotFoundException);
    expect(
      service.assertOwnedOrThrow(schoolAdmin, { schoolId: 'school-1', id: 'x' }),
    ).toEqual({ schoolId: 'school-1', id: 'x' });
    expect(() =>
      service.assertOwnedOrThrow(schoolAdmin, { schoolId: 'other', id: 'x' }),
    ).toThrow(ForbiddenException);
  });
});
