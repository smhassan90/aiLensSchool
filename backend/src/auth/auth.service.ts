import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { RoleName, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { AuthUser } from '../common/types/auth-user.type';
import { parsePermissions } from '../common/permissions';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    const identifier = (dto.username ?? dto.email ?? '').trim().toLowerCase();
    if (!identifier) {
      throw new BadRequestException({
        code: 'IDENTIFIER_REQUIRED',
        message: 'Username or email is required',
      });
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
      include: { roles: { include: { role: true } } },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      });
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      });
    }

    const roles = user.roles.map((r) => r.role.name);
    if (dto.expectedRole && !roles.includes(dto.expectedRole)) {
      throw new UnauthorizedException({
        code: 'ROLE_NOT_ALLOWED',
        message: `This account cannot login as ${dto.expectedRole}`,
      });
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      schoolId: user.schoolId,
      mustChangePassword: user.mustChangePassword,
      roles,
      permissions: parsePermissions(user.permissions),
    };

    const tokens = await this.issueTokens(authUser, meta);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId: user.schoolId,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta?.ip,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        schoolId: user.schoolId,
        mustChangePassword: user.mustChangePassword,
        roles,
        permissions: parsePermissions(user.permissions),
      },
      ...tokens,
    };
  }

  async refresh(refreshToken: string, meta?: { ip?: string; userAgent?: string }) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: {
        user: { include: { roles: { include: { role: true } } } },
      },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      });
    }

    if (stored.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'USER_INACTIVE',
        message: 'User account is inactive',
      });
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const roles = stored.user.roles.map((r) => r.role.name);
    const authUser: AuthUser = {
      id: stored.user.id,
      email: stored.user.email,
      firstName: stored.user.firstName,
      lastName: stored.user.lastName,
      schoolId: stored.user.schoolId,
      roles,
      permissions: parsePermissions(stored.user.permissions),
    };

    const tokens = await this.issueTokens(authUser, meta);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { replacedBy: tokens.refreshTokenId },
    });

    return tokens;
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.log({
      actorUserId: userId,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: userId,
    });

    return { message: 'Logged out' };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        teacherProfile: true,
        parentProfile: true,
        school: { select: { id: true, name: true, code: true, status: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      schoolId: user.schoolId,
      mustChangePassword: user.mustChangePassword,
      school: user.school,
      roles: user.roles.map((r) => r.role.name),
      permissions: parsePermissions(user.permissions),
      teacherProfile: user.teacherProfile,
      parentProfile: user.parentProfile,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Current password is incorrect',
      });
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException({
        code: 'PASSWORD_UNCHANGED',
        message: 'New password must be different from the current password',
      });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 12),
        mustChangePassword: false,
      },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      actorUserId: userId,
      schoolId: user.schoolId,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: userId,
    });
    return { message: 'Password updated. Sign in again with the new password.' };
  }

  async forgotPassword(email: string) {
    // Token issuance for email reset can be wired to a mail provider later.
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return { message: 'If the email exists, a reset link will be sent' };
    }
    return { message: 'If the email exists, a reset link will be sent' };
  }

  async resetPassword(_token: string, _newPassword: string) {
    throw new BadRequestException({
      code: 'NOT_CONFIGURED',
      message: 'Password reset email flow requires mail provider configuration',
    });
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  private async issueTokens(
    user: AuthUser,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const payload = {
      sub: user.id,
      email: user.email,
      schoolId: user.schoolId,
      roles: user.roles,
      permissions: user.permissions ?? [],
    };

    const accessToken = await this.jwt.signAsync(payload);
    const rawRefresh = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawRefresh);
    const refreshDays = this.parseDurationDays(
      this.config.get<string>('JWT_REFRESH_EXPIRATION') ?? '7d',
    );
    const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    const stored = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      refreshTokenId: stored.id,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRATION') ?? '15m',
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseDurationDays(value: string): number {
    const match = /^(\d+)([dhms])$/.exec(value);
    if (!match) return 7;
    const amount = Number(match[1]);
    const unit = match[2];
    if (unit === 'd') return amount;
    if (unit === 'h') return amount / 24;
    if (unit === 'm') return amount / (24 * 60);
    return amount / (24 * 60 * 60);
  }
}
