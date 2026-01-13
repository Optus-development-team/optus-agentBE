/**
 * Sub-agente de Ventas usando Google ADK.
 *
 * Responsabilidades:
 * - Buscar productos en el catálogo
 * - Gestionar órdenes de compra
 * - Procesar pagos y generar QRs
 * - Sincronizar inventario con Meta
 *
 * @see https://google.github.io/adk-docs/agents/llm-agents/
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmAgent, Gemini } from '@google/adk';
import { salesTools } from '../tools/sales.tools';

@Injectable()
export class SalesAgentService implements OnModuleInit {
  private readonly logger = new Logger(SalesAgentService.name);
  readonly agent!: LlmAgent;
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
      this.logger.warn('Google AI no configurado. SalesAgent en modo fallback.');
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

      this._agent = new LlmAgent({
        name: 'sales_agent',
        model,
        instruction,
        description: 'Agente especializado en ventas, catálogo de productos y procesamiento de pagos',
        tools: salesTools,
      });

      // Asignar al readonly usando Object.defineProperty
      Object.defineProperty(this, 'agent', {
        value: this._agent,
        writable: false,
      });

      this.logger.log('Sales Agent inicializado correctamente');
    } catch (error) {
      this.logger.error('Error inicializando Sales Agent:', error);
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
