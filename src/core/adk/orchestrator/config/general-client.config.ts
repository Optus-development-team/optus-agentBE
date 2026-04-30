import { Injectable } from '@nestjs/common';
import type { FunctionTool, LlmAgent } from '@google/adk';
import { ConfigService } from '@nestjs/config';
import type { RouterMessageContext } from '../../../../features/messaging/features/whatsapp/types/whatsapp.types';
import { UserRole } from '../../../../features/messaging/features/whatsapp/types/whatsapp.types';
import type { OrchestrationResult } from '../orchestrator.types';
import type { OrchestratorConfig } from './orchestrator.config';
import { OrchestratorToolsService } from '../orchestrator.tools';
import { SalesAgent } from '../agents/general/sales/sales.agent';
import { AppointmentClientAgent } from '../agents/general/appointment/client/appointment.agent';
import { KnowledgeAgent } from '../agents/general/knowledge/knowledge.agent';
import { TimeService } from '../../../../common/time/time.service';

@Injectable()
export class GeneralClientOrchestratorConfig implements OrchestratorConfig {
  constructor(
    private readonly config: ConfigService,
    private readonly orchestratorTools: OrchestratorToolsService,
    private readonly salesAgent: SalesAgent,
    private readonly appointmentClientAgent: AppointmentClientAgent,
    private readonly knowledgeAgent: KnowledgeAgent,
    private readonly timeService: TimeService,
  ) {}

  getName(): string {
    return 'general_client_orchestrator';
  }

  getDescription(): string {
    return 'Orquestador para clientes finales';
  }

  buildInstruction(): string {
    return `Eres el orquestador de clientes de {app:companyName} pero de cara al cliente eres un empleado mas, nunca menciones que eres un asistente virtual a no ser que te pregunten explicitamente. Coordina a los agentes especializados para ayudar al cliente.

AGENTES DISPONIBLES:
3. knowledge_agent: preguntas sobre productos, servicios y politicas de la empresa. (Ej. horarios, materias, ubicaciones, etc).
1. sales_agent: pagos: Usa este agente UNICAMENTE si es una consulta relacionada con pagos.
2. appointment_agent: agenda, cancelacion y reprogramacion de citas.

COMPORTAMIENTO:
- Detecta intencion y deriva al agente correcto.
- Si es saludo o duda general, responde breve y profesional.
- No inventes precios ni disponibilidad; usa herramientas del agente.
- Toma {app:todayDate} como fecha base para las operaciones.
`;
  }

  buildPrompt(context: RouterMessageContext): string {
    const parts: string[] = [];
    parts.push(context.originalText);

    const contextParts: string[] = [];
    contextParts.push(`[Telefono del usuario: ${context.senderId}]`);

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

  buildInitialState(context: RouterMessageContext): Record<string, unknown> {
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

  detectIntent(message: string): OrchestrationResult['intent'] {
    const lower = message.toLowerCase();
    if (/otp|c[oó]digo|pin/.test(lower)) {
      return 'VERIFY_PHONE';
    }
    return 'UNKNOWN';
  }

  getSubAgents(): LlmAgent[] {
    return [
      this.salesAgent.agent,
      this.appointmentClientAgent.agent,
      this.knowledgeAgent.agent,
    ];
  }

  getTools(): FunctionTool[] {
    return [this.orchestratorTools.verifyPhoneCodeTool];
  }

  getErrorLogPrefix(): string {
    return 'Error en orquestacion de cliente';
  }

  getErrorResponseText(): string {
    return 'Ocurrio un error procesando tu mensaje. Intenta nuevamente en unos momentos.';
  }
}
