/**
 * Servicio de sesiones ADK persistentes usando Supabase.
 * Implementa persistencia de sesiones para el orquestador ADK.
 *
 * @see https://google.github.io/adk-docs/sessions/session/
 * @see https://google.github.io/adk-docs/sessions/state/
 */
import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import type {
  AgentSessionState,
  SessionSnapshot,
  SessionEvent,
} from '../types/agent.types';
import type {
  AdkSessionSnapshot,
  TenantContext,
  UserRole,
  Intent,
  SanitizedTextResult,
} from '../../../types/whatsapp.types';

/**
 * Estructura de una fila de sesión en la base de datos
 */
interface AdkSessionRow {
  session_id: string;
  company_id: string;
  context_data: unknown;
  updated_at: string;
}

@Injectable()
export class AdkSessionService {
  private readonly logger = new Logger(AdkSessionService.name);
  private readonly appName = 'optsms';

  // Cache en memoria para sesiones activas (reduce queries a la DB)
  private readonly sessionCache = new Map<string, SessionSnapshot>();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutos

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Crea o recupera una sesión para un usuario por sessionId y companyId
   */
  async getOrCreateSession(
    sessionId: string,
    companyId: string,
  ): Promise<SessionSnapshot> {
    // Verificar cache primero
    const cached = this.sessionCache.get(sessionId);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Buscar en base de datos
    const existing = await this.fetchSession(sessionId);
    if (existing) {
      this.sessionCache.set(sessionId, existing);
      return existing;
    }

    // Crear nueva sesión
    const newSession: SessionSnapshot = {
      sessionId,
      companyId,
      state: {},
      events: [],
      updatedAt: new Date(),
    };

    await this.persistSession(newSession);
    this.sessionCache.set(sessionId, newSession);

    this.logger.debug(`Nueva sesión creada: ${sessionId}`);
    return newSession;
  }

  /**
   * Obtiene una sesión existente por ID
   */
  async getSession(sessionId: string): Promise<SessionSnapshot | null> {
    const cached = this.sessionCache.get(sessionId);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    return this.fetchSession(sessionId);
  }

  /**
   * Agrega un evento a la sesión
   */
  async appendEvent(
    session: SessionSnapshot,
    event: SessionEvent,
  ): Promise<void> {
    // Agregar evento al historial (mantener últimos 50)
    session.events.push(event);
    if (session.events.length > 50) {
      session.events = session.events.slice(-50);
    }

    // Actualizar timestamp
    session.updatedAt = new Date();

    // Persistir cambios
    await this.persistSession(session);
    this.sessionCache.set(session.sessionId, session);
  }

  /**
   * Actualiza el estado de la sesión directamente (usando sessionId)
   */
  async updateState(
    sessionId: string,
    stateDelta: AgentSessionState,
  ): Promise<void> {
    // Obtener sesión actual
    let session: SessionSnapshot | undefined = this.sessionCache.get(sessionId);
    if (!session) {
      const fetched = await this.fetchSession(sessionId);
      session = fetched ?? undefined;
    }

    if (!session) {
      this.logger.warn(`Sesión no encontrada para actualizar: ${sessionId}`);
      return;
    }

    // Mezclar estado
    session.state = {
      ...session.state,
      ...stateDelta,
    };
    session.updatedAt = new Date();

    await this.persistSession(session);
    this.sessionCache.set(sessionId, session);
  }

