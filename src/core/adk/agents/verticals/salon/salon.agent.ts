import { Injectable, Logger, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gemini, LlmAgent } from '@google/adk';
import { SalonToolsService } from './salon.tools';

@Injectable({ scope: Scope.TRANSIENT })
export class SalonStylistAgent {
  private readonly logger = new Logger(SalonStylistAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: SalonToolsService,
  ) {
    const apiKey = this.config.get<string>('GOOGLE_GENAI_API_KEY', '');
    const modelName = this.config.get<string>(
      'GOOGLE_GENAI_MODEL',
      'gemini-2.0-flash',
    );

    if (!apiKey) {
      throw new Error('Google AI no configurado para SalonStylistAgent');
    }

    const model = new Gemini({ apiKey, model: modelName });

    const instruction = `Eres el agente estilista de {app:companyName}.

FUNCIONES PRINCIPALES:
1. Asignación de sillas (assign_salon_chair).
2. Gestión de turnos de peluquería (manage_hairdresser_shifts).

REGLAS:
- Confirma siempre fecha y rango horario antes de ejecutar cambios.
- No inventes disponibilidad de estilistas o sillas.
- Si la integración no está implementada, reporta claramente la limitación.`;

    this.agent = new LlmAgent({
      name: 'salon_stylist_agent',
      model,
      instruction,
      description: 'Agente especializado en operación de salón de belleza',
      tools: this.tools.allTools,
    });

    this.logger.log('Salon Stylist Agent inicializado');
  }
}
