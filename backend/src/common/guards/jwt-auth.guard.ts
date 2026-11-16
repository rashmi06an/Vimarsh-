import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload, AuthedUser } from '../interfaces/jwt-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Authenticates every non-@Public route by verifying the access token.
 * Suspended accounts are rejected outright. The decoded identity is attached as req.user.
 *
 * INSTANT REVOCATION: a stateless JWT alone would stay valid until its TTL even after logout
 * or a password reset. To close that window, every authenticated request also verifies that the
 * token's session family (sid) still has an ACTIVE, unexpired Session row. Logout / password
 * reset / refresh-reuse all revoke those rows, so the access token is rejected on the very next
 * request. (One indexed lookup per request — Session has @@index([familyId]); for very high
 * throughput this check can be fronted by a Redis/session cache without changing the semantics.)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // WebSocket connections authenticate themselves in the gateway (handleConnection),
    // so this HTTP guard only applies to HTTP requests.
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }
    const token = header.slice(7);

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (payload.status === 'SUSPENDED') {
      throw new ForbiddenException('Account suspended');
    }

    // Instant revocation: the session family carried by the token must still be active.
    const activeSession = await this.prisma.session.findFirst({
      where: { familyId: payload.sid, revokedAt: { isSet: false }, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (!activeSession) {
      throw new UnauthorizedException('Session is no longer valid. Please sign in again.');
    }

    const user: AuthedUser = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      orgId: payload.orgId,
      status: payload.status,
      sessionId: payload.sid,
    };
    request.user = user;
    return true;
  }
}
