import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';
import { TokenService } from '../../common/security/token.service';
import { VerificationService } from '../login/verification.service';
import type { LoginRequestDto } from './dto/auth.dto';

interface JwtClaims {
  sub?: string;
  aud?: string | string[];
  iss?: string;
  email?: string;
  name?: string;
}

export type AuthProvider = 'GOOGLE' | 'FACEBOOK' | 'APPLE';

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly tokens: TokenService,
    private readonly verification: VerificationService,
    private readonly configService: ConfigService,
  ) {}

  async getSalt(params: {
    jwt: string;
    provider?: string;
  }): Promise<{ exists: boolean; salt: string | null }> {
    const claims = this.decodeJwt(params.jwt);
    const provider = this.resolveProvider(params.provider, claims.iss);
    const aud = this.normalizeAud(claims.aud);
    const sub = claims.sub;

    if (!sub || !aud) {
      throw new BadRequestException('JWT faltante de sub o aud');
    }

    const existing = await this.findUser({ provider, sub, aud });
    if (!existing) {
      return { exists: false, salt: null };
    }

    return { exists: true, salt: existing.user_salt };
  }

  async login(
    body: LoginRequestDto,
    providerHeader?: string,
  ): Promise<{
    accessToken: string;
    user: {
      id: string;
      suiAddress: string;
      phoneVerified: boolean;
      status: string;
    };
  }> {
    const claims = this.decodeJwt(body.jwt);
    const provider = this.resolveProvider(providerHeader, claims.iss);
    const aud = this.normalizeAud(claims.aud);
    const sub = claims.sub;

    if (!sub || !aud) {
      throw new BadRequestException('JWT faltante de sub o aud');
    }

    const existing = await this.findUser({ provider, sub, aud });

    if (existing) {
      if (existing.user_salt !== body.salt) {
        throw new BadRequestException(
          'Salt no coincide con el usuario existente',
        );
      }

      await this.supabase.query(
        `update company_users set last_login_at = timezone('utc', now()), alias = coalesce($1, alias), sui_address = $2 where id = $3`,
        [body.alias ?? null, body.suiAddress, existing.id],
      );

      const accessToken = this.tokens.issueToken({
        userId: existing.id,
        suiAddress: existing.sui_address,
      });
      return {
        accessToken,
        user: {
          id: existing.id,
          suiAddress: existing.sui_address,
          phoneVerified: Boolean(existing.is_phone_verified),
          status: existing.is_phone_verified ? 'ACTIVE' : 'PENDING_PHONE',
        },
      };
    }

    const created = await this.createUser({
      provider,
      sub,
      aud,
      salt: body.salt,
      suiAddress: body.suiAddress,
      email: claims.email,
      alias: body.alias ?? claims.name ?? undefined,
    });

    const accessToken = this.tokens.issueToken({
      userId: created.id,
      suiAddress: created.sui_address,
    });
    return {
      accessToken,
      user: {
        id: created.id,
        suiAddress: created.sui_address,
        phoneVerified: false,
        status: 'PENDING_PHONE',
      },
    };
  }

  async markPhoneVerified(userId: string, phone: string): Promise<void> {
    const normalizedPhone = phone.replace(/\D/g, '');
    await this.supabase.query(
      'update company_users set phone = $1, is_phone_verified = true where id = $2',
      [normalizedPhone, userId],
    );
    await this.verification.markPhoneVerified(normalizedPhone);
  }

  async setUserPhonePending(userId: string, phone: string): Promise<void> {
    const normalizedPhone = phone.replace(/\D/g, '');
    await this.supabase.query(
      'update company_users set phone = $1, is_phone_verified = false where id = $2',
      [normalizedPhone, userId],
    );
  }

  private async findUser(params: {
    provider: AuthProvider;
    sub: string;
    aud: string;
  }): Promise<{
    id: string;
    user_salt: string;
    sui_address: string;
    is_phone_verified: boolean;
  } | null> {
    const rows = await this.supabase.query<{
      id: string;
      user_salt: string;
      sui_address: string;
      is_phone_verified: boolean;
    }>(
      `select id, user_salt, sui_address, is_phone_verified
       from company_users
       where auth_provider = $1 and oauth_sub = $2 and oauth_aud = $3
       limit 1`,
      [params.provider, params.sub, params.aud],
    );

    return rows[0] ?? null;
  }

  private async createUser(params: {
    provider: AuthProvider;
    sub: string;
    aud: string;
    salt: string;
    suiAddress: string;
    email?: string;
    alias?: string;
  }): Promise<{
    id: string;
    sui_address: string;
  }> {
    const companyId = this.configService.get<string>('DEFAULT_COMPANY_ID');
    if (!companyId) {
      throw new UnauthorizedException(
        'Falta DEFAULT_COMPANY_ID para registrar usuario',
      );
    }

    const rows = await this.supabase.query<{
      id: string;
      sui_address: string;
    }>(
      `insert into company_users (
         company_id, user_salt, auth_provider, oauth_sub, oauth_aud, sui_address, email, alias, created_at, last_login_at, is_phone_verified, role
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, timezone('utc', now()), timezone('utc', now()), false, 'CLIENT')
       returning id, sui_address`,
      [
        companyId,
        params.salt,
        params.provider,
        params.sub,
        params.aud,
        params.suiAddress,
        params.email ?? null,
        params.alias ?? null,
      ],
    );

    const row = rows[0];
    if (!row) {
      throw new UnauthorizedException('No se pudo crear el usuario');
    }

    return row;
  }

  private decodeJwt(jwt: string): JwtClaims {
    const segments = jwt.split('.');
    if (segments.length < 2) {
      throw new BadRequestException('JWT inválido');
    }
    try {
      const payload = JSON.parse(
        Buffer.from(segments[1], 'base64').toString('utf8'),
      ) as JwtClaims;
      return payload;
    } catch (error) {
      throw new BadRequestException(
        `No se pudo decodificar el JWT: ${(error as Error).message}`,
      );
    }
  }

  private resolveProvider(
    headerProvider?: string,
    issuer?: string,
  ): AuthProvider {
    const normalized = headerProvider?.toUpperCase();
    if (
      normalized === 'GOOGLE' ||
      normalized === 'FACEBOOK' ||
      normalized === 'APPLE'
    ) {
      return normalized;
    }

    if (issuer?.includes('google')) return 'GOOGLE';
    if (issuer?.includes('facebook')) return 'FACEBOOK';
    if (issuer?.includes('apple')) return 'APPLE';

    return 'GOOGLE';
  }

  private normalizeAud(aud?: string | string[]): string | null {
    if (Array.isArray(aud)) return aud[0] ?? null;
    return aud ?? null;
  }
}