  /**
   * Elimina una sesión
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.sessionCache.delete(sessionId);

    if (!this.supabase.isEnabled()) {
      return;
    }

    try {
      await this.supabase.query(
        'DELETE FROM public.adk_sessions WHERE session_id = $1',
        [sessionId],
      );
      this.logger.debug(`Sesión eliminada: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error eliminando sesión ${sessionId}:`, error);
    }
  }

  /**
   * Lista todas las sesiones de una compañía
   */
  async listSessionsByCompany(companyId: string): Promise<SessionSnapshot[]> {
    if (!this.supabase.isEnabled()) {
      return Array.from(this.sessionCache.values()).filter(
        (s) => s.companyId === companyId,
      );
    }

    try {
      const rows = await this.supabase.query<AdkSessionRow>(
        'SELECT session_id, company_id, context_data, updated_at FROM public.adk_sessions WHERE company_id = $1',
        [companyId],
      );

      if (!rows) return [];
      return rows.map((row) => this.rowToSnapshot(row));
    } catch (error) {
      this.logger.error(`Error listando sesiones de ${companyId}:`, error);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Métodos privados
  // ─────────────────────────────────────────────────────────────────────────

  private isCacheValid(session: SessionSnapshot): boolean {
    const age = Date.now() - session.updatedAt.getTime();
    return age < this.cacheTtlMs;
  }

  private async fetchSession(
    sessionId: string,
  ): Promise<SessionSnapshot | null> {
    if (!this.supabase.isEnabled()) {
      this.logger.warn(
        `Supabase no disponible, usando cache en memoria para ${sessionId}`,
      );
      return null;
    }

    try {
      const rows = await this.supabase.query<AdkSessionRow>(
        'SELECT session_id, company_id, context_data, updated_at FROM public.adk_sessions WHERE session_id = $1 LIMIT 1',
        [sessionId],
      );

      if (!rows?.length) {
        return null;
      }

      return this.rowToSnapshot(rows[0]);
    } catch (error) {
      this.logger.error(`Error obteniendo sesión ${sessionId}:`, error);
      return null;
    }
  }

  private async persistSession(session: SessionSnapshot): Promise<void> {
    if (!this.supabase.isEnabled()) {
      return;
    }

    try {
      const contextData = JSON.stringify({
        state: session.state,
        events: session.events,
      });

      await this.supabase.query(
        `INSERT INTO public.adk_sessions (session_id, company_id, context_data, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (session_id) DO UPDATE SET
           context_data = EXCLUDED.context_data,
           updated_at = NOW()`,
        [session.sessionId, session.companyId, contextData],
      );
    } catch (error) {
      this.logger.error(
        `Error persistiendo sesión ${session.sessionId}:`,
        error,
      );
    }
  }

  private rowToSnapshot(row: AdkSessionRow): SessionSnapshot {
    const parsed = this.parseContext(row.context_data);

    return {
      sessionId: row.session_id,
      companyId: row.company_id,
      state: parsed.state,
      events: parsed.events,
      updatedAt: new Date(row.updated_at),
    };
  }

  private parseContext(value: unknown): {
    state: AgentSessionState;
    events: SessionEvent[];
  } {
    if (!value || typeof value !== 'object') {
      return { state: {}, events: [] };
    }

    const obj = value as Record<string, unknown>;

    return {
      state: (obj.state as AgentSessionState) ?? {},
      events: (obj.events as SessionEvent[]) ?? [],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Métodos de compatibilidad con WhatsApp Service
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Carga una sesión de WhatsApp (compatibilidad con WhatsappService)
   */
  async loadSession(
    tenant: TenantContext,
    senderId: string,
    role: UserRole,
  ): Promise<AdkSessionSnapshot> {
    const sessionId = this.buildSessionId(tenant.companyId, senderId);
    const existing = await this.fetchSession(sessionId);

    const baseContext = this.buildBaseContext(tenant, role);
    let mergedContext = { ...baseContext };

    if (existing) {
      // Merge existing state with base context
      const existingContext = existing.state as Record<string, unknown>;
      mergedContext = {
        ...existingContext,
        ...baseContext,
        company_name: baseContext.company_name,
        company_tone: baseContext.company_tone,
        inventory_context: baseContext.inventory_context,
        today_date: baseContext.today_date,
        user_role: baseContext.user_role,
      };
    }

    const snapshot: AdkSessionSnapshot = {
      sessionId,
      companyId: tenant.companyId,
      senderId,
      context: mergedContext,
    };

    // Persist as SessionSnapshot
    await this.persistSession({
      sessionId,
      companyId: tenant.companyId,
      state: mergedContext as AgentSessionState,
      events: existing?.events ?? [],
      updatedAt: new Date(),
    });

    return snapshot;
  }

  /**
   * Registra una interacción (compatibilidad con WhatsappService)
   */
  async recordInteraction(params: {
    session: AdkSessionSnapshot;
    intent: Intent | 'FALLBACK';
    sanitized: SanitizedTextResult;
  }): Promise<void> {
    const updatedContext = {
      ...params.session.context,
      last_intent: params.intent,
      last_user_text: params.sanitized.normalizedText,
      last_updated_at: new Date().toISOString(),
      tokens: params.sanitized.tokens,
    };

    params.session.context = updatedContext;

    await this.persistSession({
      sessionId: params.session.sessionId,
      companyId: params.session.companyId,
      state: updatedContext as AgentSessionState,
      events: [],
      updatedAt: new Date(),
    });
  }

  private buildSessionId(companyId: string, senderId: string): string {
    return `${companyId}:${this.cleanNumber(senderId)}`;
  }

  private cleanNumber(value: string): string {
    return value.replace(/\D/g, '');
  }

  private buildBaseContext(tenant: TenantContext, role: UserRole) {
    const config = tenant.companyConfig ?? {};
    const tone =
      (config.company_tone as string) ??
      (config.companyTone as string) ??
      (config.tone as string) ??
      'Neutral';
    const inventoryContext =
      (config.inventory_context as string) ??
      (config.inventoryContext as string) ??
      'Inventario General';

    return {
      company_name: tenant.companyName,
      company_tone: tone,
      inventory_context: inventoryContext,
      today_date: new Date().toISOString().slice(0, 10),
      user_role: role,
    };
  }
}
