import { Injectable, Logger } from '@nestjs/common';
import { BaseSessionService } from '@google/adk';
import type {
  AppendEventRequest,
  CreateSessionRequest,
  DeleteSessionRequest,
  Event,
  GetSessionRequest,
  ListSessionsRequest,
  ListSessionsResponse,
  Session,
} from '@google/adk';
import { SupabaseService } from '../../../common/intraestructure/supabase/supabase.service';
import type {
  DbAdkSessionRow,
  DbCompanyConfigVersionRow,
} from '../../../common/intraestructure/supabase/supabase.types';
import { flattenCompanyConfig } from './config-flattener';

/**
 * Implementación de BaseSessionService de ADK usando Supabase como backend.
 * Permite persistir las sesiones de los agentes entre invocaciones.
 *
 * Incluye control de versiones de la config de companies:
 * compara `config_updated_at` contra `app:configVersion` del estado
 * para re-cargar la configuración solo cuando cambia.
 */
@Injectable()
export class SupabaseSessionService extends BaseSessionService {
  private readonly logger = new Logger(SupabaseSessionService.name);
  private readonly fallbackSessions = new Map<string, Session>();

  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  /**
   * Crea una nueva sesión
   */
  async createSession({
    appName,
    userId,
    sessionId,
    state,
  }: CreateSessionRequest): Promise<Session> {
    const resolvedSessionId = sessionId ?? `${appName}:${userId}`;
    const initialState = this.stripTempState(state ?? {});
    const companyId = this.resolveCompanyId(initialState);

    const session: Session = {
      id: resolvedSessionId,
      appName,
      userId,
      state: initialState,
      events: [],
      lastUpdateTime: Date.now(),
    };

    if (this.supabase.isEnabled() && companyId) {
      try {
        await this.supabase.query(
          `INSERT INTO adk_sessions (session_id, company_id, context_data, updated_at)
           VALUES ($1, $2, $3::jsonb, NOW())
           ON CONFLICT (session_id)
           DO UPDATE SET context_data = EXCLUDED.context_data, updated_at = NOW()`,
          [
            resolvedSessionId,
            companyId,
            JSON.stringify({ state: initialState, events: session.events }),
          ],
        );
        this.logger.debug(`Sesión creada en Supabase: ${resolvedSessionId}`);
      } catch (error) {
        this.logger.error(
          `Error creando sesión en Supabase: ${(error as Error).message}`,
        );
      }
    } else if (!companyId) {
      this.logger.warn(
        `No se pudo resolver companyId para la sesión ${resolvedSessionId}; se usará solo memoria.`,
      );
    }

    this.fallbackSessions.set(resolvedSessionId, session);
    return session;
  }

  /**
   * Obtiene una sesión existente.
   * Intercepta para comparar la versión del config y actualizar si es necesario.
   */
  async getSession({
    appName,
    userId,
    sessionId,
    config,
  }: GetSessionRequest): Promise<Session | undefined> {
    if (this.supabase.isEnabled()) {
      try {
        const rows = await this.supabase.query<DbAdkSessionRow>(
          `SELECT session_id, company_id, context_data, updated_at
           FROM adk_sessions
           WHERE session_id = $1
           LIMIT 1`,
          [sessionId],
        );

        if (rows.length > 0) {
          const row = rows[0];
          const loadedSession = this.rowToSession(row, { appName, userId });

          // --- Control de versiones de config ---
          await this.refreshConfigIfStale(loadedSession, row.company_id);

          const filteredSession = this.applyGetConfig(loadedSession, config);
          this.fallbackSessions.set(sessionId, filteredSession);
          return filteredSession;
        }
      } catch (error) {
        this.logger.error(
          `Error obteniendo sesión de Supabase: ${(error as Error).message}`,
        );
      }
    }

    // Fallback a memoria
    const cached = this.fallbackSessions.get(sessionId);
    return cached ? this.applyGetConfig(cached, config) : undefined;
  }

