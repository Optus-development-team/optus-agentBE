# Arquitectura del Sistema OptSMS Backend con Google ADK + Gemini

## Diagrama General de Flujo

```mermaid
graph TB
    subgraph "Entrada de Mensajes"
        WA[WhatsApp Cloud API<br/>Webhook POST]
        PW[Payment Webhook<br/>Banco QR]
    end

    subgraph "Capa de Resolución Multi-Tenant"
        WCTRL[WhatsappController]
        PWCTRL[PaymentWebhookController]
        IDS[IdentityService]
        SUPABASE[(Supabase PostgreSQL)]
    end

    subgraph "Capa de Sesión y Contexto"
        ADK_SESS[AdkSessionService]
        SESS_DB[(adk_sessions table)]
    end

    subgraph "Google Gemini AI Layer"
        GEMINI[GeminiService]
        GEMINI_API[Google Gemini API<br/>gemini-2.5-flash-lite]
    end

    subgraph "Orquestador Inteligente"
        ROUTER[AgentRouterService]
        SANIT[SanitizationService]
        ONBOARD[OnboardingService]
    end

    subgraph "Agentes Especializados (Gemini-Powered)"
        APPOINT[AppointmentAgent<br/>✨ Gemini NLP]
        SALES[SalesAgent<br/>✨ Gemini NLP]
        REPORT[ReportingAgent<br/>✨ Gemini NLP]
    end

    subgraph "Servicios de Integración"
        GAUTH[GoogleOauthService<br/>Calendar API]
        PAY_CLIENT[PaymentClientService<br/>Banco QR]
        ORDERS_SYNC[OrdersSyncService]
        ENCRYPT[EncryptionService]
    end

    subgraph "Base de Datos Multi-Tenant"
        COMPANIES[("companies<br/>config JSONB")]
        USERS[("company_users")]
        APPOINTMENTS[("appointments")]
        ORDERS[("orders")]
        INTEGRATIONS[("company_integrations")]
    end

    %% Flujo principal
    WA -->|1. Mensaje de usuario| WCTRL
    WCTRL -->|2. phoneNumberId| IDS
    IDS -->|3. SELECT WHERE whatsapp_phone_id| SUPABASE
    SUPABASE -->|4. TenantContext + config| IDS
    IDS -->|5. wa_id + adminPhones| USERS
    USERS -->|6. UserRole| IDS

    WCTRL -->|7. context + role| ADK_SESS
    ADK_SESS <-->|8. Sesión persiste| SESS_DB

    WCTRL -->|9. RouterMessageContext| ROUTER
    ROUTER -->|10. Sanitizar| SANIT
    ROUTER -.->|11. Check OAuth| ONBOARD

    %% Detección de intención con Gemini
    ROUTER -->|12. Detectar intención| GEMINI
    GEMINI -->|13. generateText| GEMINI_API
    GEMINI_API -->|14. Intent detectado| GEMINI
    GEMINI -->|15. Intent| ROUTER

    %% Delegación a agentes
    ROUTER -->|16a. Intent.BOOKING| APPOINT
    ROUTER -->|16b. Intent.SHOPPING| SALES
    ROUTER -->|16c. Intent.REPORTING<br/>(admin only)| REPORT

    %% Agentes usan Gemini
    APPOINT -->|17a. Extraer fecha/hora| GEMINI
    GEMINI -->|Lenguaje natural→JSON| APPOINT
    APPOINT -->|18a. Persistir| APPOINTMENTS

    SALES -->|17b. Extraer monto| GEMINI
    GEMINI -->|"dos mil pesos"→2000| SALES
    SALES -->|18b. Generar QR| PAY_CLIENT
    SALES -->|18c. Sync orden| ORDERS_SYNC
    ORDERS_SYNC -->|18d. INSERT/UPDATE| ORDERS

    REPORT -->|17c. Query metrics| SUPABASE
    SUPABASE -->|18c. Datos reales| REPORT
    REPORT -->|19c. Analizar + generar reporte| GEMINI
    GEMINI -->|Reporte ejecutivo| REPORT

    %% Respuestas
    APPOINT -->|20a. AgentResponse| ROUTER
    SALES -->|20b. AgentResponse| ROUTER
    REPORT -->|20c. AgentResponse| ROUTER

    ROUTER -->|21. RouterResult| WCTRL
    WCTRL -->|22. dispatchAction| WA

    %% Webhooks de pago
    PW -->|Evento QR/2FA| PWCTRL
    PWCTRL -->|Resolver tenant| IDS
    PWCTRL -->|handlePaymentWebhook| SALES
    SALES -->|Actualizar estado| ORDERS

    %% Onboarding OAuth
    ONBOARD -->|generateAuthUrl| GAUTH
    GAUTH -->|Consent URL| ONBOARD
    ONBOARD -->|Redirigir| WA

    %% Estilos
    classDef geminiClass fill:#4285f4,stroke:#1a73e8,color:#fff
    classDef agentClass fill:#34a853,stroke:#0f9d58,color:#fff
    classDef dbClass fill:#ea4335,stroke:#c5221f,color:#fff
    classDef routerClass fill:#fbbc04,stroke:#f9ab00,color:#000

    class GEMINI,GEMINI_API geminiClass
    class APPOINT,SALES,REPORT agentClass
    class SUPABASE,COMPANIES,USERS,APPOINTMENTS,ORDERS,INTEGRATIONS,SESS_DB dbClass
    class ROUTER routerClass
```

## Componentes Clave

### 1. **Google Gemini Integration (Nuevo)**

