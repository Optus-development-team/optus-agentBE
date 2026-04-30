import { Injectable, Logger } from '@nestjs/common';
import type { FunctionTool, LlmAgent } from '@google/adk';
import { ConfigService } from '@nestjs/config';
import type { RouterMessageContext } from '../../../../features/messaging/features/whatsapp/types/whatsapp.types';
import { UserRole } from '../../../../features/messaging/features/whatsapp/types/whatsapp.types';
import type { OrchestrationResult } from '../orchestrator.types';
import type { OrchestratorConfig } from './orchestrator.config';
import { OrchestratorToolsService } from '../orchestrator.tools';
import { ReportingAgent } from '../agents/general/reporting/reporting.agent';
import { AppointmentAdminAgent } from '../agents/general/appointment/admin/appointment.agent';
import { ReestockAgent } from '../agents/general/reestock/reestock.agent';
import { KnowledgeAgent } from '../agents/general/knowledge/knowledge.agent';
import { SalonStylistAgent } from '../agents/verticals/salon/salon.agent';
import { OAuthService } from '../../../../features/auth/oauth.service';
import { WhatsAppResponseService } from '../../../../features/messaging/features/whatsapp/services/whatsapp-response.service';
import { TimeService } from '../../../../common/time/time.service';
import { buildPrompt } from '../builders/prompt.builder';
import { buildInitialState } from '../builders/initial-state.builder';

@Injectable()
export class SalonAdminOrchestratorConfig implements OrchestratorConfig {
  private readonly logger = new Logger(SalonAdminOrchestratorConfig.name);

  constructor(
    private readonly config: ConfigService,
    private readonly orchestratorTools: OrchestratorToolsService,
    private readonly reportingAgent: ReportingAgent,
    private readonly appointmentAdminAgent: AppointmentAdminAgent,
    private readonly reestockAgent: ReestockAgent,
    private readonly knowledgeAgent: KnowledgeAgent,
    private readonly salonStylistAgent: SalonStylistAgent,
    private readonly oauthService: OAuthService,
    private readonly whatsappResponse: WhatsAppResponseService,
    private readonly timeService: TimeService,
  ) {}

  getName(): string {
    return 'salon_admin_orchestrator';
  }

  getDescription(): string {
    return 'Orquestador interno para vertical salón de belleza';
  }

  buildInstruction(): string {
    return `Eres el orquestador administrativo de un salón de belleza ({app:companyName}).

AGENTES DISPONIBLES:
1. reporting_agent: métricas de operación y rentabilidad.
2. appointment_admin_agent: gestión interna de agenda.
3. reestock_agent: control de insumos/productos.
4. knowledge_agent: soporte institucional y políticas.
5. salon_stylist_agent: operaciones especializadas (sillas y turnos de estilistas).

COMPORTAMIENTO:
- Prioriza eficiencia operativa y servicio al cliente.
- Usa salon_stylist_agent para asignaciones de sillas/turnos.
- Solicita datos faltantes antes de ejecutar acciones críticas.
- Toma {app:todayDate} como fecha base para las operaciones.`;
  }

  async preRoute(
    context: RouterMessageContext,
  ): Promise<OrchestrationResult | null> {
    const userId = this.normalizePhone(context.senderId);

    if (context.role === UserRole.ADMIN && context.tenant?.companyId) {
      const companyId = context.tenant.companyId;
      const hasCreds = await this.oauthService.checkCredentials(companyId);

      if (!hasCreds) {
        this.logNeedsCalendar(userId, companyId);
        await this.sendCalendarCta(userId, companyId, context);
        return {
          intent: 'UNKNOWN',
          responseText:
            'Necesitas completar la conexión con Google Calendar para continuar.',
          agentUsed: this.getName(),
        };
      }
    }

    return null;
  }

  buildPrompt(context: RouterMessageContext): string {
    return buildPrompt(context, { includeVertical: true });
  }

  buildInitialState(context: RouterMessageContext): Record<string, unknown> {
    return buildInitialState(context, this.config, this.timeService, {
      defaultRole: UserRole.ADMIN,
    });
  }

  detectIntent(message: string): OrchestrationResult['intent'] {
    const lower = message.toLowerCase();
    if (/otp|c[oó]digo|pin/.test(lower)) {
      return 'VERIFY_PHONE';
    }
    return 'UNKNOWN';
  }

  getSubAgents(): LlmAgent[] {
    return [
      this.reportingAgent.agent,
      this.appointmentAdminAgent.agent,
      this.reestockAgent.agent,
      this.knowledgeAgent.agent,
      this.salonStylistAgent.agent,
    ];
  }

  getTools(): FunctionTool[] {
    return [this.orchestratorTools.verifyPhoneCodeTool];
  }

  getErrorLogPrefix(): string {
    return 'Error en orquestación interna salón';
  }

  getErrorResponseText(): string {
    return 'Hubo un problema procesando tu solicitud interna. Intenta de nuevo en unos momentos.';
  }

  private logNeedsCalendar(userId: string, companyId: string): void {
    this.logger.log(
      `Admin ${userId} needs to connect Google Calendar for company ${companyId}`,
    );
  }

  private async sendCalendarCta(
    userId: string,
    companyId: string,
    context: RouterMessageContext,
  ): Promise<void> {
    try {
      const authUrl = this.oauthService.getAuthUrl(companyId);
      await this.whatsappResponse.sendCtaLink(
        userId,
        {
          bodyText:
            '⚠️ *Configuración necesaria*\n\nPara gestionar tu empresa, es necesario conectar con tu cuenta de Google.',
          buttonDisplayText: 'Conectar Google',
          buttonUrl: authUrl,
          footerText: 'Cuando termines, vuelve al chat y continúa.',
        },
        {
          phoneNumberId: context.phoneNumberId ?? context.tenant?.phoneNumberId,
          companyId,
        },
      );
      await this.whatsappResponse.sendStickerForEvent(
        userId,
        'error_or_unauthorized_action',
        {
          phoneNumberId: context.phoneNumberId ?? context.tenant?.phoneNumberId,
          companyId,
        },
      );
    } catch (error) {
      this.logger.error(`Error sending auth URL: ${(error as Error).message}`);
      try {
        await this.whatsappResponse.sendStickerForEvent(
          userId,
          'error_or_unauthorized_action',
          {
            phoneNumberId: context.phoneNumberId ?? context.tenant?.phoneNumberId,
            companyId,
          },
        );
      } catch (stickerError) {
        this.logger.error(
          `Error sending error sticker: ${(stickerError as Error).message}`,
        );
      }
    }
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }
}
