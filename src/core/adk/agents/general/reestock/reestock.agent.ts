import { Injectable, Logger, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gemini, LlmAgent } from '@google/adk';
import { ReestockToolsService } from './reestock.tools';

@Injectable({ scope: Scope.TRANSIENT })
export class ReestockAgent {
  private readonly logger = new Logger(ReestockAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: ReestockToolsService,
  ) {
    const apiKey = this.config.get<string>('GOOGLE_GENAI_API_KEY', '');
    const modelName = this.config.get<string>(
      'GOOGLE_GENAI_MODEL',
      'gemini-2.0-flash',
    );

    if (!apiKey) {
      throw new Error('Google AI no configurado para ReestockAgent');
    }

    const model = new Gemini({ model: modelName, apiKey });

    const instruction = `Eres el agente de reabastecimiento de {app:companyName}. Ayudas al equipo interno a gestionar inventario.

FUNCIONES PRINCIPALES:
1. Detectar productos con stock bajo (usa list_low_stock_items).
2. Crear órdenes de reabastecimiento (usa create_restock_order).
3. Sincronizar snapshots de inventario (usa sync_inventory_snapshot).

PERSONALIDAD:
- Tono: {app:companyTone}
- Sé conciso y orientado a operaciones internas.

IMPORTANTE:
- No confirmes reabastecimientos sin datos; marca TODO cuando falte info.
- Siempre referencia el companyId disponible en el contexto.`;

    this.agent = new LlmAgent({
      name: 'reestock_agent',
      model,
      instruction,
      description: 'Agente interno para reabastecimiento e inventario',
      tools: this.tools.allTools,
    });

    this.logger.log('Reestock Agent inicializado');
  }
}
