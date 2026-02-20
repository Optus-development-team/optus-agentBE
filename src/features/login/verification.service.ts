import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';
import type {
  DbVerificationRow,
  IssueCodeResult,
  VerificationRecord,
  VerificationStatus,
} from './types/verification.types';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly ttlMs = 10 * 60 * 1000;

  constructor(private readonly supabase: SupabaseService) {}

  async issueCode(phone: string): Promise<IssueCodeResult> {
    this.ensureSupabaseReady();
    const normalizedPhone = this.normalizePhone(phone);
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.ttlMs);

    await this.supabase.query(
      'delete from verification_codes where phone = $1',
      [normalizedPhone],
    );

    await this.supabase.query(
      `
        insert into verification_codes (phone, code, expires_at, verified)
        values ($1, $2, $3, false)
      `,
      [normalizedPhone, code, expiresAt],
    );

    return { code, expiresAt };
  }

  async verifyCode(phone: string, code: string): Promise<boolean> {
    this.ensureSupabaseReady();
    const normalizedPhone = this.normalizePhone(phone);
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return false;

    const row = await this.getRowByPhone(normalizedPhone);
    if (!row) return false;

    const expiresAt = this.parseTimestamp(row.expires_at);
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      await this.deleteRow(row.id);
      return false;
    }

    if (row.code.trim().toUpperCase() !== normalizedCode) {
      return false;
    }

    await this.supabase.query(
      "update verification_codes set verified = true, expires_at = timezone('utc', now()) where id = $1",
      [row.id],
    );

    return true;
  }

  async getStatus(phone: string): Promise<VerificationStatus> {
    this.ensureSupabaseReady();
    const normalizedPhone = this.normalizePhone(phone);
    const row = await this.getRowByPhone(normalizedPhone);

    if (!row) {
      return { verified: false, linkedAt: null };
    }

    return {
      verified: row.verified,
      linkedAt: row.created_at ? this.parseTimestamp(row.created_at) : null,
    };
  }

  async getLatestRecord(
    phone: string,
  ): Promise<VerificationRecord | undefined> {
    this.ensureSupabaseReady();
    const normalizedPhone = this.normalizePhone(phone);
    const row = await this.getRowByPhone(normalizedPhone);
    return row
      ? {
          phone: row.phone,
          code: row.code,
          expiresAt: this.parseTimestamp(row.expires_at),
          verified: row.verified,
          verifiedAt: row.created_at
            ? this.parseTimestamp(row.created_at)
            : null,
        }
      : undefined;
  }

  async verifyFromMessage(phone: string, text: string): Promise<boolean> {
    if (!text) return false;
    const candidates = this.extractCodes(text);
    for (const candidate of candidates) {
      const ok = await this.verifyCode(phone, candidate);
      if (ok) return true;
    }
    return false;
  }

  async markPhoneVerified(phone: string): Promise<void> {
    this.ensureSupabaseReady();
    const normalizedPhone = this.normalizePhone(phone);
    await this.supabase.query(
      'update company_users set phone = $1, is_phone_verified = true where phone = $1',
      [normalizedPhone],
    );
  }

  private async getRowByPhone(
    phone: string,
  ): Promise<DbVerificationRow | null> {
    const rows = await this.supabase.query<DbVerificationRow>(
      'select id, phone, code, expires_at, verified, created_at from verification_codes where phone = $1 limit 1',
      [phone],
    );

    return rows[0] ?? null;
  }

  private parseTimestamp(value: string | null): Date | null {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : new Date(ms);
  }

  private async deleteRow(id: string): Promise<void> {
    await this.supabase.query('delete from verification_codes where id = $1', [
      id,
    ]);
  }

  private ensureSupabaseReady(): void {
    if (!this.supabase.isEnabled()) {
      throw new Error(
        'Servicio de verificación OTP deshabilitado por falta de conexión a Supabase',
      );
    }
  }

  private generateCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i += 1) {
      const idx = Math.floor(Math.random() * alphabet.length);
      code += alphabet[idx];
    }
    return code;
  }

  private normalizePhone(phone: string): string {
    const digitsOnly = phone?.replace(/\D/g, '') ?? '';
    if (!digitsOnly) {
      throw new Error('Número de teléfono inválido para verificación');
    }
    return digitsOnly;
  }

  private extractCodes(text: string): string[] {
    const matches = text.toUpperCase().match(/[A-Z0-9]{4,6}/g);
    if (!matches) return [];
    return matches.map((m) => m.trim()).filter(Boolean);
  }
}
