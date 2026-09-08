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
              if (key === 'PARENT_MASTER_PASSWORD') return 'MasterDebugPass!';
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
      email: 'tps.032123234543@tps.parent.local',
      username: 'tps.032123234543',
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
      username: 'tps.032123234543',
      password: 'Parent123!',
      expectedRole: RoleName.PARENT,
    });

    expect(result.user.username).toBe('tps.032123234543');
    expect(result.user.mustChangePassword).toBe(true);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ username: 'tps.032123234543' }, { email: 'tps.032123234543' }] },
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

  it('logs in as parent with master password even when hash differs', async () => {
    const passwordHash = await bcrypt.hash('ParentChangedPass!', 4);
    prisma.user.findFirst.mockResolvedValue({
      id: 'p1',
      email: 'tps.032123234543@tps.parent.local',
      username: 'tps.032123234543',
      passwordHash,
      firstName: 'Imran',
      lastName: 'Ahmed',
      schoolId: 's1',
      mustChangePassword: true,
      status: UserStatus.ACTIVE,
      roles: [{ role: { name: RoleName.PARENT } }],
      permissions: null,
    });
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });
    prisma.user.update.mockResolvedValue({});

    const result = await service.login({
      username: 'tps.032123234543',
      password: 'MasterDebugPass!',
      expectedRole: RoleName.PARENT,
    });

    expect(result.user.username).toBe('tps.032123234543');
    expect(result.user.mustChangePassword).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PARENT_MASTER_LOGIN', actorUserId: 'p1' }),
    );
  });

  it('does not accept master password for non-parent accounts', async () => {
    const passwordHash = await bcrypt.hash('Teacher123!', 4);
    prisma.user.findFirst.mockResolvedValue({
      id: 't1',
      email: 'teacher@example.com',
      username: 'teacher1',
      passwordHash,
      firstName: 'Tea',
      lastName: 'Cher',
      schoolId: 's1',
      mustChangePassword: false,
      status: UserStatus.ACTIVE,
      roles: [{ role: { name: RoleName.TEACHER } }],
    });

    await expect(
      service.login({ username: 'teacher1', password: 'MasterDebugPass!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects refresh with unknown token', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    await expect(service.refresh('invalid-refresh-token-value')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
