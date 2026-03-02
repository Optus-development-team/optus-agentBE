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
import { SalesAgent } from '../../agents/sales/sales.agent';
import { AppointmentClientAgent } from '../../agents/appointment/client/appointment.agent';
import { KnowledgeAgent } from '../../agents/knowledge/knowledge.agent';
import { TimeService } from '../../../../common/time/time.service';
@Injectable()
export class ClientOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(ClientOrchestratorService.name);
  private readonly appName = 'optus';
  private runner?: Runner;
  private orchestratorAgent?: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly sessionService: SupabaseSessionService,
    private readonly orchestratorTools: OrchestratorToolsService,
    private readonly salesAgent: SalesAgent,
    private readonly appointmentClientAgent: AppointmentClientAgent,
    private readonly knowledgeAgent: KnowledgeAgent,
    private readonly timeService: TimeService,
  ) {}

  onModuleInit(): void {
    this.initialize();
  }

  async route(context: RouterMessageContext): Promise<OrchestrationResult> {
    this.ensureInitialized();

    const userId = this.normalizePhone(context.senderId);
    const tenantAppName = context.tenant.companyName.trim().toLowerCase();
    const sessionId = `${tenantAppName}:${userId}`;

    let session = await this.sessionService.getSession({
      appName: tenantAppName,
      userId,
      sessionId,
    });

    if (!session) {
      session = await this.sessionService.createSession({
        appName: tenantAppName,
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
      let agentUsed = 'client_orchestrator';

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
            appName: tenantAppName,
            userId,
            sessionId,
          })
        )?.state as Record<string, unknown>,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error en orquestación de cliente: ${err.message}`);
      return {
        intent: 'UNKNOWN',
        responseText:
          'Ocurrió un error procesando tu mensaje. Intenta nuevamente en unos momentos.',
        agentUsed: 'client_orchestrator',
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
      throw new Error('Google AI no configurado para ClientOrchestrator');
    }

    const model = new Gemini({ apiKey, model: modelName });

    const instruction = `Eres el orquestador de clientes de {app:companyName}. Coordina a los agentes especializados para ayudar al cliente.

AGENTES DISPONIBLES:
3. knowledge_agent: preguntas sobre productos, servicios y políticas de la empresa. (Ej. horarios, materias, ubicaciones, etc).
1. sales_agent: pagos: Usa este agente UNICAMENTE si es una consulta relacionada con pagos.
2. appointment_agent: agenda, cancelación y reprogramación de citas.

COMPORTAMIENTO:
- Detecta intención y deriva al agente correcto.
- Si es saludo o duda general, responde breve y profesional.
- No inventes precios ni disponibilidad; usa herramientas del agente.
- Toma {app:todayDate} como fecha base para las operaciones.
`;

    this.orchestratorAgent = new LlmAgent({
      name: 'client_orchestrator',
      model,
      instruction,
      description: 'Orquestador para clientes finales',
      subAgents: [
        this.salesAgent.agent,
        this.appointmentClientAgent.agent,
        this.knowledgeAgent.agent,
      ],
      tools: [this.orchestratorTools.verifyPhoneCodeTool],
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
    const userPhone = context.senderId;
    const timezone = this.timeService.getTimezone(userPhone);

    return {
      'user:phone': userPhone,
      'user:role': context.role ?? UserRole.CLIENT,
      'user:name': context.senderName,
      'app:companyId': companyId ?? undefined,
      'app:companyName': companyName,
      'app:companyConfig': context.tenant?.companyConfig ?? {},
      'app:currency':
        this.config.get<string>('DEFAULT_CURRENCY', 'USD') ?? 'USD',
      'app:companyTone':
        this.config.get<string>('DEFAULT_COMPANY_TONE', 'profesional') ??
        'profesional',
      'app:phoneNumberId':
        context.tenant?.phoneNumberId ?? context.phoneNumberId ?? undefined,
      'app:displayPhoneNumber': context.tenant?.displayPhoneNumber ?? undefined,
      'app:todayDate': this.timeService.getTodayDate(userPhone),
      'app:currentDateTime': this.timeService.getCurrentDateTime(userPhone),
      'app:timezone': timezone,
      'app:inventoryContext': '',
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
