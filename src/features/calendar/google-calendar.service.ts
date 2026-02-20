import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';
import { EncryptionService } from '../../common/security/encryption.service';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private oauth2Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
    private readonly encryptionService: EncryptionService, // assuming we made this
  ) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GOOGLE_CALLBACK_URL'); // e.g. https://api.optus.ai/v1/oauth/google/callback

    if (clientId && clientSecret) {
      this.oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri,
      );
    } else {
      this.logger.warn('Google Credentials not found in environment');
    }
  }

  generateAuthUrl(companyId: string, userId: string): string {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth Client not initialized');
    }

    // Store companyId and userId in state for callback handling
    const state = JSON.stringify({ companyId, userId });

    // Scopes for Calendar
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // Crucial for receiving refresh_token
      scope: scopes,
      state: state,
      prompt: 'consent', // Force consent to get refresh_token
    });
  }

  async handleCallback(code: string, state: string) {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth Client not initialized');
    }

    let context: { companyId: string; userId: string };
    try {
      context = JSON.parse(state);
    } catch (error) {
      throw new UnauthorizedException('Invalid state parameter');
    }

    const { tokens } = await this.oauth2Client.getToken(code);

    // Encrypt tokens
    const credentials = JSON.stringify(tokens);
    const encryptedCredentials =
      await this.encryptionService.encrypt(credentials);

    // Save to company_integrations
    await this.supabaseService.query(
      `
      INSERT INTO company_integrations (company_id, provider, encrypted_credentials, is_active)
      VALUES ($1, 'GOOGLE_CALENDAR', $2, true)
      ON CONFLICT (company_id) WHERE provider = 'GOOGLE_CALENDAR' DO UPDATE
      SET encrypted_credentials = $2, is_active = true, updated_at = NOW()
      `,
      [context.companyId, JSON.stringify({ data: encryptedCredentials })],
    );

    return { success: true, companyId: context.companyId };
  }

  async getCalendarClient(companyId: string) {
    // 1. Fetch credentials
    const rows = await this.supabaseService.query(
      `SELECT encrypted_credentials FROM company_integrations 
         WHERE company_id = $1 AND provider = 'GOOGLE_CALENDAR' AND is_active = true`,
      [companyId],
    );

    if (rows.length === 0) return null;

    const encryptedData = rows[0].encrypted_credentials as any;
    // Assuming encryptedData is { data: "iv:content" } based on handleCallback
    if (!encryptedData?.data) {
      this.logger.error(`Invalid credentials format for company ${companyId}`);
      return null;
    }

    const credentialsStr = await this.encryptionService.decrypt(
      encryptedData.data,
    );
    const credentials = JSON.parse(credentialsStr);

    const updatedOauth2Client = new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      this.configService.get('GOOGLE_CALLBACK_URL'),
    );

    updatedOauth2Client.setCredentials(credentials);

    // Handle Token Refresh if needed (googleapis does it automatically if refresh_token is set)
    // We might want to listen to 'tokens' event to update DB, but for now relies on library.

    return google.calendar({ version: 'v3', auth: updatedOauth2Client });
  }
}
