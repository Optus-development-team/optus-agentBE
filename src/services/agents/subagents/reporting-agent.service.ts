/**
 * Sub-agente de Reportes usando Google ADK.
 *
 * Responsabilidades:
 * - Generar reportes de ventas
 * - Alertas de inventario bajo
 * - Métricas de citas y rendimiento
 * - KPIs del negocio
 *
 * @see https://google.github.io/adk-docs/agents/llm-agents/
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmAgent, Gemini } from '@google/adk';
import { reportingTools } from '../tools/reporting.tools';

@Injectable()
export class ReportingAgentService implements OnModuleInit {
  private readonly logger = new Logger(ReportingAgentService.name);
  private _agent: LlmAgent | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.initializeAgent();
  }

  private initializeAgent(): void {
    const apiKey = this.config.get<string>('GOOGLE_GENAI_API_KEY', '');
    const useVertexAi =
      this.config.get<string>('GOOGLE_GENAI_USE_VERTEXAI') === 'true';
    const modelName = this.config.get<string>(
      'GOOGLE_GENAI_MODEL',
      'gemini-2.0-flash',
    );

    if (!apiKey && !useVertexAi) {
      this.logger.warn(
        'Google AI no configurado. ReportingAgent en modo fallback.',
      );
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

      const instruction = `Eres el agente de reportes y analíticas de {app:companyName}.

FUNCIONES PRINCIPALES:
1. **Métricas diarias**: Usa get_daily_metrics para obtener resumen del día.
2. **Reportes de ventas**: Usa generate_sales_report para reportes detallados.
3. **Alertas de inventario**: Usa get_low_stock_alerts para productos con stock bajo.
4. **Reportes de citas**: Usa get_appointments_report para analítica de reservas.
5. **KPIs del negocio**: Usa get_business_kpis para indicadores clave.

PERSONALIDAD:
- Tono: {app:companyTone}
- Sé analítico y preciso con los datos
- Presenta la información de forma clara y organizada
- Ofrece insights y recomendaciones basadas en los datos

CONTEXTO:
- Fecha actual: {app:todayDate}
- Moneda: {app:currency}

FORMATO DE RESPUESTA:
- Usa emojis para visualizar métricas (📈 📉 ⚠️ ✅)
- Presenta números grandes con formato legible (1,234.56)
- Compara con periodos anteriores cuando sea posible
- Destaca los puntos más importantes primero

RANGOS DE FECHAS SOPORTADOS:
- "today" - Solo hoy
- "yesterday" - Ayer
- "week" - Últimos 7 días
- "month" - Últimos 30 días
- "quarter" - Últimos 90 días

IMPORTANTE:
- Si los datos son preocupantes, sugiere acciones específicas
- Para stock bajo, recomienda cantidad a reabastecer
- Siempre contextualiza los números (comparaciones, tendencias)`;

      this._agent = new LlmAgent({
        name: 'reporting_agent',
        model,
        instruction,
        description:
          'Agente especializado en reportes, métricas y análisis de datos del negocio',
        tools: reportingTools,
      });

      this.logger.log('Reporting Agent inicializado correctamente');
    } catch (error) {
      this.logger.error('Error inicializando Reporting Agent:', error);
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
