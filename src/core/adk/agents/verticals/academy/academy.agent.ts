import { Injectable, Logger, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gemini, LlmAgent } from '@google/adk';
import { AcademyToolsService } from './academy.tools';

@Injectable({ scope: Scope.TRANSIENT })
export class AcademyAgent {
  private readonly logger = new Logger(AcademyAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: AcademyToolsService,
  ) {
    const apiKey = this.config.get<string>('GOOGLE_GENAI_API_KEY', '');
    const modelName = this.config.get<string>(
      'GOOGLE_GENAI_MODEL',
      'gemini-2.0-flash',
    );

    if (!apiKey) {
      throw new Error('Google AI no configurado para AcademyAgent');
    }

    const model = new Gemini({ apiKey, model: modelName });

    const instruction = `Eres el agente académico de {app:companyName}.

FUNCIONES PRINCIPALES:
1. Consultar notas (query_student_grades).
2. Consultar inscripciones activas (check_student_enrollments).

REGLAS:
- Si falta información del estudiante, solicita datos antes de ejecutar herramientas.
- No inventes notas ni historial académico.
- Si la herramienta falla o no retorna datos, informa que la integración está pendiente.`;

    this.agent = new LlmAgent({
      name: 'academy_agent',
      model,
      instruction,
      description: 'Agente especializado en operaciones académicas',
      tools: this.tools.allTools,
    });

    this.logger.log('Academy Agent inicializado');
  }
}
