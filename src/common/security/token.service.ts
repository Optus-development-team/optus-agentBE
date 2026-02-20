import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AccessTokenPayload {
  userId: string;
  suiAddress: string;
  issuedAt: number;
  expiresAt: number;
}

@Injectable()
export class TokenService {
  private readonly secret: string;
  private readonly ttlMs: number;

  constructor(private readonly configService: ConfigService) {
    this.secret =
      this.configService.get<string>('APP_JWT_SECRET') ||
      randomBytes(32).toString('hex');
    this.ttlMs = Number(
      this.configService.get<string>('APP_JWT_TTL_MS', '86400000'),
    );
  }

  issueToken(
    payload: Omit<AccessTokenPayload, 'issuedAt' | 'expiresAt'>,
  ): string {
    const issuedAt = Date.now();
    const expiresAt = issuedAt + this.ttlMs;
    const finalPayload: AccessTokenPayload = {
      ...payload,
      issuedAt,
      expiresAt,
    };

    const encodedPayload = Buffer.from(
      JSON.stringify(finalPayload),
      'utf8',
    ).toString('base64url');
    const signature = this.sign(encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  verifyToken(token: string): AccessTokenPayload {
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

  private sign(encodedPayload: string): string {
    return createHmac('sha256', this.secret)
      .update(encodedPayload)
      .digest('base64url');
  }

  private parsePayload(encodedPayload: string): AccessTokenPayload {
    try {
      const raw = Buffer.from(encodedPayload, 'base64url').toString('utf8');
      const parsed = JSON.parse(raw) as AccessTokenPayload;
      if (
        !parsed.userId ||
        !parsed.suiAddress ||
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
