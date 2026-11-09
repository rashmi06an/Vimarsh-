import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedUser } from '../interfaces/jwt-payload.interface';

/** Injects the authenticated user (set by JwtAuthGuard) into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthedUser;
  },
);
