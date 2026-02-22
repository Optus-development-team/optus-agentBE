import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Gemini,
  LlmAgent,
  Runner,
  isFinalResponse,
  stringifyContent,
} from '@google/adk';
import type { RouterMessageContext } from '../../../../features/whatsapp/types/whatsapp.types';
import { UserRole } from '../../../../features/whatsapp/types/whatsapp.types';
import type { OrchestrationResult } from '../orchestrator.types';
import { SupabaseSessionService } from '../../session/supabase-session.service';
import { OrchestratorToolsService } from '../orchestrator.tools';
import { KnowledgeBaseToolsService } from '../../agents/knowledge/knowledge-base.tools';
import { ReportingAgent } from '../../agents/reporting/reporting.agent';
import { AppointmentAdminAgent } from '../../agents/appointment/admin/appointment.agent';
import { ReestockAgent } from '../../agents/reestock/reestock.agent';

import { OAuthService } from '../../../../features/auth/oauth.service';
import { WhatsAppResponseService } from '../../../../features/whatsapp/services/whatsapp-response.service';

@Injectable()
export class CompanyOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(CompanyOrchestratorService.name);
  private readonly appName = 'optus';
  private runner?: Runner;
  private orchestratorAgent?: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly sessionService: SupabaseSessionService,
    private readonly orchestratorTools: OrchestratorToolsService,
    private readonly knowledgeBaseTools: KnowledgeBaseToolsService,
    private readonly reportingAgent: ReportingAgent,
    private readonly appointmentAdminAgent: AppointmentAdminAgent,
    private readonly reestockAgent: ReestockAgent,
    private readonly oauthService: OAuthService,
    private readonly whatsappResponse: WhatsAppResponseService,
  ) {}

  onModuleInit(): void {
    this.initialize();
  }

  async route(context: RouterMessageContext): Promise<OrchestrationResult> {
    this.ensureInitialized();

    const userId = this.normalizePhone(context.senderId);

    // Check for Google Calendar credentials if admin
    if (context.role === UserRole.ADMIN && context.tenant?.companyId) {
      const companyId = context.tenant.companyId;
      const hasCreds = await this.oauthService.checkCredentials(companyId);

      if (!hasCreds) {
        this.logger.log(
          `Admin ${userId} needs to connect Google Calendar for company ${companyId}`,
        );
        try {
          const authUrl = await this.oauthService.getAuthUrl(companyId);
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
              phoneNumberId:
                context.phoneNumberId ?? context.tenant?.phoneNumberId,
              companyId,
            },
          );
          await this.whatsappResponse.sendStickerForEvent(
            userId,
            'error_or_unauthorized_action',
            {
              phoneNumberId:
                context.phoneNumberId ?? context.tenant?.phoneNumberId,
              companyId,
            },
          );
        } catch (error) {
          this.logger.error(
            `Error sending auth URL: ${(error as Error).message}`,
          );
        }
        return {
          intent: 'UNKNOWN',
          responseText:
            'Necesitas completar la conexión con Google Calendar para continuar.',
          agentUsed: 'company_orchestrator',
        };
      }
    }

    const sessionId = `${this.appName}:${userId}`;

    let session = await this.sessionService.getSession({
      appName: this.appName,
      userId,
      sessionId,
    });

    if (!session) {
      session = await this.sessionService.createSession({
        appName: this.appName,
        userId,
        sessionId,
        state: this.buildInitialState(context),
      });
    }

    try {
      const userMessage = {
        role: 'user' as const,
        parts: [{ text: this.buildPrompt(context) }],
      };

      let responseText = '';
      let agentUsed = 'company_orchestrator';

      for await (const event of this.runner!.runAsync({
        userId,
        sessionId,
        newMessage: userMessage,
      })) {
        if (event.author && event.author !== 'user') {
          agentUsed = event.author;
        }

        if (isFinalResponse(event)) {
          responseText = stringifyContent(event);
        }
      }

      return {
        intent: this.detectIntent(context.originalText),
        responseText,
        agentUsed,
        sessionState: (
          await this.sessionService.getSession({
            appName: this.appName,
            userId,
            sessionId,
          })
        )?.state as Record<string, unknown>,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error en orquestación interna: ${err.message}`);
      return {
        intent: 'UNKNOWN',
        responseText:
          'Hubo un problema procesando tu solicitud interna. Intenta de nuevo en unos momentos.',
        agentUsed: 'company_orchestrator',
      };
    }
  }

  private initialize(): void {
    const apiKey = this.config.get<string>('GOOGLE_GENAI_API_KEY', '');
    const modelName = this.config.get<string>(
      'GOOGLE_GENAI_MODEL',
      'gemini-2.0-flash',
    );

    if (!apiKey) {
      throw new Error('Google AI no configurado para CompanyOrchestrator');
    }

    const model = new Gemini({ apiKey, model: modelName });

    const instruction = `Eres el orquestador interno de {app:companyName}. Atiendes al personal administrativo y operativo.

AGENTES DISPONIBLES:
1. reporting_agent: métricas, reportes y KPIs.
2. appointment_agent: gestión de citas internas.
3. reestock_agent: reabastecimiento e inventario.

COMPORTAMIENTO:
- Deriva al agente correcto según la intención.
- Sé preciso y orientado a datos.
- Si falta información, aclara antes de actuar.
- Toma {app:todayDate} como fecha base para las operaciones.
`;

    this.orchestratorAgent = new LlmAgent({
      name: 'company_orchestrator',
      model,
      instruction,
      description: 'Orquestador para equipo interno de la empresa',
      subAgents: [
        this.reportingAgent.agent,
        this.appointmentAdminAgent.agent,
        this.reestockAgent.agent,
      ],
      tools: [
        this.orchestratorTools.verifyPhoneCodeTool,
        ...this.knowledgeBaseTools.tools,
      ],
    });

    this.runner = new Runner({
      agent: this.orchestratorAgent,
      appName: this.appName,
      sessionService: this.sessionService,
    });
  }

  private buildInitialState(
    context: RouterMessageContext,
  ): Record<string, unknown> {
    const companyId =
      context.tenant?.companyId ??
      this.config.get<string>('DEFAULT_COMPANY_ID');
    const companyName =
      context.tenant?.companyName ??
      this.config.get<string>('DEFAULT_COMPANY_NAME', 'Optus') ??
      'Optus';

    return {
      'user:phone': context.senderId,
      'user:role': context.role ?? UserRole.ADMIN,
      'user:name': context.senderName,
      'app:companyId': companyId ?? undefined,
      'app:companyName': companyName,
      'app:companyConfig': context.tenant?.companyConfig ?? {},
      'app:currency':
        this.config.get<string>('DEFAULT_CURRENCY', 'MXN') ?? 'MXN',
      'app:companyTone':
        this.config.get<string>('DEFAULT_COMPANY_TONE', 'profesional') ??
        'profesional',
      'app:phoneNumberId':
        context.tenant?.phoneNumberId ?? context.phoneNumberId ?? undefined,
      'app:displayPhoneNumber': context.tenant?.displayPhoneNumber ?? undefined,
      'app:todayDate': new Date().toISOString().split('T')[0],
    };
  }

  private buildPrompt(context: RouterMessageContext): string {
    const parts: string[] = [];
    parts.push(context.originalText);

    const contextParts: string[] = [];
    contextParts.push(`[Teléfono del usuario: ${context.senderId}]`);

    if (context.role) {
      contextParts.push(`[Rol detectado: ${context.role}]`);
    }

    if (context.tenant?.companyName) {
      contextParts.push(`[Empresa: ${context.tenant.companyName}]`);
    }

    if (context.senderName) {
      contextParts.push(`[Nombre WhatsApp: ${context.senderName}]`);
    }

    if (context.referredProduct) {
      contextParts.push(
        `[Producto referenciado: ${context.referredProduct.productRetailerId}]`,
      );
    }

    if (contextParts.length > 0) {
      parts.push(`\n---\nContexto:\n${contextParts.join('\n')}`);
    }

    return parts.join('\n');
  }

  private detectIntent(message: string): OrchestrationResult['intent'] {
    const lower = message.toLowerCase();
    if (/otp|c[oó]digo|pin/.test(lower)) {
      return 'VERIFY_PHONE';
    }
    return 'UNKNOWN';
  }

  private ensureInitialized(): void {
    if (!this.runner || !this.orchestratorAgent) {
      this.initialize();
    }
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }
}
