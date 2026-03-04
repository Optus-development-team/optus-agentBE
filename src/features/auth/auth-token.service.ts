import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthJwtPayload,
  AuthenticatedCompanyUser,
} from './types/auth-jwt.types';

@Injectable()
export class AuthTokenService {
  private readonly secret: string;
  private readonly ttlMs: number;

  constructor(private readonly configService: ConfigService) {
    this.secret =
      this.configService.get<string>('AUTH_JWT_SECRET') ||
      this.configService.get<string>('APP_JWT_SECRET') ||
      randomBytes(32).toString('hex');

    this.ttlMs = Number(
      this.configService.get<string>('AUTH_JWT_TTL_MS', '43200000'),
    );
  }

  issueToken(user: AuthenticatedCompanyUser): string {
    const issuedAt = Date.now();
    const expiresAt = issuedAt + this.ttlMs;

    const payload: AuthJwtPayload = {
      userId: user.userId,
      companyId: user.companyId,
      role: user.role,
      email: user.email,
      issuedAt,
      expiresAt,
    };

    const encodedPayload = Buffer.from(
      JSON.stringify(payload),
      'utf8',
    ).toString('base64url');

    const signature = this.sign(encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  verifyToken(token: string): AuthJwtPayload {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Token inválido');
    }

    const expectedSignature = this.sign(encodedPayload);
    if (expectedSignature !== signature) {
      throw new UnauthorizedException('Firma inválida');
    }

    const payload = this.parsePayload(encodedPayload);
    if (payload.expiresAt < Date.now()) {
      throw new UnauthorizedException('Token expirado');
    }

    return payload;
  }

  getTtlMs(): number {
    return this.ttlMs;
  }

  private sign(encodedPayload: string): string {
    return createHmac('sha256', this.secret)
      .update(encodedPayload)
      .digest('base64url');
  }

  private parsePayload(encodedPayload: string): AuthJwtPayload {
    try {
      const raw = Buffer.from(encodedPayload, 'base64url').toString('utf8');
      const parsed = JSON.parse(raw) as AuthJwtPayload;

      if (
        !parsed.userId ||
        !parsed.companyId ||
        !parsed.role ||
        !parsed.email ||
        !parsed.issuedAt ||
        !parsed.expiresAt
      ) {
        throw new Error('payload incompleto');
      }

      return parsed;
    } catch (error) {
      throw new UnauthorizedException(
        `Token inválido: ${(error as Error).message}`,
      );
    }
  }
}