  /**
   * Lista las sesiones de un usuario
   */
  async listSessions({
    appName,
    userId,
  }: ListSessionsRequest): Promise<ListSessionsResponse> {
    const sessions: Session[] = [];

    if (this.supabase.isEnabled()) {
      try {
        const rows = await this.supabase.query<DbAdkSessionRow>(
          `SELECT session_id, company_id, context_data, updated_at
           FROM adk_sessions
           WHERE session_id LIKE $1 || ':%'
           ORDER BY updated_at DESC`,
          [appName],
        );

        for (const row of rows) {
          const full = this.rowToSession(row, { appName, userId });
          sessions.push({
            id: full.id,
            appName: full.appName,
            userId: full.userId,
            state: {},
            events: [],
            lastUpdateTime: full.lastUpdateTime,
          });
        }
      } catch (error) {
        this.logger.error(
          `Error listando sesiones de Supabase: ${(error as Error).message}`,
        );
      }
    }

    // Si no hay sesiones de Supabase, buscar en memoria
    if (sessions.length === 0) {
      for (const [id, session] of this.fallbackSessions) {
        if (session.appName === appName && session.userId === userId) {
          sessions.push({
            id,
            appName: session.appName,
            userId: session.userId,
            state: {},
            events: [],
            lastUpdateTime: session.lastUpdateTime,
          });
        }
      }
    }

    return {
      sessions,
      page: 1,
      limit: sessions.length,
      totalItems: sessions.length,
      totalPages: sessions.length === 0 ? 0 : 1,
    };
  }

  /**
   * Elimina una sesión
   */
  async deleteSession({ sessionId }: DeleteSessionRequest): Promise<void> {
    if (this.supabase.isEnabled()) {
      try {
        await this.supabase.query(
          `DELETE FROM adk_sessions WHERE session_id = $1`,
          [sessionId],
        );
        this.logger.debug(`Sesión eliminada de Supabase: ${sessionId}`);
      } catch (error) {
        this.logger.error(
          `Error eliminando sesión de Supabase: ${(error as Error).message}`,
        );
      }
    }

    this.fallbackSessions.delete(sessionId);
  }

  /**
   * Agrega un evento a la sesión y actualiza el estado.
   * Implementa el método requerido por BaseSessionService de ADK.
   */
  async appendEvent({ session, event }: AppendEventRequest): Promise<Event> {
    // Deja que la clase base aplique stateDelta (ignorando temp:) y agregue el evento
    await super.appendEvent({ session, event });
    session.lastUpdateTime = event.timestamp;

    // Defensa extra: si la sesión ya traía claves temp: (p.ej. datos legacy),
    // no dejarlas persistirse ni devolverse.
    session.state = this.stripTempState(session.state);

    if (this.supabase.isEnabled()) {
      const companyId = this.resolveCompanyId(session.state);
      if (companyId) {
        try {
          await this.supabase.query(
            `INSERT INTO adk_sessions (session_id, company_id, context_data, updated_at)
             VALUES ($1, $2, $3::jsonb, NOW())
             ON CONFLICT (session_id)
             DO UPDATE SET context_data = EXCLUDED.context_data, updated_at = NOW()`,
            [
              session.id,
              companyId,
              JSON.stringify({ state: session.state, events: session.events }),
            ],
          );
        } catch (error) {
          this.logger.error(
            `Error actualizando sesión en Supabase: ${(error as Error).message}`,
          );
        }
      }
    }

    // Actualizar en memoria
    this.fallbackSessions.set(session.id, session);

    return event;
  }

  // ─── Config version control ────────────────────────────────────────

