/**
 * Servicio adaptador que conecta WhatsApp con el Orquestador ADK.
 *
 * Este servicio traduce el contexto de mensajes de WhatsApp
 * al formato esperado por el orquestador ADK y viceversa.
 *
 * Reemplaza a AgentRouterService con el patrón multi-agente de Google ADK.
 */
import { Injectable, Logger } from '@nestjs/common';
import { AdkOrchestratorService } from './adk-orchestrator.service';
import { SanitizationService } from '../sanitization/sanitization.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import type {
  AgentMessageContext,
  OrchestrationResult,
  TenantContext,
} from './types/agent.types';
import {
  Intent,
  type RouterMessageContext,
  type RouterResult,
  type SanitizedTextResult,
  type UserRole,
  type RouterAction,
} from '../../types/whatsapp.types';

@Injectable()
export class WhatsappAdkBridgeService {
  private readonly logger = new Logger(WhatsappAdkBridgeService.name);

  constructor(
    private readonly orchestrator: AdkOrchestratorService,
    private readonly sanitizationService: SanitizationService,
    private readonly onboardingService: OnboardingService,
  ) {}

  /**
   * Procesa un mensaje de texto de WhatsApp usando el orquestador ADK.
   * Mantiene compatibilidad con la interfaz RouterResult existente.
   */
  async routeTextMessage(context: RouterMessageContext): Promise<RouterResult> {
    const sanitized = this.sanitizationService.sanitize(context.originalText);

    // Verificar onboarding primero (flujo existente)
    const onboarding = await this.onboardingService.run(context);
    if (onboarding) {
      return {
        role: context.role,
        intent: 'FALLBACK',
        sanitized,
        ...onboarding,
      };
    }

    // Verificar si el orquestador está disponible
    if (!this.orchestrator.isEnabled()) {
      this.logger.warn('Orchestrador ADK no disponible, usando fallback');
      return this.createFallbackResponse(context, sanitized);
    }

    try {
      // Convertir contexto de WhatsApp a contexto de agente ADK
      const agentContext = this.convertToAgentContext(context, sanitized);

      // Procesar mensaje con el orquestador
      const result = await this.orchestrator.processMessage(agentContext);

      // Convertir resultado del orquestador a RouterResult
      return this.convertToRouterResult(context, sanitized, result);
    } catch (error) {
      this.logger.error('Error procesando mensaje con ADK:', error);
      return this.createFallbackResponse(context, sanitized);
    }
  }

  /**
   * Convierte el contexto de WhatsApp al formato del orquestador ADK
   */
  private convertToAgentContext(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
  ): AgentMessageContext {
    const tenantContext: TenantContext = {
      companyId: context.tenant.companyId,
      companyName: context.tenant.companyName,
      companyTone: context.tenant.companyConfig?.profile?.tone || 'profesional',
      currency: context.tenant.companyConfig?.sales_policy?.currency || 'MXN',
      companyConfig: context.tenant.companyConfig,
    };

    // Generar ID de sesión único basado en compañía + usuario
    const sessionId = `${context.tenant.companyId}:${context.senderId}`;

    // Extraer nombre del contacto desde el contexto de sesión ADK
    const sessionContext = context.adkSession?.context as Record<string, unknown> | undefined;
    const senderName = (sessionContext?.contact_name as string) || undefined;

    return {
      sessionId,
      message: sanitized.normalizedText,
      senderPhone: context.senderId,
      senderName,
      userRole: context.role as unknown as import('../agents/types/agent.types').UserRole,
      tenantContext,
      referredProduct: context.referredProduct,
      whatsappMessageId: context.whatsappMessageId,
    };
  }

  /**
   * Convierte el resultado del orquestador al formato RouterResult
   */
  private convertToRouterResult(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
    result: OrchestrationResult,
  ): RouterResult {
    const actions: RouterAction[] = [];

    // Agregar respuesta de texto principal
    if (result.response) {
      actions.push({
        type: 'text',
        text: result.response,
      });
    }

    // Si hay acciones específicas del orquestador
    if (result.metadata?.actions) {
      const orchActions = result.metadata.actions as RouterAction[];
      actions.push(...orchActions);
    }

    return {
      role: context.role,
      intent: this.mapIntentFromOrchestrator(result.intent),
      sanitized,
      actions,
      metadata: {
        agentUsed: result.agentUsed,
        processingTimeMs: result.processingTimeMs,
        sessionId: result.sessionId,
        adkPowered: true,
        ...result.metadata,
      },
    };
  }

  /**
   * Mapea el intent del orquestador al formato de WhatsApp
   */
  private mapIntentFromOrchestrator(intent: string): Intent | 'FALLBACK' {
    const intentMap: Record<string, Intent | 'FALLBACK'> = {
      sales: Intent.SHOPPING,
      appointment: Intent.BOOKING,
      reporting: Intent.REPORTING,
      greeting: 'FALLBACK',
      farewell: 'FALLBACK',
      help: 'FALLBACK',
      general: 'FALLBACK',
      unknown: 'FALLBACK',
      fallback: 'FALLBACK',
    };

    return intentMap[intent.toLowerCase()] || 'FALLBACK';
  }

  /**
   * Crea una respuesta de fallback cuando el orquestador no está disponible
   */
  private createFallbackResponse(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
  ): RouterResult {
    const companyName = context.tenant.companyName || 'nuestro negocio';
    const agentName =
      context.tenant.companyConfig?.profile?.agent_name || 'Asistente';

    return {
      role: context.role,
      intent: 'FALLBACK',
      sanitized,
      actions: [
        {
          type: 'text',
          text: `¡Hola! Soy ${agentName} de ${companyName}. En este momento estoy procesando tu mensaje. ¿En qué puedo ayudarte? Puedo asistirte con:\n\n📅 Agendar citas\n🛍️ Consultar productos\n💳 Procesar pagos`,
        },
      ],
      metadata: {
        fallback: true,
        adkPowered: false,
      },
    };
  }

  /**
   * Verifica si el servicio está habilitado
   */
  isEnabled(): boolean {
    return this.orchestrator.isEnabled();
  }
}
