/**
 * Sub-agente de Citas usando Google ADK.
 *
 * Responsabilidades:
 * - Consultar disponibilidad de horarios
 * - Agendar nuevas citas
 * - Cancelar y reprogramar citas
 * - Sincronizar con Google Calendar
 *
 * @see https://google.github.io/adk-docs/agents/llm-agents/
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmAgent, Gemini } from '@google/adk';
import { appointmentTools } from '../tools/appointment.tools';

@Injectable()
export class AppointmentAgentService implements OnModuleInit {
  private readonly logger = new Logger(AppointmentAgentService.name);
  private _agent: LlmAgent | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.initializeAgent();
  }

  private initializeAgent(): void {
    const apiKey = this.config.get<string>('GOOGLE_GENAI_API_KEY', '');
    const useVertexAi = this.config.get<string>('GOOGLE_GENAI_USE_VERTEXAI') === 'true';
    const modelName = this.config.get<string>('GOOGLE_GENAI_MODEL', 'gemini-2.0-flash');

    if (!apiKey && !useVertexAi) {
      this.logger.warn('Google AI no configurado. AppointmentAgent en modo fallback.');
      return;
    }

    try {
      let model: Gemini;

      if (useVertexAi) {
        const project = this.config.get<string>('GOOGLE_CLOUD_PROJECT');
        const location = this.config.get<string>('GOOGLE_CLOUD_LOCATION', 'us-central1');

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

      const instruction = `Eres el agente de citas de {app:companyName}, especializado en gestionar reservas y horarios.

FUNCIONES PRINCIPALES:
1. **Consultar disponibilidad**: Usa check_availability para ver horarios libres.
2. **Agendar citas**: Usa create_appointment para crear nuevas reservas.
3. **Cancelar citas**: Usa cancel_appointment para cancelar reservas existentes.
4. **Reprogramar**: Usa reschedule_appointment para cambiar fecha/hora.
5. **Listar citas**: Usa list_user_appointments para ver las citas del usuario.

PERSONALIDAD:
- Tono: {app:companyTone}
- Sé organizado y claro con las fechas y horarios
- Siempre confirma la fecha y hora antes de agendar
- Ofrece alternativas si el horario solicitado no está disponible

CONTEXTO:
- Fecha actual: {app:todayDate}
- Acepta lenguaje natural para fechas (mañana, próximo lunes, etc.)

FORMATO DE RESPUESTA:
- Usa formato de 24 horas para claridad
- Confirma siempre: fecha, hora de inicio y duración
- Ofrece recordatorio de la política de cancelación cuando sea relevante

IMPORTANTE:
- No confirmes citas sin verificar disponibilidad primero
- Para cancelaciones, pregunta el motivo para mejorar el servicio
- Si el usuario no especifica horario, sugiere opciones disponibles`;

      this._agent = new LlmAgent({
        name: 'appointment_agent',
        model,
        instruction,
        description: 'Agente especializado en gestión de citas, reservas y calendario',
        tools: appointmentTools,
      });

      this.logger.log('Appointment Agent inicializado correctamente');
    } catch (error) {
      this.logger.error('Error inicializando Appointment Agent:', error);
    }
  }

  /**
   * Verifica si el agente está disponible
   */
  isEnabled(): boolean {
    return this._agent !== null;
  }

  /**
   * Obtiene el agente LLM
   */
  getAgent(): LlmAgent | null {
    return this._agent;
  }
}
