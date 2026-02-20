import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';
import { EncryptionService } from '../../common/security/encryption.service';
import { google, type Auth } from 'googleapis';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getAuthUrl(companyId: string): Promise<string> {
    const auth = this.createOAuthClient();
    return auth.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state: companyId,
      prompt: 'consent',
    });
  }

  async handleCallback(code: string, companyId: string): Promise<void> {
    const auth = this.createOAuthClient();
    const { tokens } = await auth.getToken(code);

    if (!tokens.refresh_token) {
      this.logger.warn(
        `No refresh token returned for company ${companyId}. Revoke access to get a new one.`,
      );
    }

    await this.saveCredentialsSafe(companyId, tokens);
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
    const rows = await this.supabase.query<{ encrypted_credentials: any }>(
      `SELECT encrypted_credentials FROM company_integrations
        WHERE company_id = $1 AND provider = 'GOOGLE_CALENDAR'`,
      [companyId],
    );

    if (rows.length === 0) {
      throw new Error('Google Calendar not connected');
    }

    const encrypted = rows[0].encrypted_credentials?.token as string | undefined;
    if (!encrypted) {
      throw new Error('Credenciales incompletas');
    }

    const decrypted = await this.encryptionService.decrypt(encrypted);
    const tokens = JSON.parse(decrypted);

    const auth = this.createOAuthClient();
    auth.setCredentials(tokens);
    return auth;
  }

  private async saveCredentialsSafe(
    companyId: string,
    tokens: Auth.OAuth2Client['credentials'],
  ): Promise<void> {
    const encrypted = await this.encryptionService.encrypt(
      JSON.stringify(tokens),
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
