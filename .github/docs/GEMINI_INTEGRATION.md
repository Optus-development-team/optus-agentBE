# Integración Google ADK + Gemini

## Resumen

Este proyecto usa **Google Application Development Kit (ADK)** para integrar **Gemini 2.0 Flash** en todos los agentes conversacionales. Los agentes comprenden lenguaje natural, extraen entidades complejas y generan respuestas contextualizadas según la configuración multi-tenant.

## Arquitectura

### GeminiService (Core)

**Ubicación**: `src/whatsapp/services/gemini.service.ts`

**Responsabilidades**:

- Inicializar modelo Gemini en `onModuleInit()`
- Wrapper simplificado `generateText(prompt: string)` para llamadas directas
- Manejo de errores y fallback graceful

**Configuración**:

```typescript
// API Key (desarrollo)
new Gemini({
  model: 'gemini-2.5-flash-lite',
  apiKey: process.env.GOOGLE_GENAI_API_KEY,
});

// Vertex AI (producción)
new Gemini({
  model: 'gemini-2.5-flash-lite',
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION,
});
```

### Patrón de Integración

```typescript
// Patrón estándar en todos los agentes
if (this.geminiService.isEnabled()) {
  return this.handleWithGemini(context, sanitized);
}
return this.handleWithFallback(context, sanitized);
```

**Ventajas**:

- ✅ Degradación automática a regex si Gemini falla
- ✅ No rompe funcionalidad existente
- ✅ Permite testing sin credenciales

## Casos de Uso por Agente

### 1. AgentRouterService (Orquestador)

#### Detección de Intención

**Antes (regex estático)**:

```typescript
if (/(cita|agenda)/.test(text)) return Intent.BOOKING;
```

**Ahora (Gemini)**:

```typescript
const prompt = `Eres ${agentName}. Analiza: "${text}"
Intenciones: BOOKING (citas), SHOPPING (compras), REPORTING (reportes), TWO_FA (códigos)
Responde SOLO: BOOKING, SHOPPING, REPORTING, TWO_FA o NONE`;

const result = await this.geminiService.generateText(prompt);
if (result?.includes('BOOKING')) return Intent.BOOKING;
```

**Casos que maneja**:

- ✅ "Necesito una cita" → BOOKING
- ✅ "Quiero agendar algo" → BOOKING
- ✅ "Cuánto cuesta" → SHOPPING
- ✅ "Dame números del negocio" → REPORTING (admin)

#### Respuesta Fallback

**Antes**: Concatenación manual de config
**Ahora**: Respuesta natural con contexto

```typescript
const instruction = `Eres ${agentName}, ${persona}. Tono: ${tone}.

Contexto empresa:
- Nombre: ${companyName}
- Propuesta: ${value_proposition}
- Envío: ${delivery_cost}

Usuario: "${text}"

Genera respuesta natural (max 3-4 líneas) que:
1. Responda al mensaje
2. Mencione capacidades (citas/productos)
3. Invite a continuar
4. NO copies literalmente los campos de config
`;

const response = await this.geminiService.generateText(instruction);
```

### 2. AppointmentAgentService

#### Extracción de Fecha/Hora

**Antes**: Regex `\d{1,2}[:.]\d{2}`
**Ahora**: NLP avanzado

```typescript
const instruction = `Eres ${agentName}, especialista en citas.

Hoy: ${today}
Políticas:
- Duración: ${slotDuration} minutos
- Buffer: ${buffer} minutos

Usuario: "${text}"

Extrae fecha/hora (acepta "mañana", "próximo martes", "3pm")
Si no hay, sugiere siguiente día hábil

JSON:
{
  "response_text": "confirma en español",
  "extracted_date": "YYYY-MM-DD o null",
  "extracted_time": "HH:MM o null",
  "slot_start_iso": "ISO8601",
  "slot_end_iso": "ISO8601"
}
`;

const result = await this.geminiService.generateText(instruction);
const parsed = JSON.parse(result.match(/\{[\s\S]*\}/)[0]);
```

**Casos que maneja**:

- ✅ "mañana a las 3" → {date: "2025-06-12", time: "15:00"}
- ✅ "próximo martes" → calcula fecha correcta
- ✅ "en 2 horas" → suma al timestamp actual

### 3. SalesAgentService

#### Extracción de Monto

**Antes**: Regex `/\d+(?:\.\d{2})?/`
**Ahora**: Lenguaje natural

```typescript
const instruction = `Extrae monto monetario del texto.

Ejemplos:
- "quiero pagar 1500" → 1500
- "serían 25 dólares" → 25
- "son dos mil pesos" → 2000

Texto: "${text}"
Responde SOLO número (sin símbolo) o "null"
`;

const result = await this.geminiService.generateText(instruction);
const amount = parseFloat(result);
```

**Casos que maneja**:

- ✅ "dos mil quinientos" → 2500
- ✅ "25.50" → 25.5
- ✅ "veinticinco pesos" → 25

#### Detección de Intención de Compra

```typescript
const instruction = `Detecta intención en contexto compra.

Estado orden: ${currentState}

Intenciones:
- checkout: quiere generar QR/pagar
- confirm_paid: dice que ya pagó
- status: pregunta estado
- other: otra cosa

Texto: "${text}"
Responde: checkout, confirm_paid, status, other
`;
```

#### Generación de Respuestas

```typescript
const instruction = `Eres ${agentName}, especialista ventas. Tono: ${tone}.

Políticas:
${salesPolicy.delivery_cost ? `- Envío: ${delivery_cost}` : ''}
${salesPolicy.refund_policy ? `- Devoluciones: ${refund_policy}` : ''}

Situación: ${situation}
Estado orden: ${orderState}

Genera respuesta natural, breve (max 2 líneas) en español.
`;
```

