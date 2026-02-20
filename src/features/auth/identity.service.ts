import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';
import type { TenantContext } from '../whatsapp/types/whatsapp.types';
import { UserRole } from '../whatsapp/types/whatsapp.types';

type NullableString = string | null | undefined;

interface CompanyRow {
  id: string;
  name: string;
  config: unknown;
  whatsapp_admin_phone_ids?: string[] | null;
  whatsapp_display_phone_number?: NullableString;
  whatsapp_phone_id?: NullableString;
}

interface CompanyUserRow {
  role?: NullableString;
  phone: string;
}

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);
  private readonly adminPhone: string;
  private readonly fallbackCompanyId: string;
  private readonly fallbackCompanyName: string;
  private readonly fallbackCompanyConfig: Record<string, unknown>;
  private readonly fallbackPhoneNumberId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.adminPhone = this.cleanNumber(
      this.configService.get<string>('WHATSAPP_ADMIN_PHONE', '') ?? '',
    );
    this.fallbackCompanyId =
      this.configService.get<string>('DEFAULT_COMPANY_ID', '') ?? '';
    this.fallbackCompanyName =
      this.configService.get<string>('DEFAULT_COMPANY_NAME', 'Optus') ??
      'Optus';
    this.fallbackCompanyConfig = this.parseConfig(
      this.configService.get<string>('DEFAULT_COMPANY_CONFIG'),
    );
    this.fallbackPhoneNumberId =
      this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID', '') ||
      this.configService.get<string>('PHONE_NUMBER_ID', '') ||
      '';
  }

  async resolveTenantByPhoneId(
    phoneNumberId?: string,
  ): Promise<TenantContext | null> {
    if (!phoneNumberId) {
      this.logger.warn('phone_number_id no presente en el webhook.');
      return null;
    }

    if (!this.supabaseService.isEnabled()) {
      return this.buildFallbackTenant(phoneNumberId);
    }

    const rows = await this.supabaseService.query<CompanyRow>(
      `SELECT id, name, config, whatsapp_admin_phone_ids, whatsapp_display_phone_number, whatsapp_phone_id
       FROM public.companies
       WHERE whatsapp_phone_id = $1
       LIMIT 1`,
      [phoneNumberId],
    );

    if (!rows.length) {
      this.logger.warn(
        `No se encontró compañía para phone_number_id=${phoneNumberId}.`,
      );
      return null;
    }

    const tenant = this.buildTenantFromRow(rows[0], phoneNumberId);
    if (!tenant) {
      this.logger.error(
        `No se pudo construir el tenant para phone_number_id=${phoneNumberId}.`,
      );
    }
    return tenant;
  }

  async resolveTenantByCompanyId(
    companyId: string,
  ): Promise<TenantContext | null> {
    if (!companyId) {
      return null;
    }

    if (!this.supabaseService.isEnabled()) {
      if (this.fallbackCompanyId === companyId && this.fallbackPhoneNumberId) {
        return this.buildFallbackTenant(this.fallbackPhoneNumberId);
      }

      this.logger.warn(
        `Supabase no disponible y no existe fallback para company_id=${companyId}.`,
      );
      return null;
    }

    const rows = await this.supabaseService.query<CompanyRow>(
      `SELECT id, name, config, whatsapp_admin_phone_ids, whatsapp_display_phone_number, whatsapp_phone_id
       FROM public.companies
       WHERE id = $1
       LIMIT 1`,
      [companyId],
    );

    if (!rows.length) {
      this.logger.warn(`No se encontró compañía para id=${companyId}.`);
      return null;
    }

    const tenant = this.buildTenantFromRow(rows[0], rows[0].whatsapp_phone_id);
    if (!tenant) {
      this.logger.error(
        `No se pudo construir tenant para company_id=${companyId}.`,
      );
    }
    return tenant;
  }

  async resolveRole(
    tenant: TenantContext,
    senderId: string,
    waId?: string,
  ): Promise<UserRole> {
    const candidates = this.buildIdentityCandidates(senderId, waId);

    if (this.matchesAnyAdminPhone(candidates, tenant.adminPhoneIds)) {
      return UserRole.ADMIN;
    }

    if (this.supabaseService.isEnabled() && candidates.length) {
      const rows = await this.supabaseService.query<CompanyUserRow>(
        `SELECT role, phone FROM public.company_users
         WHERE company_id = $1
         AND regexp_replace(phone, '\\D', '', 'g') = ANY($2::text[])
         LIMIT 1`,
        [tenant.companyId, candidates],
      );

      if (rows.length) {
        const normalizedRole = rows[0].role?.toUpperCase();
        if (normalizedRole === 'ADMIN' || normalizedRole === 'ROLE_ADMIN') {
          return UserRole.ADMIN;
        }
        return UserRole.CLIENT;
      }
    }

    if (this.adminPhone) {
      const fallbackAdmin = this.cleanNumber(this.adminPhone);
      if (fallbackAdmin && candidates.includes(fallbackAdmin)) {
        return UserRole.ADMIN;
      }
    }

    return UserRole.CLIENT;
  }

  async getAdminPhones(companyId: string): Promise<string[]> {
    const adminPhones = new Set<string>(
      await this.fetchCompanyAdminPhones(companyId),
    );

    if (this.supabaseService.isEnabled()) {
      const rows = await this.supabaseService.query<CompanyUserRow>(
        `SELECT phone FROM public.company_users
         WHERE company_id = $1 AND role = 'ADMIN'`,
        [companyId],
      );

      for (const row of rows) {
        const phone = this.cleanNumber(row.phone);
        if (phone) {
          adminPhones.add(phone);
        }
      }
    }

    if (!adminPhones.size && this.adminPhone) {
      adminPhones.add(this.cleanNumber(this.adminPhone));
    }

    return Array.from(adminPhones);
  }

  async ensureCompanyUser(
    companyId: string,
    rawPhone: string,
    role: UserRole,
  ): Promise<string | null> {
    if (!this.supabaseService.isEnabled()) {
      this.logger.warn('Supabase no habilitado, no se puede registrar usuario');
      return null;
    }

    const phone = this.cleanNumber(rawPhone);
    this.logger.debug(`Verificando usuario ${phone} para company ${companyId}`);

    const existing = await this.supabaseService.query<{ id: string }>(
      `SELECT id FROM public.company_users
       WHERE company_id = $1
       AND regexp_replace(phone, '\\D', '', 'g') = $2
       LIMIT 1`,
      [companyId, phone],
    );

    if (existing[0]?.id) {
      this.logger.log(
        `Usuario existente encontrado: ${existing[0].id} (${phone})`,
      );
      return existing[0].id;
    }

    const dbRole = role === UserRole.ADMIN ? 'ADMIN' : 'CLIENT';
    this.logger.log(`Creando nuevo usuario ${phone} con rol ${dbRole}`);

    const rows = await this.supabaseService.query<{ id: string }>(
      `INSERT INTO public.company_users (company_id, phone, role)
       VALUES ($1, $2, $3::user_role)
       ON CONFLICT (company_id, phone) DO UPDATE SET role = EXCLUDED.role
       RETURNING id`,
      [companyId, phone, dbRole],
    );

    const userId = rows[0]?.id ?? null;
    if (userId) {
      this.logger.log(`Usuario creado exitosamente: ${userId} (${phone})`);
    } else {
      this.logger.error(`No se pudo crear usuario para ${phone}`);
    }

    return userId;
  }

  private cleanNumber(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private parseConfig(value: unknown): Record<string, unknown> {
    if (!value) {
      return {};
    }

    if (typeof value === 'object') {
      return value as Record<string, unknown>;
    }

    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as Record<string, unknown>;
      } catch {
        return {};
      }
    }

    return {};
  }

  private buildFallbackTenant(phoneNumberId: string): TenantContext | null {
    if (!this.fallbackCompanyId) {
      this.logger.error(
        'No hay conexión a Supabase ni DEFAULT_COMPANY_ID configurado. Ignorando mensaje.',
      );
      return null;
    }

    return {
      companyId: this.fallbackCompanyId,
      companyName: this.fallbackCompanyName,
      companyConfig: this.fallbackCompanyConfig,
      phoneNumberId,
      adminPhoneIds: this.getFallbackAdminPhones(),
      displayPhoneNumber: null,
    };
  }

  private buildTenantFromRow(
    row: CompanyRow,
    explicitPhoneNumberId?: NullableString,
  ): TenantContext | null {
    const companyConfig = this.parseConfig(row.config);
    const adminPhoneIds = this.normalizePhoneArray(
      row.whatsapp_admin_phone_ids,
    );

    if (!adminPhoneIds.length && this.adminPhone) {
      adminPhoneIds.push(this.cleanNumber(this.adminPhone));
    }

    const phoneNumberId =
      explicitPhoneNumberId ??
      row.whatsapp_phone_id ??
      this.fallbackPhoneNumberId;

    if (!phoneNumberId) {
      this.logger.error(
        `La compañía ${row.id} no tiene whatsapp_phone_id configurado ni fallback.`,
      );
      return null;
    }

    return {
      companyId: row.id,
      companyName: row.name,
      companyConfig,
      phoneNumberId,
      adminPhoneIds,
      displayPhoneNumber: row.whatsapp_display_phone_number ?? null,
    };
  }

  private normalizePhoneArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const normalized = new Set<string>();

    for (const raw of value) {
      if (typeof raw !== 'string') {
        continue;
      }

      const phone = this.cleanNumber(raw);
      if (phone) {
        normalized.add(phone);
      }
    }

    return Array.from(normalized);
  }

  private async fetchCompanyAdminPhones(companyId: string): Promise<string[]> {
    if (!this.supabaseService.isEnabled()) {
      return this.getFallbackAdminPhones();
    }

    const rows = await this.supabaseService.query<{
      whatsapp_admin_phone_ids: string[] | null;
    }>(
      `SELECT whatsapp_admin_phone_ids
       FROM public.companies
       WHERE id = $1
       LIMIT 1`,
      [companyId],
    );

    const phones = this.normalizePhoneArray(rows[0]?.whatsapp_admin_phone_ids);
    if (!phones.length && this.adminPhone) {
      phones.push(this.cleanNumber(this.adminPhone));
    }

    return phones;
  }

  private getFallbackAdminPhones(): string[] {
    return this.adminPhone ? [this.cleanNumber(this.adminPhone)] : [];
  }

  private matchesAnyAdminPhone(
    candidates: string[],
    adminPhones: string[],
  ): boolean {
    if (!candidates.length || !adminPhones.length) {
      return false;
    }

    const adminSet = new Set(adminPhones);
    return candidates.some((candidate) => adminSet.has(candidate));
  }

  private buildIdentityCandidates(
    primary: string,
    secondary?: string,
  ): string[] {
    const normalized = new Set<string>();

    if (primary) {
      const cleaned = this.cleanNumber(primary);
      if (cleaned) {
        normalized.add(cleaned);
      }
    }

    if (secondary) {
      const cleaned = this.cleanNumber(secondary);
      if (cleaned) {
        normalized.add(cleaned);
      }
    }

    return Array.from(normalized);
  }
}
