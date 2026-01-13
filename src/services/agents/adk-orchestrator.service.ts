/**
 * Agente Orquestador Principal usando Google ADK.
 *
 * Implementa el patrón Coordinator/Dispatcher que:
 * - Recibe todos los mensajes entrantes
 * - Analiza la intención del usuario
 * - Delega a los sub-agentes especializados
 * - Mantiene el contexto de la conversación
 *
 * @see https://google.github.io/adk-docs/agents/multi-agents/
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmAgent,
  Gemini,
  InMemorySessionService,
  Runner,
  createSession,
} from '@google/adk';
import type { Session, Event } from '@google/adk';
import type { Content } from '@google/genai';

import { SalesAgentService } from './subagents/sales-agent.service';
import { AppointmentAgentService } from './subagents/appointment-agent.service';
import { ReportingAgentService } from './subagents/reporting-agent.service';
import { AdkSessionService } from './session/adk-session.service';
import type {
  AgentMessageContext,
  OrchestrationResult,
  AgentSessionState,
} from './types/agent.types';

@Injectable()
export class AdkOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(AdkOrchestratorService.name);
  private _orchestrator: LlmAgent | null = null;
  private _runner: Runner | null = null;
  private _sessionService: InMemorySessionService | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly adkSession: AdkSessionService,
    private readonly salesAgent: SalesAgentService,
    private readonly appointmentAgent: AppointmentAgentService,
    private readonly reportingAgent: ReportingAgentService,
  ) {}

  async onModuleInit() {
    await this.initializeOrchestrator();
  }

  private async initializeOrchestrator(): Promise<void> {
    const apiKey = this.config.get<string>('GOOGLE_GENAI_API_KEY', '');
    const useVertexAi =
      this.config.get<string>('GOOGLE_GENAI_USE_VERTEXAI') === 'true';
    const modelName = this.config.get<string>(
      'GOOGLE_GENAI_MODEL',
      'gemini-2.0-flash',
    );

    if (!apiKey && !useVertexAi) {
      this.logger.warn('Google AI no configurado. Orchestrator en modo fallback.');
      return;
    }

    try {
      let model: Gemini;

      if (useVertexAi) {
        const project = this.config.get<string>('GOOGLE_CLOUD_PROJECT');
        const location = this.config.get<string>(
          'GOOGLE_CLOUD_LOCATION',
          'us-central1',
        );

        model = new Gemini({
          model: modelName,
          vertexai: true,
          project,
          location,
        });
      } else {
        model = new Gemini({
          model: modelName,
          apiKey,
        });
      }

      // Recolectar sub-agentes disponibles
      const subAgents: LlmAgent[] = [];

      const salesAgentInstance = this.salesAgent.getAgent();
      if (salesAgentInstance) {
        subAgents.push(salesAgentInstance);
        this.logger.log('Sales Agent registrado en orquestador');
      }

      const appointmentAgentInstance = this.appointmentAgent.getAgent();
      if (appointmentAgentInstance) {
        subAgents.push(appointmentAgentInstance);
        this.logger.log('Appointment Agent registrado en orquestador');
      }

      const reportingAgentInstance = this.reportingAgent.getAgent();
      if (reportingAgentInstance) {
        subAgents.push(reportingAgentInstance);
        this.logger.log('Reporting Agent registrado en orquestador');
      }

      if (subAgents.length === 0) {
        this.logger.warn('No hay sub-agentes disponibles para el orquestador');
        return;
      }

      const instruction = `Eres el asistente principal de {app:companyName}, un orquestador inteligente que coordina múltiples agentes especializados.

AGENTES DISPONIBLES:
1. **sales_agent**: Maneja consultas de productos, precios, pagos e inventario. Delega cuando:
   - El usuario pregunta por productos, precios o disponibilidad
   - Quiere realizar una compra o ver el catálogo
   - Necesita generar QR de pago o verificar estado de pago

2. **appointment_agent**: Gestiona citas y reservas. Delega cuando:
   - El usuario quiere agendar, cancelar o reprogramar citas
   - Pregunta por disponibilidad de horarios
   - Quiere ver sus citas programadas

3. **reporting_agent**: Proporciona métricas y reportes. Delega cuando:
   - El usuario pide reportes de ventas o métricas
   - Pregunta por estadísticas del negocio
   - Necesita alertas de inventario o KPIs

PERSONALIDAD:
- Tono: {app:companyTone}
- Nombre del negocio: {app:companyName}
- Sé amable, eficiente y profesional

COMPORTAMIENTO:
1. Analiza el mensaje del usuario para identificar su intención principal
2. Si es un saludo o conversación general, responde tú directamente
3. Si la intención coincide con un agente especializado, delega la tarea
4. Si no estás seguro, pregunta para clarificar antes de delegar
5. Mantén el contexto de la conversación

EJEMPLOS DE DELEGACIÓN:
- "¿Qué productos tienen?" → sales_agent
- "Quiero agendar una cita para mañana" → appointment_agent
- "¿Cómo van las ventas este mes?" → reporting_agent
- "Hola, ¿cómo estás?" → Responde tú directamente

IMPORTANTE:
- Nunca inventes información sobre productos, precios o disponibilidad
- Si un agente no puede completar una tarea, ofrece alternativas
- Mantén un historial mental de lo que el usuario ha solicitado
- Si el usuario cambia de tema, adapta la conversación suavemente`;

      this._orchestrator = new LlmAgent({
        name: 'optsms_orchestrator',
        model,
        instruction,
        description:
          'Agente orquestador principal que coordina agentes especializados de ventas, citas y reportes',
        subAgents,
      });

      // Crear servicio de sesión en memoria para el Runner
      this._sessionService = new InMemorySessionService();

      // Crear el Runner para ejecutar el agente
      this._runner = new Runner({
        agent: this._orchestrator,
        appName: 'optsms',
        sessionService: this._sessionService,
      });

      this.logger.log(
        `Orchestrator inicializado con ${subAgents.length} sub-agentes`,
      );
    } catch (error) {
      this.logger.error('Error inicializando Orchestrator:', error);
    }
  }

  /**
   * Verifica si el orquestador está disponible
   */
  isEnabled(): boolean {
    return this._orchestrator !== null && this._runner !== null;
  }

  /**
   * Procesa un mensaje del usuario
   */
  async processMessage(
    context: AgentMessageContext,
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();

    // Fallback si el orquestador no está disponible
    if (!this.isEnabled() || !this._runner || !this._sessionService) {
      return this.createFallbackResponse(context, startTime);
    }

    try {
      // Obtener o crear sesión persistente
      const persistentSession = await this.adkSession.getOrCreateSession(
        context.sessionId,
        context.tenantContext.companyId,
      );

      // Preparar estado de la sesión con contexto del tenant
      const sessionState: AgentSessionState = {
        'app:companyId': context.tenantContext.companyId,
        'app:companyName': context.tenantContext.companyName,
        'app:companyTone':
          context.tenantContext.companyTone || 'profesional y amigable',
        'app:currency': context.tenantContext.currency || 'MXN',
        'app:todayDate': new Date().toLocaleDateString('es-MX', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        'user:phone': context.senderPhone,
        'user:name': context.senderName || '',
        'user:role': context.userRole,
        // Restaurar estado previo
        ...persistentSession.state,
      };

      // Crear sesión del Runner usando el helper
      const runnerSession: Session = await this._sessionService.createSession({
        appName: 'optsms',
        userId: context.senderPhone,
        state: sessionState,
      });

      // Crear contenido del mensaje
      const userContent: Content = {
        role: 'user',
        parts: [{ text: context.message }],
      };

      // Ejecutar el agente
      let responseText = '';
      const events = this._runner.runAsync({
        userId: context.senderPhone,
        sessionId: runnerSession.id,
        newMessage: userContent,
      });

      // Procesar eventos del runner
      for await (const event of events) {
        if (event.content?.parts) {
          for (const part of event.content.parts) {
            if ('text' in part && part.text) {
              responseText += part.text;
            }
          }
        }
      }

      // Determinar el agente que respondió
      const delegatedAgent = this.detectDelegatedAgent(responseText);

      // Persistir el estado actualizado
      await this.adkSession.updateState(context.sessionId, sessionState);

      // Registrar evento en la sesión
      await this.adkSession.appendEvent(persistentSession, {
        type: 'message_processed',
        timestamp: new Date().toISOString(),
        userMessage: context.message,
        agentResponse: responseText.substring(0, 500), // Truncar para almacenamiento
        delegatedTo: delegatedAgent,
        processingTimeMs: Date.now() - startTime,
      });

      return {
        success: true,
        response:
          responseText ||
          'Lo siento, no pude procesar tu mensaje. ¿Podrías reformularlo?',
        intent: this.inferIntent(context.message),
        agentUsed: delegatedAgent || 'orchestrator',
        processingTimeMs: Date.now() - startTime,
        sessionId: context.sessionId,
      };
    } catch (error) {
      this.logger.error(`Error procesando mensaje: ${error}`);

      return {
        success: false,
        response:
          'Disculpa, tuve un problema técnico. ¿Podrías intentar de nuevo?',
        intent: 'UNKNOWN',
        agentUsed: 'none',
        processingTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Error desconocido',
        sessionId: context.sessionId,
      };
    }
  }

  /**
   * Detecta a qué sub-agente se delegó la respuesta
   */
  private detectDelegatedAgent(response: string): string | null {
    const lowerResponse = response.toLowerCase();

    // Patrones heurísticos para detectar delegación
    if (
      lowerResponse.includes('producto') ||
      lowerResponse.includes('precio') ||
      lowerResponse.includes('pago') ||
      lowerResponse.includes('inventario')
    ) {
      return 'sales_agent';
    }

    if (
      lowerResponse.includes('cita') ||
      lowerResponse.includes('horario') ||
      lowerResponse.includes('reserv') ||
      lowerResponse.includes('disponibilidad')
    ) {
      return 'appointment_agent';
    }

    if (
      lowerResponse.includes('reporte') ||
      lowerResponse.includes('métrica') ||
      lowerResponse.includes('estadística') ||
      lowerResponse.includes('kpi')
    ) {
      return 'reporting_agent';
    }

    return null;
  }

  /**
   * Infiere la intención del mensaje del usuario
   */
  private inferIntent(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (/hola|buenos días|buenas tardes|buenas noches|hey/.test(lowerMessage)) {
      return 'GREETING';
    }
    if (/producto|precio|comprar|catálogo|inventario/.test(lowerMessage)) {
      return 'SHOPPING';
    }
    if (/cita|reserv|agendar|horario|disponible/.test(lowerMessage)) {
      return 'BOOKING';
    }
    if (/reporte|métrica|estadística|ventas del|resumen/.test(lowerMessage)) {
      return 'REPORTING';
    }
    if (/gracias|adiós|hasta luego|bye/.test(lowerMessage)) {
      return 'FAREWELL';
    }
    if (/ayuda|help|qué puedes hacer/.test(lowerMessage)) {
      return 'HELP';
    }

    return 'GENERAL';
  }

  /**
   * Respuesta de fallback cuando el orquestador no está disponible
   */
  private createFallbackResponse(
    context: AgentMessageContext,
    startTime: number,
  ): OrchestrationResult {
    const companyName =
      context.tenantContext.companyName || 'nuestro negocio';

    return {
      success: true,
      response: `¡Hola! Gracias por contactar a ${companyName}. En este momento nuestro asistente está en mantenimiento. Por favor, intenta más tarde o contacta directamente con nosotros.`,
      intent: 'FALLBACK',
      agentUsed: 'none',
      processingTimeMs: Date.now() - startTime,
      sessionId: context.sessionId,
    };
  }

  /**
   * Obtiene el agente orquestador
   */
  getOrchestrator(): LlmAgent | null {
    return this._orchestrator;
  }

  /**
   * Obtiene el runner
   */
  getRunner(): Runner | null {
    return this._runner;
  }
}