- **GeminiService**: Wrapper singleton que inicializa el modelo Gemini 2.0 Flash
- **Método principal**: `generateText(prompt: string)` - llamada directa a `Gemini.generateContentAsync()`
- **Configuración**:
  - API Key: `GOOGLE_GENAI_API_KEY`
  - Vertex AI: `GOOGLE_GENAI_USE_VERTEXAI=true` + project/location
- **Uso**: Todos los agentes consumen este servicio para NLP

### 2. **Agent Router (Orquestador con IA)**

- **Detección de intención**: Ya no usa regex, sino **prompt a Gemini** que retorna enum de intents
- **Fallback contextualizado**: Genera respuestas dinámicas usando `companies.config` como contexto
- **Control de acceso**: Valida `UserRole.ADMIN` antes de permitir `Intent.REPORTING` o `Intent.TWO_FA`

### 3. **Agentes Especializados (Gemini-Powered)**

#### **AppointmentAgent**

- **Con Gemini**: Entiende "mañana a las 3", "próximo martes", "en 2 horas"
- **Extrae**: Fecha/hora en JSON estructurado
- **Contexto**: `companies.config.appointment_policy` (duración, buffer, cancelación)
- **Fallback**: Regex tradicional si Gemini no disponible

#### **SalesAgent**

- **Con Gemini**:
  - Extrae montos: "dos mil pesos" → 2000
  - Detecta intención: "quiero pagar" → `checkout`
  - Genera respuestas naturales usando `sales_policy`
- **Estado**: Mantiene máquina de estados (CART → AWAITING_QR → QR_SENT → VERIFYING → COMPLETED)
- **Integración**: Banco QR via PaymentClientService

#### **ReportingAgent**

- **Con Gemini**:
  - Query a Supabase para métricas reales
  - Genera reporte ejecutivo en lenguaje natural
  - Usa `business_info.industry` para personalizar análisis
- **Admin-only**: Bloqueado para roles no-admin en el router

### 4. **Multi-Tenancy & Identity**

- **Resolución por `whatsapp_phone_id`** → Company
- **Role detection**: Admin si `senderId` en `companies.whatsapp_admin_phone_ids` o en `company_users` table
- **wa_id handling**: Extrae de `contacts` array del webhook y usa para matching

### 5. **Session Management**

- **AdkSessionService**: Persistencia en `adk_sessions` table
- **Session ID**: `${companyId}:${senderId}`
- **Context injection**: Config de empresa + role + fecha actual

## Flujo de Datos Detallado

### Caso 1: Usuario Cliente Pide Cita

```
1. Usuario: "Hola quiero una cita mañana a las 3pm"
2. WhatsApp → WhatsappController
3. IdentityService → resolve tenant (phoneNumberId) → role=CLIENT
4. RouterMessageContext creado con tenant.config
5. Router → Gemini: "¿Es BOOKING, SHOPPING, REPORTING o NONE?"
6. Gemini: "BOOKING"
7. Router → AppointmentAgent.handle()
8. AppointmentAgent → Gemini: "Extrae fecha/hora de: 'mañana a las 3pm'"
9. Gemini: { date: "2025-06-XX", time: "15:00", slot_start: "...", slot_end: "..." }
10. AppointmentAgent → INSERT appointments
11. AppointmentAgent → return "Te agendo para mañana 15:00. ¿Confirmas?"
12. WhatsappController → Meta API envía mensaje
```

### Caso 2: Admin Pide Reporte

```
1. Admin: "Dame el reporte del día"
2. IdentityService → role=ADMIN (match en whatsapp_admin_phone_ids)
3. Router → Gemini: detecta "REPORTING"
4. Router → check adminOnlyIntents → ✅ permitido
5. ReportingAgent → Query Supabase (orders hoy, citas, usuarios)
6. ReportingAgent → Gemini: "Genera reporte ejecutivo con estos datos: {metrics}"
7. Gemini: "📊 Reporte Ejecutivo: 5 ventas completadas ($12,000 MXN), 3 citas agendadas..."
8. Return al usuario
```

### Caso 3: Cliente Compra con QR

```
1. Usuario: "Quiero pagar dos mil pesos"
2. Router → Gemini → "SHOPPING"
3. SalesAgent → Gemini extract amount: "dos mil pesos" → 2000
4. SalesAgent → PaymentClientService.generateQr(2000)
5. Estado → AWAITING_QR
6. [Webhook separado] Banco → PaymentWebhookController
7. PaymentWebhookController → IDS resolve tenant
8. PWCTRL → SalesAgent.handlePaymentWebhook(QR_GENERATED)
9. SalesAgent → estado → QR_SENT
10. WhatsappController → envía imagen QR al usuario
```

## Ventajas de la Arquitectura Actual

✅ **100% Gemini-powered** - Todos los agentes usan IA generativa
✅ **Fallback robusto** - Si Gemini falla, usa regex legacy
✅ **Config-aware** - Cada respuesta personalizada por tenant
✅ **Multi-tenant nativo** - Aislamiento total por `company_id`
✅ **Stateful sessions** - ADK sessions persisten en Supabase
✅ **Role-based access** - Admin/Client diferenciados
✅ **Extensible** - Agregar nuevos agentes = nueva clase + registro en router

## Próximas Mejoras Sugeridas

🔄 **Runner Integration**: Usar `@google/adk` Runner para ejecutar LlmAgent con sub_agents hierarchy
🔄 **Vector Memory**: Activar `pgvector` para semantic search de conversaciones pasadas
🔄 **Function Tools**: Convertir agentes a `FunctionTool` para composición más flexible
🔄 **Streaming responses**: SSE para respuestas en tiempo real
