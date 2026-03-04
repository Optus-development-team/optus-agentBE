import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthTokenService } from './auth-token.service';
import type { AuthJwtPayload } from './types/auth-jwt.types';

export interface FullAuthenticatedRequest extends Request {
  auth?: AuthJwtPayload;
}

@Injectable()
export class FullCookieJwtAuthGuard implements CanActivate {
  private readonly cookieName = 'optus_auth';

  constructor(private readonly authTokenService: AuthTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<FullAuthenticatedRequest>();
    const token = this.extractTokenFromCookie(request.headers.cookie);

    if (!token) {
      throw new UnauthorizedException('Cookie de autenticación no encontrada');
    }

    const auth = this.authTokenService.verifyToken(token);
    if (auth.authState !== 'FULL' || !auth.phoneVerified) {
      throw new UnauthorizedException('Se requiere una sesión completa');
    }

    request.auth = auth;
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
