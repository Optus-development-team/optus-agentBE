import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmAgent, Gemini } from '@google/adk';
import { ReportingToolsService } from './reporting.tools';

@Injectable()
export class ReportingAgent {
  private readonly logger = new Logger(ReportingAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: ReportingToolsService,
  ) {
    const apiKey = this.config.get<string>('GOOGLE_GENAI_API_KEY', '');
    const modelName = this.config.get<string>(
      'GOOGLE_GENAI_MODEL',
      'gemini-2.0-flash',
    );

    if (!apiKey) {
      throw new Error('Google AI no configurado para ReportingAgent');
    }

    const model = new Gemini({ model: modelName, apiKey });

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

    this.agent = new LlmAgent({
      name: 'reporting_agent',
      model,
      instruction,
      description:
        'Agente especializado en reportes, métricas y análisis del negocio',
      tools: this.tools.allTools,
    });

    this.logger.log('Reporting Agent inicializado');
  }
}
