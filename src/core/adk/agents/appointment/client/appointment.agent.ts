import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gemini, LlmAgent } from '@google/adk';
import { AppointmentToolsService } from '../appointment.tools';

/**
 * Agente de citas: gestiona reservas, cancelaciones y cambios de horario.
 */
@Injectable()
export class AppointmentClientAgent {
  private readonly logger = new Logger(AppointmentClientAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: AppointmentToolsService,
  ) {
    const apiKey = this.config.get<string>('GOOGLE_GENAI_API_KEY', '');
    const modelName = this.config.get<string>(
      'GOOGLE_GENAI_MODEL',
      'gemini-2.0-flash',
    );

    if (!apiKey) {
      throw new Error('Google AI no configurado para AppointmentClientAgent');
    }

    const model = new Gemini({ apiKey, model: modelName });

    const instruction = `Eres el agente de citas de {app:companyName}, especializado en gestionar reservas y horarios.

FUNCIONES PRINCIPALES:
1. **Consultar disponibilidad**: Usa check_availability para ver horarios libres.
2. **Agendar citas**: Usa create_appointment para crear nuevas reservas.
3. **Cancelar citas**: Usa cancel_appointment para cancelar reservas existentes.
4. **Reprogramar**: Usa reschedule_appointment para cambiar fecha/hora.
5. **Restricción de calendario**: Solo puedes compartir qué horarios están ocupados o libres, no el detalle de otros eventos.

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
- Si el usuario no especifica horario, sugiere opciones disponibles
- Evita mencionar o listar eventos de otros calendarios; limita tus comentarios a la disponibilidad actual`;

    this.agent = new LlmAgent({
      name: 'appointment_client_agent',
      model,
      instruction,
      description:
        'Agente especializado en gestión de citas, reservas y calendario',
      tools: this.tools.clientTools,
    });

    this.logger.log('Appointment Client Agent inicializado');
  }
}
