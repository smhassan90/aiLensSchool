import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { RoleName, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser } from '../../common/types/auth-user.type';

interface JwtPayload {
  sub: string;
  email: string;
  schoolId: string | null;
  roles: RoleName[];
}

const AUTH_CACHE_TTL_MS = 120_000;
const authCache = new Map<string, { user: AuthUser; expiresAt: number }>();

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const cached = authCache.get(payload.sub);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        schoolId: true,
        mustChangePassword: true,
        status: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      authCache.delete(payload.sub);
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid or inactive user',
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
      roles: payload.roles ?? [],
    };
    authCache.set(payload.sub, { user: authUser, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
    return authUser;
  }
}