### 4. ReportingAgentService

#### Análisis de Métricas

**Antes**: Valores hardcodeados "modo demo"
**Ahora**: Query real a Supabase + análisis IA

```typescript
// 1. Query métricas reales
const metrics = await this.fetchRealMetrics(companyId);
// → { ordersToday: 5, ordersPending: 2, appointmentsToday: 3 }

// 2. Prompt Gemini con datos
const instruction = `Eres ${agentName}, analista de datos.

Industria: ${industry}
Empresa: ${companyName}

Datos actuales:
- Órdenes completadas hoy: ${metrics.ordersToday}
- Órdenes pendientes: ${metrics.ordersPending}
- Citas hoy: ${metrics.appointmentsToday}
- Citas próximas: ${metrics.appointmentsUpcoming}

Admin pidió: "${text}"

Genera reporte ejecutivo claro:
1. Resume métricas en lista
2. Identifica tendencias/alertas
3. Tono profesional pero accesible
4. Max 5-6 líneas
5. Usa emojis relevantes
`;

const report = await this.geminiService.generateText(instruction);
```

**Casos que maneja**:

- ✅ "Dame el reporte" → genera resumen ejecutivo
- ✅ "Cómo van las ventas" → analiza órdenes
- ✅ "Cuántas citas tengo" → resume agenda

## Manejo de Errores

### 1. Gemini No Disponible

```typescript
if (!this.geminiService.isEnabled()) {
  this.logger.warn('Gemini no disponible, usando regex fallback');
  return this.detectIntentFallback(text);
}
```

### 2. Error en Generación

```typescript
try {
  const result = await this.geminiService.generateText(prompt);
  return result;
} catch (error) {
  this.logger.error('Error en Gemini:', error);
  return this.generateFallbackResponse(situation);
}
```

### 3. Respuesta Inválida

```typescript
// Si Gemini retorna JSON malformado
try {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
} catch {
  this.logger.warn('JSON inválido de Gemini, usando default');
  parsed = { response_text: 'Entendido...' };
}
```

## Contexto Multi-Tenant

Todos los prompts incluyen config de la empresa:

```typescript
const config = context.tenant.companyConfig;
const profile = config?.profile || {};
const salesPolicy = config?.sales_policy || {};
const ops = config?.operational_rules || {};

const agentName = profile.agent_name || 'asistente';
const tone = profile.tone || 'amigable y profesional';
```

**Ejemplo**: Empresa "Boutique Elegance" vs "Taller Mecánico":

- Boutique: tono sofisticado, menciona envíos gratis, reembolsos 30 días
- Taller: tono técnico, horarios turno completo, garantía piezas

## Testing

### Sin Credenciales

```bash
# No configurar GOOGLE_GENAI_API_KEY
npm run start:dev
# → Agents usan regex legacy, funcional
```

### Con Credenciales

```bash
export GOOGLE_GENAI_API_KEY="AIzaSy..."
npm run start:dev
# → Gemini activo, respuestas con IA
```

### Verificar Logs

```
[GeminiService] Gemini inicializado con API Key
[AgentRouterService] Intent detectado con Gemini: BOOKING
[AppointmentAgentService] Fecha extraída por Gemini: 2025-06-12
```

## Límites y Consideraciones

### Rate Limits

- **API Key (gratuita)**: 15 RPM, 1500 RPD
- **Vertex AI**: 60 RPM (configurable)
- **Solución**: Implementar caching de respuestas comunes

### Latencia

- **Promedio**: 500-1500ms por llamada
- **Solución**: Streaming responses (TODO), respuestas parciales

### Costo

- **API Key**: Gratis hasta 1M tokens/mes
- **Vertex AI**: ~$0.00025/1K tokens input, ~$0.001/1K tokens output
- **Presupuesto mensual estimado** (1000 usuarios activos): $50-100 USD

### Privacidad

- **Datos enviados**: Solo mensajes del usuario + config de empresa
- **NO se envía**: Datos personales sensibles, tokens bancarios
- **Cumplimiento**: Usar Vertex AI en región EU para GDPR

## Próximos Pasos

### Fase 2: Runner Integration

```typescript
import { Runner, LlmAgent } from '@google/adk';

const appointmentAgent = new LlmAgent({
  name: 'appointment_agent',
  model: 'gemini-2.5-flash-lite',
  instruction: '...',
  tools: [checkAvailabilityTool],
});

const runner = new Runner({
  agent: appointmentAgent,
  sessionService: new InMemorySessionService(),
});

for await (const event of runner.runAsync({
  userId: senderId,
  sessionId,
  newMessage: { role: 'user', parts: [{ text }] },
})) {
  // Procesar eventos en streaming
}
```

### Fase 3: Sub-Agents Hierarchy

```typescript
const rootAgent = new LlmAgent({
  name: 'coordinator',
  model: 'gemini-2.5-flash-lite',
  description: 'Coordinador multi-tenant',
  sub_agents: [appointmentAgent, salesAgent, reportingAgent],
  // → transfer_to_agent automático
});
```

### Fase 4: Function Tools

```typescript
const saveAppointmentTool = new FunctionTool({
  name: 'save_appointment',
  description: 'Guarda cita en Supabase',
  parameters: z.object({
    date: z.string(),
    time: z.string(),
    userId: z.string()
  }),
  execute: async ({date, time, userId}) => {
    await supabase.insert({ ... });
    return 'Cita guardada';
  }
});

const appointmentAgent = new LlmAgent({
  tools: [saveAppointmentTool]
});
```

## Referencias

- [Google ADK Docs](https://google.github.io/adk-docs/)
- [ADK TypeScript GitHub](https://github.com/google/adk-js)
- [Gemini API Docs](https://ai.google.dev/docs)
- [Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing)
