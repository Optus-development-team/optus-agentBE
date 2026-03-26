import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { ConnectionOptions as TlsConnectionOptions } from 'node:tls';
import { Pool, QueryResultRow } from 'pg';

@Injectable()
export class SupabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(SupabaseService.name);
  private pool?: Pool;
  private warnedAboutPool = false;

  constructor(private readonly configService: ConfigService) {
    const connectionUrl = this.resolveConnectionString();

    if (!connectionUrl) {
      this.logger.warn(
        'No se encontró SUPABASE_DB_URL. Operaciones multi-tenant deshabilitadas.',
      );
      return;
    }

    const poolSize = Number(
      this.configService.get<string>('SUPABASE_DB_POOL_SIZE', '5'),
    );

    const connectionString = this.enforceConnectionParams(connectionUrl);

    this.pool = new Pool({
      connectionString,
      max: Number.isFinite(poolSize) ? poolSize : 5,
      idleTimeoutMillis: 10_000,
      ssl: this.buildSslConfig(),
    });
  }

  isEnabled(): boolean {
    return Boolean(this.pool);
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    if (!this.pool) {
      if (!this.warnedAboutPool) {
        this.logger.warn(
          'Pool de Supabase no inicializado, consultas serán omitidas hasta configurar SUPABASE_DB_URL.',
        );
        this.warnedAboutPool = true;
      }
      return [];
    }

    try {
      const result = await this.pool.query<T>(sql, params);
      return result.rows;
    } catch (error) {
      const safeError = error as Error;
      this.logger.error(
        `Error ejecutando consulta: ${safeError.message ?? 'desconocido'}`,
      );
      throw safeError;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  private resolveConnectionString(): string | undefined {
    const value = this.configService.get<string>('SUPABASE_DB_URL');
    return value?.trim() || undefined;
  }

  private enforceConnectionParams(rawUrl: string): string {
    try {
      const url = new URL(rawUrl);

      if (url.searchParams.has('sslmode')) {
        url.searchParams.delete('sslmode');
        this.logger.debug(
          'Eliminando sslmode de la cadena de conexión para evitar que pg sobrescriba la configuración TLS personalizada.',
        );
      }

      return url.toString();
    } catch (error) {
      const safeError = error as Error;
      this.logger.warn(
        `No se pudo normalizar la cadena de conexión: ${safeError.message}. Usando valor original.`,
      );
      return rawUrl;
    }
  }

  private buildSslConfig(): TlsConnectionOptions {
    const ca = this.loadCaCertificate();
    if (ca) {
      this.logger.log(
        'Usando CA personalizada para las conexiones a Supabase.',
      );
      return {
        ca,
        rejectUnauthorized: true,
      };
    }

    const allowSelfSigned = this.configService.get<string>(
      'SUPABASE_DB_ALLOW_SELF_SIGNED',
      'true',
    );

    if (allowSelfSigned === 'true') {
      this.logger.warn(
        'SUPABASE_DB_ALLOW_SELF_SIGNED=true: certificados no confiables serán aceptados (solo recomendado en desarrollo).',
      );
      return { rejectUnauthorized: false };
    }

    return { rejectUnauthorized: true };
  }

  private loadCaCertificate(): string | null {
    const inlineCert = this.configService.get<string>('SUPABASE_DB_CA_CERT');
    if (inlineCert) {
      return inlineCert.replace(/\\n/g, '\n');
    }

    const base64Cert = this.configService.get<string>('SUPABASE_DB_CA_BASE64');
    if (base64Cert) {
      try {
        return Buffer.from(base64Cert, 'base64').toString('utf8');
      } catch (error) {
        this.logger.warn(
          `SUPABASE_DB_CA_BASE64 inválido: ${(error as Error).message}.`,
        );
      }
    }

    const caFile = this.configService.get<string>('SUPABASE_DB_CA_FILE');
    if (!caFile) {
      return null;
    }

    try {
      const filePath = isAbsolute(caFile)
        ? caFile
        : resolve(process.cwd(), caFile);
      return readFileSync(filePath, 'utf8');
    } catch (error) {
      this.logger.warn(
        `No se pudo leer SUPABASE_DB_CA_FILE (${caFile}): ${(error as Error).message}.`,
      );
      return null;
    }
  }
}
