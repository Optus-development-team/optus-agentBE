import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthTokenService } from './auth-token.service';
import type { AuthJwtPayload } from './types/auth-jwt.types';

export interface AuthenticatedRequest extends Request {
  auth?: AuthJwtPayload;
}

@Injectable()
export class CookieJwtAuthGuard implements CanActivate {
  private readonly cookieName = 'optus_auth';

  constructor(private readonly authTokenService: AuthTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromCookie(request.headers.cookie);

    if (!token) {
      throw new UnauthorizedException('Cookie de autenticación no encontrada');
    }

    request.auth = this.authTokenService.verifyToken(token);
    return true;
  }

  private extractTokenFromCookie(cookieHeader?: string): string | null {
    if (!cookieHeader) {
      return null;
    }

    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [name, ...rest] = cookie.trim().split('=');
      if (name === this.cookieName) {
        return decodeURIComponent(rest.join('='));
      }
    }

    return null;
  }
}
