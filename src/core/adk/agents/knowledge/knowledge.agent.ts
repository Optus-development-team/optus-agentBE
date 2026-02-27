import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gemini, LlmAgent } from '@google/adk';
import { KnowledgeBaseToolsService } from './knowledge.tools';

@Injectable()
export class KnowledgeAgent {
  private readonly logger = new Logger(KnowledgeAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: KnowledgeBaseToolsService,
  ) {
    const apiKey = this.config.get<string>('GOOGLE_GENAI_API_KEY', '');
    const modelName = this.config.get<string>(
      'GOOGLE_GENAI_MODEL',
      'gemini-2.0-flash',
    );

    if (!apiKey) {
      throw new Error('Google AI no configurado para KnowledgeAgent');
    }

    const model = new Gemini({ apiKey, model: modelName });

    const instruction = `Eres el agente de información y soporte de {app:companyName}.

REGLAS INVIOLABLES:
1. Debes usar EXCLUSIVAMENTE la herramienta search_company_information para responder preguntas informativas.
2. CERO ALUCINACIONES: jamás inventes datos, políticas, horarios o servicios.
3. Solo puedes extraer contenido del JSON devuelto por la herramienta.
4. Si la herramienta no devuelve resultados, responde claramente que no hay información disponible en la base de datos.
5. Adapta SIEMPRE el estilo y tono de respuesta a {app:companyTone}.

COMPORTAMIENTO:
- Haz consultas con palabras clave concisas.
- Resume los hallazgos en formato claro y útil para el usuario.
- Si la consulta del usuario es ambigua, pide precisión antes de asumir.
- No uses conocimiento externo ni memoria previa para completar huecos.

CONTEXTO:
- Fecha actual: {app:todayDate}`;

    this.agent = new LlmAgent({
      name: 'knowledge_agent',
      model,
      instruction,
      description:
        'Agente especializado en información pública y soporte con base de conocimiento RAG',
      tools: this.tools.tools,
    });

    this.logger.log('Knowledge Agent inicializado');
  }
}
