import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { RoleName, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    refreshToken: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      refreshToken: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('access-token') };
    audit = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'JWT_ACCESS_EXPIRATION') return '15m';
              if (key === 'JWT_REFRESH_EXPIRATION') return '7d';
              return undefined;
            },
          },
        },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('logs in with valid credentials and returns tokens', async () => {
    const passwordHash = await bcrypt.hash('SuperAdmin123!', 4);
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'superadmin@example.com',
      username: 'superadmin',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      schoolId: null,
      mustChangePassword: false,
      status: UserStatus.ACTIVE,
      roles: [{ role: { name: RoleName.SUPER_ADMIN } }],
    });
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });
    prisma.user.update.mockResolvedValue({});

    const result = await service.login({
      email: 'superadmin@example.com',
      password: 'SuperAdmin123!',
    });

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBeDefined();
    expect(result.user.roles).toContain(RoleName.SUPER_ADMIN);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN', actorUserId: 'u1' }),
    );
  });

  it('logs in with generated parent username', async () => {
    const passwordHash = await bcrypt.hash('Parent123!', 4);
    prisma.user.findFirst.mockResolvedValue({
      id: 'p1',
      email: 'abc.f.stu001@abc.parent.local',
      username: 'abc.f.stu001',
      passwordHash,
      firstName: 'Imran',
      lastName: 'Ahmed',
      schoolId: 's1',
      mustChangePassword: true,
      status: UserStatus.ACTIVE,
      roles: [{ role: { name: RoleName.PARENT } }],
    });
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });
    prisma.user.update.mockResolvedValue({});

    const result = await service.login({
      username: 'abc.f.stu001',
      password: 'Parent123!',
      expectedRole: RoleName.PARENT,
    });

    expect(result.user.username).toBe('abc.f.stu001');
    expect(result.user.mustChangePassword).toBe(true);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ username: 'abc.f.stu001' }, { email: 'abc.f.stu001' }] },
      }),
    );
  });

  it('rejects invalid password', async () => {
    const passwordHash = await bcrypt.hash('correct', 4);
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      username: 'a',
      passwordHash,
      firstName: 'A',
      lastName: 'B',
      schoolId: null,
      mustChangePassword: false,
      status: UserStatus.ACTIVE,
      roles: [{ role: { name: RoleName.SUPER_ADMIN } }],
    });

    await expect(
      service.login({ email: 'a@b.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects refresh with unknown token', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    await expect(service.refresh('invalid-refresh-token-value')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
