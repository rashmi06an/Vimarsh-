import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashToken, randomToken } from '../common/crypto/hash.util';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Access tokens are short-lived JWTs. Refresh tokens are opaque random strings, stored
 * only as hashes, and ROTATED on every use. Re-using an already-rotated refresh token is
 * treated as theft: the entire token family is revoked and the attempt is audited.
 */
@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private async signAccess(user: User, familyId: string): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId ?? null,
      status: user.status,
      sid: familyId,
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<number>('jwt.accessTtl'),
    });
  }

  /** Issue a fresh access+refresh pair, opening a new refresh-token family (one per login/device). */
  async issuePair(user: User, deviceInfo?: string): Promise<TokenPair> {
    const familyId = randomToken(16);
    const refreshToken = randomToken(48);
    const refreshTtl = this.config.get<number>('jwt.refreshTtl') ?? 1209600;

    await this.prisma.session.create({
      data: {
        userId: user.id,
        deviceInfo: deviceInfo ?? null,
        refreshTokenHash: hashToken(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    const accessToken = await this.signAccess(user, familyId);
    return { accessToken, refreshToken, expiresIn: this.config.get<number>('jwt.accessTtl') ?? 900 };
  }

  /** Rotate a refresh token. Detects reuse of a revoked token and kills the whole family. */
  async rotate(refreshToken: string): Promise<TokenPair> {
    const incomingHash = hashToken(refreshToken);
    const active = await this.prisma.session.findFirst({
      where: { refreshTokenHash: incomingHash, revokedAt: { isSet: false } },
    });

    if (!active) {
      // Maybe this token was already rotated away -> reuse/theft. Revoke the family.
      const rotated = await this.prisma.session.findFirst({ where: { refreshTokenHash: incomingHash } });
      if (rotated) {
        await this.prisma.session.updateMany({
          where: { familyId: rotated.familyId, revokedAt: { isSet: false } },
          data: { revokedAt: new Date() },
        });
        await this.audit.log({
          actorId: rotated.userId,
          action: 'AUTH_REFRESH_REUSE_DETECTED',
          targetType: 'Session',
          targetId: rotated.familyId,
          metadata: { reason: 'Refresh token reuse — family revoked' },
        });
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (active.expiresAt.getTime() < Date.now()) {
      await this.prisma.session.update({ where: { id: active.id }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: active.userId } });
    if (!user) throw new UnauthorizedException('User no longer exists');
    if (user.status === 'SUSPENDED') throw new UnauthorizedException('Account suspended');

    const newRefresh = randomToken(48);
    const newHash = hashToken(newRefresh);
    const refreshTtl = this.config.get<number>('jwt.refreshTtl') ?? 1209600;

    // Revoke old, record what replaced it (for reuse detection), create the next in the family.
    await this.prisma.session.update({
      where: { id: active.id },
      data: { revokedAt: new Date(), replacedByHash: newHash },
    });
    await this.prisma.session.create({
      data: {
        userId: user.id,
        deviceInfo: active.deviceInfo,
        refreshTokenHash: newHash,
        familyId: active.familyId,
        rotatedFrom: active.id,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    const accessToken = await this.signAccess(user, active.familyId);
    return { accessToken, refreshToken: newRefresh, expiresIn: this.config.get<number>('jwt.accessTtl') ?? 900 };
  }

  /** Revoke a whole family (logout) by the sid carried in the access token. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: { isSet: false } },
      data: { revokedAt: new Date() },
    });
  }

  async revokeSessionById(userId: string, sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: { isSet: false } },
      data: { revokedAt: new Date() },
    });
  }
}
