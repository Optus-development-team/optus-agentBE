import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import { EncryptionService } from '../encryption/encryption.service';

interface IntegrationRow {
  encrypted_credentials: unknown;
  is_active: boolean;
  needs_2fa_attention: boolean;
}

@Injectable()
export class CompanyIntegrationsService {
  private readonly logger = new Logger(CompanyIntegrationsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getGoogleCalendarCredentials(
    companyId: string,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.fetchIntegration(companyId, 'GOOGLE_CALENDAR');
    if (!row || !row.is_active) {
      return null;
    }
    return this.encryptionService.decrypt<Record<string, unknown>>(
      row.encrypted_credentials,
    );
  }

  async hasGoogleCalendar(companyId: string): Promise<boolean> {
    const row = await this.fetchIntegration(companyId, 'GOOGLE_CALENDAR');
    return Boolean(row?.is_active);
  }

  async upsertGoogleCalendar(
    companyId: string,
    credentials: Record<string, unknown>,
  ): Promise<void> {
    if (!this.supabase.isEnabled()) {
      this.logger.warn('Supabase no disponible; no se puede guardar OAuth.');
      return;
    }

    const encrypted = this.encryptionService.encrypt(credentials);
    await this.supabase.query(
      `INSERT INTO public.company_integrations (company_id, provider, encrypted_credentials, is_active, needs_2fa_attention, updated_at)
       VALUES ($1, 'GOOGLE_CALENDAR', $2::jsonb, true, false, now())
       ON CONFLICT (company_id, provider)
       DO UPDATE SET encrypted_credentials = EXCLUDED.encrypted_credentials, is_active = true, needs_2fa_attention = false, updated_at = now()`,
      [companyId, JSON.stringify(encrypted)],
    );
  }

  async markTwoFactorAttention(companyId: string, flag: boolean): Promise<void> {
    if (!this.supabase.isEnabled()) {
      return;
    }

    await this.supabase.query(
      `INSERT INTO public.company_integrations (company_id, provider, encrypted_credentials, is_active, needs_2fa_attention, updated_at)
       VALUES ($1, 'BANK_ECOFUTURO', '{}'::jsonb, false, $2, now())
       ON CONFLICT (company_id, provider)
       DO UPDATE SET needs_2fa_attention = EXCLUDED.needs_2fa_attention, updated_at = now()`,
      [companyId, flag],
    );
  }

  private async fetchIntegration(
    companyId: string,
    provider: 'GOOGLE_CALENDAR' | 'BANK_ECOFUTURO' | 'WALLET_TRON',
  ): Promise<IntegrationRow | null> {
    if (!this.supabase.isEnabled()) {
      return null;
    }

    const rows = await this.supabase.query<IntegrationRow>(
      `SELECT encrypted_credentials, is_active, needs_2fa_attention
       FROM public.company_integrations
       WHERE company_id = $1 AND provider = $2
       LIMIT 1`,
      [companyId, provider],
    );

    return rows[0] ?? null;
  }
}
