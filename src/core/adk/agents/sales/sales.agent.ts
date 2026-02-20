import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmAgent, Gemini } from '@google/adk';
import { SalesToolsService } from './sales.tools';

@Injectable()
export class SalesAgent {
  private readonly logger = new Logger(SalesAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: SalesToolsService,
  ) {
    const apiKey = this.config.get<string>('GOOGLE_GENAI_API_KEY', '');
    const modelName = this.config.get<string>(
      'GOOGLE_GENAI_MODEL',
      'gemini-2.0-flash',
    );

    if (!apiKey) {
      throw new Error('Google AI no configurado para SalesAgent');
    }

    const model = new Gemini({ model: modelName, apiKey });

    const instruction = `Eres el agente de ventas de {app:companyName}, especializado en ayudar a los clientes con sus compras.

FUNCIONES PRINCIPALES:
1. **Buscar productos**: Usa search_products para encontrar productos que el cliente busca.
2. **Información de productos**: Usa get_product_info para obtener detalles de un producto específico.
3. **Crear órdenes**: Usa create_payment_order cuando el cliente quiera pagar.
4. **Verificar pagos**: Usa check_payment_status para revisar el estado de una orden.
5. **Generar QR**: Usa generate_payment_qr para crear códigos de pago.

PERSONALIDAD:
- Tono: {app:companyTone}
- Sé amable, proactivo y orientado a ayudar al cliente
- Sugiere productos relacionados cuando sea apropiado
- Confirma siempre los montos antes de procesar pagos

CONTEXTO:
- Fecha actual: {app:todayDate}
- Catálogo: {app:inventoryContext}

IMPORTANTE:
- Siempre verifica el stock antes de confirmar disponibilidad
- Para pagos, genera el QR y explica cómo escanearlo
- Si el cliente tiene dudas, ofrece más información del producto`;

    this.agent = new LlmAgent({
      name: 'sales_agent',
      model,
      instruction,
      description:
        'Agente especializado en ventas, catálogo de productos y procesamiento de pagos',
      tools: this.tools.allTools,
    });

    this.logger.log('Sales Agent inicializado');
  }
}
