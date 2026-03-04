import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';
import { EncryptionService } from '../../common/security/encryption.service';
import { google, type Auth } from 'googleapis';
import type { AuthenticatedCompanyUser } from './types/auth-jwt.types';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly encryptionService: EncryptionService,
  ) {}

  getLoginAuthUrl(): string {
    const auth = this.createOAuthClient();
    return auth.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      prompt: 'consent',
      state: 'login',
    });
  }

  getAuthUrl(companyId: string): string {
    const auth = this.createOAuthClient();
    return auth.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/calendar',
      ],
      state: `calendar:${companyId}`,
      prompt: 'consent',
    });
  }

  async handleGoogleLoginCallback(
    code: string,
    state?: string,
  ): Promise<AuthenticatedCompanyUser> {
    const auth = this.createOAuthClient();
    const { tokens } = await auth.getToken(code);
    auth.setCredentials(tokens);

    const oauth2Api = google.oauth2({ version: 'v2', auth });
    const { data } = await oauth2Api.userinfo.get();
    const email = data.email?.trim().toLowerCase();

    if (!email) {
      throw new Error('Google no devolvió un correo válido');
    }

    const user = await this.findCompanyUserByEmail(email);
    if (!user) {
      throw new Error(
        `No existe un usuario/empresa asociada para el correo ${email}`,
      );
    }

    const expectedCompanyId = this.extractCalendarCompanyId(state);
    if (expectedCompanyId && expectedCompanyId !== user.companyId) {
      throw new Error('La empresa autenticada no coincide con el estado OAuth');
    }

    await this.supabase.query(
      `UPDATE company_users
          SET auth_provider = 'GOOGLE',
              oauth_sub = $2,
              oauth_aud = $3,
              email = COALESCE(email, $1),
              last_login_at = timezone('utc', now())
        WHERE id = $4`,
      [
        email,
        data.id ?? null,
        this.extractAudienceFromIdToken(tokens.id_token) ??
          this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID') ??
          null,
        user.userId,
      ],
    );

    await this.supabase.query(
      `UPDATE companies SET updated_at = timezone('utc', now()) WHERE id = $1`,
      [user.companyId],
    );

    if (expectedCompanyId) {
      await this.saveCredentialsSafe(user.companyId, tokens);
    }

    return {
      userId: user.userId,
      companyId: user.companyId,
      role: user.role,
      email,
    };
  }

  async handleCallback(code: string, companyId: string): Promise<void> {
    await this.handleGoogleLoginCallback(code, `calendar:${companyId}`);
  }

  async checkCredentials(companyId: string): Promise<boolean> {
    const rows = await this.supabase.query(
      `SELECT id FROM company_integrations
        WHERE company_id = $1 AND provider = 'GOOGLE_CALENDAR' AND is_active = true`,
      [companyId],
    );

    return rows.length > 0;
  }

  async getClient(companyId: string): Promise<Auth.OAuth2Client> {
    const rows = await this.supabase.query<{
      encrypted_credentials: { token?: string } | null;
    }>(
      `SELECT encrypted_credentials FROM company_integrations
        WHERE company_id = $1 AND provider = 'GOOGLE_CALENDAR'`,
      [companyId],
    );

    if (rows.length === 0) {
      throw new Error('Google Calendar not connected');
    }

    const encrypted = rows[0].encrypted_credentials?.token;
    if (!encrypted) {
      throw new Error('Credenciales incompletas');
    }

    const decrypted = await this.encryptionService.decrypt(encrypted);
    const tokens = JSON.parse(decrypted) as Auth.OAuth2Client['credentials'];

    const auth = this.createOAuthClient();
    auth.setCredentials(tokens);
    return auth;
  }

  private async saveCredentialsSafe(
    companyId: string,
    tokens: Auth.OAuth2Client['credentials'],
  ): Promise<void> {
    if (!tokens.refresh_token) {
      this.logger.warn(
        `No refresh token returned for company ${companyId}. Se preservará el refresh token anterior si existe.`,
      );
    }

    const existingCredentials = await this.loadStoredTokens(companyId);
    const finalTokens: Auth.OAuth2Client['credentials'] = {
      ...existingCredentials,
      ...tokens,
      refresh_token: tokens.refresh_token ?? existingCredentials?.refresh_token,
    };

    const encrypted = await this.encryptionService.encrypt(
      JSON.stringify(finalTokens),
    );
    const credentialsJson = { token: encrypted };

    const existing = await this.supabase.query<{ id: string }>(
      `SELECT id FROM company_integrations WHERE company_id = $1 AND provider = 'GOOGLE_CALENDAR'`,
      [companyId],
    );

    if (existing.length > 0) {
      await this.supabase.query(
        `UPDATE company_integrations SET encrypted_credentials = $2, is_active = true, updated_at = now() WHERE id = $1`,
        [existing[0].id, credentialsJson],
      );
    } else {
      await this.supabase.query(
        `INSERT INTO company_integrations (company_id, provider, encrypted_credentials) VALUES ($1, 'GOOGLE_CALENDAR', $2)`,
        [companyId, credentialsJson],
      );
    }
  }

  private async findCompanyUserByEmail(email: string): Promise<{
    userId: string;
    companyId: string;
    role: string;
  } | null> {
    const rows = await this.supabase.query<{
      user_id: string;
      company_id: string;
      role: string | null;
    }>(
      `SELECT cu.id AS user_id,
              cu.company_id,
              cu.role
         FROM company_users cu
         INNER JOIN companies c ON c.id = cu.company_id
        WHERE LOWER(cu.email) = LOWER($1)
        ORDER BY CASE
          WHEN UPPER(COALESCE(cu.role, '')) IN ('OWNER', 'ADMIN', 'ROLE_ADMIN') THEN 0
          ELSE 1
        END,
        cu.updated_at DESC NULLS LAST
        LIMIT 1`,
      [email],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      userId: row.user_id,
      companyId: row.company_id,
      role: row.role ?? 'CLIENT',
    };
  }

  private extractCalendarCompanyId(state?: string): string | undefined {
    if (!state?.startsWith('calendar:')) {
      return undefined;
    }
    return state.slice('calendar:'.length);
  }

  private extractAudienceFromIdToken(
    idToken?: string | null,
  ): string | undefined {
    if (!idToken) {
      return undefined;
    }

    try {
      const [, payload] = idToken.split('.');
      if (!payload) {
        return undefined;
      }

      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { aud?: string };

      return decoded.aud;
    } catch (error) {
      this.logger.warn(
        `No se pudo decodificar aud de id_token: ${(error as Error).message}`,
      );
      return undefined;
    }
  }

  private async loadStoredTokens(
    companyId: string,
  ): Promise<Auth.OAuth2Client['credentials'] | null> {
    const rows = await this.supabase.query<{ encrypted_credentials: unknown }>(
      `SELECT encrypted_credentials
         FROM company_integrations
        WHERE company_id = $1 AND provider = 'GOOGLE_CALENDAR'
        LIMIT 1`,
      [companyId],
    );

    const encrypted = (
      rows[0]?.encrypted_credentials as { token?: string } | undefined
    )?.token;

    if (!encrypted) {
      return null;
    }

    try {
      const decrypted = await this.encryptionService.decrypt(encrypted);
      return JSON.parse(decrypted) as Auth.OAuth2Client['credentials'];
    } catch (error) {
      this.logger.warn(
        `No se pudieron leer credenciales previas de ${companyId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private createOAuthClient(): Auth.OAuth2Client {
    return new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_OAUTH_CLIENT_SECRET'),
      this.getCallbackUrl(),
    );
  }

  private getCallbackUrl(): string {
    const baseUrl =
      this.configService.get<string>('MAIN_PAGE_URL') ||
      'http://localhost:3000';

    return `${baseUrl.replace(/\/$/, '')}/v1/auth/google/callback`;
  }
}