  /**
   * Compara la marca de tiempo de config_updated_at en la DB contra
   * app:configVersion almacenado en el estado de la sesión.
   * Si la DB tiene una fecha más reciente, recarga y aplana el config.
   */
  private async refreshConfigIfStale(
    session: Session,
    companyId: string,
  ): Promise<void> {
    if (!this.supabase.isEnabled() || !companyId) return;

    try {
      const rows = await this.supabase.query<DbCompanyConfigVersionRow>(
        `SELECT config, config_updated_at
         FROM public.companies
         WHERE id = $1
         LIMIT 1`,
        [companyId],
      );

      if (!rows.length) return;

      const row = rows[0];
      const dbTimestamp = row.config_updated_at;
      const sessionTimestamp = session.state['app:configVersion'] as
        | string
        | undefined;

      // Si la versión almacenada coincide, no hay nada que hacer
      if (sessionTimestamp && dbTimestamp && sessionTimestamp === dbTimestamp) {
        return;
      }

      this.logger.debug(
        `Config desactualizado para company=${companyId}. ` +
          `Session=${sessionTimestamp ?? 'null'} → DB=${dbTimestamp}. Recargando...`,
      );

      // Determinar el rol del usuario para filtrar claves
      const role =
        (session.state['user:role'] as string | undefined) ?? 'CLIENT';

      // Parsear el config crudo
      const rawConfig = this.parseJson(row.config, {}) as Record<
        string,
        unknown
      >;

      // Aplana y filtra
      const flatConfig = flattenCompanyConfig(rawConfig, role);

      // Eliminar claves agent:* previas del estado
      for (const key of Object.keys(session.state)) {
        if (key.startsWith('agent:')) {
          delete session.state[key];
        }
      }

      // Inyectar nuevas claves aplanadas
      Object.assign(session.state, flatConfig);

      // Actualizar marca de versión
      session.state['app:configVersion'] = dbTimestamp;

      // Persistir el estado actualizado
      await this.supabase.query(
        `UPDATE adk_sessions
         SET context_data = $1::jsonb, updated_at = NOW()
         WHERE session_id = $2`,
        [
          JSON.stringify({ state: session.state, events: session.events }),
          session.id,
        ],
      );

      this.logger.debug(
        `Config actualizado en sesión para company=${companyId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error refrescando config para company=${companyId}: ${(error as Error).message}`,
      );
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private applyGetConfig(
    session: Session,
    config?: GetSessionRequest['config'],
  ): Session {
    if (!config) return session;

    const copied: Session = {
      ...session,
      state: { ...session.state },
      events: [...session.events],
    };

    if (config.numRecentEvents) {
      copied.events = copied.events.slice(-config.numRecentEvents);
    }

    if (config.afterTimestamp) {
      let i = copied.events.length - 1;
      while (i >= 0) {
        if (copied.events[i].timestamp < config.afterTimestamp) {
          break;
        }
        i--;
      }
      if (i >= 0) {
        copied.events = copied.events.slice(i + 1);
      }
    }

    return copied;
  }

  /**
   * Convierte una fila de base de datos a un objeto Session
   */
  private rowToSession(
    row: DbAdkSessionRow,
    fallbackIds: { appName: string; userId?: string },
  ): Session {
    const context = this.parseJson(row.context_data, {}) as {
      state?: Record<string, unknown>;
      events?: Event[];
      userId?: string;
      appName?: string;
    };

    return {
      id: row.session_id,
      appName: (context.appName as string) || fallbackIds.appName,
      userId: (context.userId as string) || fallbackIds.userId || '',
      events: this.parseJson(context.events, []) as Event[],
      state: this.stripTempState(
        this.parseJson(context.state, {}) as Record<string, unknown>,
      ),
      lastUpdateTime: new Date(row.updated_at).getTime(),
    };
  }

  private stripTempState(
    state: Record<string, unknown>,
  ): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(state)) {
      if (key.startsWith('temp:')) continue;
      cleaned[key] = value;
    }
    return cleaned;
  }

  /**
   * Parsea JSON de forma segura
   */
  private parseJson<T>(value: unknown, fallback: T): T {
    if (!value) return fallback;

    if (typeof value === 'object') {
      return value as T;
    }

    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    }

    return fallback;
  }

  private resolveCompanyId(state: Record<string, unknown>): string | undefined {
    const companyId = state['app:companyId'];
    if (typeof companyId === 'string' && companyId.length > 0) {
      return companyId;
    }
    return undefined;
  }
}
