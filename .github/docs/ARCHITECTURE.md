# Arquitectura del Sistema OptSMS Backend con Google ADK + Gemini

## Diagrama General de Flujo

```mermaid
graph TB
    subgraph "Entrada de Mensajes"
        WA[WhatsApp Cloud API<br/>Webhook POST]
        PW[Payment Webhook<br/>Circle USDC]
    end

    subgraph "Capa de Resolución Multi-Tenant"
        WCTRL[WhatsappController]
        PWCTRL[PaymentWebhookController]
        IDS[IdentityService]
        SUPABASE[(Supabase PostgreSQL)]
    end

    subgraph "Capa de Sesión ADK"
        ADK_SESS[AdkSessionService]
        SESS_DB[(adk_sessions table)]
    end

    subgraph "Google Gemini AI Layer"
        GEMINI[GeminiService]
        GEMINI_API[Google Gemini API<br/>gemini-2.0-flash]
    end

    subgraph "Orquestador ADK (LlmAgent)"
        ORCH[AdkOrchestratorService<br/>🤖 Coordinator Pattern]
        ADK_BRIDGE[WhatsappAdkBridgeService]
        SANIT[SanitizationService]
        ONBOARD[OnboardingService]
    end

    subgraph "Sub-Agentes ADK Especializados"
        SALES[SalesAgentService<br/>🛒 LlmAgent + Tools]
        APPOINT[AppointmentAgentService<br/>📅 LlmAgent + Tools]
        REPORT[ReportingAgentService<br/>📊 LlmAgent + Tools]
    end

    subgraph "Servicios de Negocio"
        META_CAT[MetaCatalogService<br/>Productos WhatsApp]
        PAY_CLIENT[PaymentClientService<br/>Circle USDC]
        GAUTH[GoogleOauthService<br/>Calendar API]
        ORDERS_SYNC[OrdersSyncService]
        SHEETS_SYNC[SheetsSyncService]
        ENCRYPT[EncryptionService]
    end

    subgraph "Base de Datos Multi-Tenant"
        COMPANIES[("companies<br/>business_catalog_id")]
        USERS[("company_users")]
        PRODUCTS[("products<br/>Meta Catalog")]
        APPOINTMENTS[("appointments")]
        ORDERS[("orders")]
        INTEGRATIONS[("company_integrations")]
        DYNAMIC[("entity_definitions<br/>dynamic_records")]
    end

    %% Flujo principal WhatsApp
    WA -->|1. Mensaje entrante| WCTRL
    WCTRL -->|2. phoneNumberId| IDS
    IDS -->|3. Resolve Tenant| SUPABASE
    SUPABASE -->|4. TenantContext| IDS
    IDS -->|5. Ensure User| USERS
    USERS -->|6. UserRole| IDS

    WCTRL -->|7. Build Context| ADK_SESS
    ADK_SESS <-->|8. Persist/Load| SESS_DB

    WCTRL -->|9. WhatsAppMessage| ADK_BRIDGE
    ADK_BRIDGE -->|10. Sanitize PII| SANIT
    ADK_BRIDGE -.->|11. OAuth Check| ONBOARD

    %% Flujo Orquestador ADK
    ADK_BRIDGE -->|12. AgentMessageContext| ORCH
    ORCH -->|13. Runner.runAsync()| GEMINI
    GEMINI -->|14. Analyze Intent| GEMINI_API
    GEMINI_API -->|15. Intent Decision| GEMINI

    %% Delegación a Sub-Agentes
    ORCH -->|16a. Delegate SHOPPING| SALES
    ORCH -->|16b. Delegate BOOKING| APPOINT
    ORCH -->|16c. Delegate REPORTING| REPORT

    %% Sales Agent Tools
    SALES -->|17a. search_products| META_CAT
    META_CAT <-->|Sync| PRODUCTS
    SALES -->|17b. create_payment| PAY_CLIENT
    SALES -->|17c. sync_order| ORDERS_SYNC
    ORDERS_SYNC -->|Insert/Update| ORDERS

    %% Appointment Agent Tools
    APPOINT -->|18a. check_availability| APPOINTMENTS
    APPOINT -->|18b. create_event| GAUTH
    APPOINT -->|18c. save_appointment| APPOINTMENTS

    %% Reporting Agent Tools
    REPORT -->|19a. query_metrics| ORDERS
    REPORT -->|19b. query_sheets_data| DYNAMIC
    REPORT -->|19c. generate_report| GEMINI

    %% Respuestas
    SALES -->|20a. ToolResult| ORCH
    APPOINT -->|20b. ToolResult| ORCH
    REPORT -->|20c. ToolResult| ORCH

    ORCH -->|21. OrchestrationResult| ADK_BRIDGE
    ADK_BRIDGE -->|22. RouterAction[]| WCTRL
    WCTRL -->|23. Send to WhatsApp| WA

    %% Webhooks de pago Circle
    PW -->|Circle Settlement| PWCTRL
    PWCTRL -->|Resolve Order| SALES
    SALES -->|Update State| ORDERS

    %% Sincronización Sheets
    SHEETS_SYNC -->|Wipe & Replace| DYNAMIC
    SHEETS_SYNC -->|Schema Sample| DYNAMIC

    %% Estilos
    classDef geminiClass fill:#4285f4,stroke:#1a73e8,color:#fff
    classDef adkClass fill:#34a853,stroke:#0f9d58,color:#fff
    classDef dbClass fill:#ea4335,stroke:#c5221f,color:#fff
    classDef orchClass fill:#fbbc04,stroke:#f9ab00,color:#000

    class GEMINI,GEMINI_API geminiClass
    class ORCH,SALES,APPOINT,REPORT,ADK_BRIDGE adkClass
    class SUPABASE,COMPANIES,USERS,PRODUCTS,APPOINTMENTS,ORDERS,INTEGRATIONS,SESS_DB,DYNAMIC dbClass
    class ORCH orchClass
```

## Componentes Clave

### 1. **Google ADK Multi-Agent System** 🤖

La arquitectura ahora usa **Google Agent Development Kit (ADK)** con el patrón Coordinator/Dispatcher:

- **AdkOrchestratorService**: LlmAgent principal que coordina sub-agentes
- **Modelo**: `gemini-2.0-flash` (configurable vía `GOOGLE_GENAI_MODEL`)
- **Sub-agentes registrados**:
  - `SalesAgentService` → Ventas, productos, pagos
  - `AppointmentAgentService` → Citas, calendario
  - `ReportingAgentService` → Métricas, reportes
- **Runner**: Ejecuta agentes con `runAsync()` para procesamiento streaming
- **InMemorySessionService**: Gestión de sesiones del runner
- **Tools**: Cada agente tiene herramientas especializadas (`salesTools`, `appointmentTools`, etc.)

### 2. **WhatsApp-ADK Bridge**

- **WhatsappAdkBridgeService**: Puente entre WhatsApp y el sistema ADK
- **Traduce**: `WhatsAppIncomingMessage` → `AgentMessageContext`
- **Sanitización**: PII removal antes de enviar a agentes
- **Enriquecimiento**: Agrega contexto de tenant, usuario, sesión
- **Post-procesamiento**: Convierte `OrchestrationResult` → `RouterAction[]`

### 3. **Sub-Agentes ADK (LlmAgent + FunctionTools)**

#### **SalesAgentService** 🛒

**Tools disponibles**:
- `search_products` - Búsqueda en catálogo Meta/Supabase
- `get_product_info` - Detalles de producto específico
- `create_payment_order` - Genera orden de pago Circle USDC
- `check_payment_status` - Verifica estado de transacción
- `sync_inventory_to_meta` - Sube productos a Meta Catalog
- `sync_inventory_from_meta` - Descarga productos desde Meta

**Flujo de pago**:
1. Usuario: "Quiero comprar X por $500"
2. Agent → `create_payment_order` tool
3. PaymentClientService → Circle USDC API
4. Retorna link de pago
5. Notifica usuario

**Estado de orden**: `CART → AWAITING_PAYMENT → PAID → COMPLETED`

#### **AppointmentAgentService** 📅

**Tools disponibles**:
- `check_availability` - Verifica slots disponibles
- `create_appointment` - Agenda cita
- `cancel_appointment` - Cancela cita existente
- `list_appointments` - Lista citas del usuario

**Integración Google Calendar**:
- OAuth 2.0 vía `GoogleOauthService`
- Refresh tokens encriptados en `company_integrations`
- Onboarding automático si no hay tokens

#### **ReportingAgentService** 📊

**Tools disponibles**:
- `get_sales_metrics` - Métricas de ventas
- `get_appointment_stats` - Estadísticas de citas
- `query_dynamic_data` - Consulta datos de Google Sheets
- `generate_executive_report` - Reporte completo

**Solo Admin**: Validado en orquestador antes de delegar

### 4. **Meta Catalog Integration**

- **MetaCatalogService**: Sincronización bidireccional con Meta Business Catalog
- **Auto-sync al inicio**: `CATALOG_SYNC_ON_STARTUP=true`
- **Batch API**: Actualizaciones en lotes de 50 productos
- **Tabla products**: 
  - `id` (SKU/retailer_id)
  - `company_id` (multi-tenant)
  - `name`, `price`, `stock_quantity`, `is_available`
  - Índices full-text para búsqueda

**Flujo de sincronización**:
```
Supabase products → MetaCatalogService.syncInventoryToMeta()
                  → POST graph.facebook.com/{catalog_id}/batch
                  
Meta Catalog → MetaCatalogService.syncInventoryFromMeta()
             → Upsert en Supabase products table
```

### 5. **Google Sheets Knowledge Base**

- **SheetsSyncService**: Sincronización desde Google Workspace Add-on
- **Estrategia**: Wipe & Replace (elimina registros antiguos, inserta nuevos)
- **Tablas**:
  - `entity_definitions` - Schema de cada hoja (entity_name, schema_sample)
  - `dynamic_records` - Datos JSONB con full-text search
- **Privacidad**: Flag `is_public_default` por entity

**Uso en agentes**:
```typescript
// ReportingAgent puede consultar datos de Sheets
query_dynamic_data({ entity_name: "Clientes", search: "Juan" })
```

### 6. **Payment Integration: Circle USDC**

- **PaymentClientService**: Cliente para Circle API (stablecoins USDC)
- **Flujo simplificado**:
  1. Crear payment intent → Circle API
  2. Retornar link de pago al usuario
  3. Webhook Circle → `PaymentWebhookController`
  4. Actualizar orden en Supabase
  
**No más QR bancarios**: Migración completa a Circle para pagos estables

### 7. **Multi-Tenancy & Identity**

- **IdentityService.resolveTenantByPhoneId()**:
  - `phone_number_id` → Company lookup
  - Auto-registro de usuarios entrantes como `CLIENT`
  - Admins designados manualmente en `company_users`
  
- **TenantContext**:
  ```typescript
  {
    companyId: UUID,
    companyName: string,
    companyTone: string,  // personalidad del agente
    currency: string,     // MXN, USD, etc.
    phoneNumberId: string
  }
  ```

### 8. **ADK Session Persistence**

- **AdkSessionService**: Persiste estado conversacional
- **Tabla `adk_sessions`**:
  - `session_id` - `${companyId}:${userPhone}`
  - `state` - JSONB con variables de contexto
  - `history` - Array de eventos
  - `last_activity` - Timestamp
  
- **State variables inyectadas**:
  ```typescript
  {
    'app:companyId': '...',
    'app:companyName': '...',
    'app:companyTone': 'profesional y amigable',
    'app:currency': 'MXN',
    'app:todayDate': 'jueves, 23 de enero de 2026',
    'user:phone': '+52...',
    'user:role': 'ROLE_CLIENT'
  }
  ```

## Flujo de Datos Detallado

### Caso 1: Usuario Cliente Compra con Circle USDC

```
1. Usuario: "Quiero comprar Producto X por $500"
   
2. WhatsApp → WhatsappController.receiveWebhook()
   ├─→ Normaliza payload Meta
   └─→ WhatsappService.processIncomingMessage()

3. IdentityService
   ├─→ resolveTenantByPhoneId(phone_number_id) → Company
   ├─→ ensureUserExists(wa_id) → company_users (role=CLIENT)
   └─→ Retorna TenantContext

4. WhatsappAdkBridgeService.processMessage()
   ├─→ SanitizationService.sanitize() → PII removal
   ├─→ AdkSessionService.getOrCreateSession() → Carga/crea sesión
   └─→ Construye AgentMessageContext

5. AdkOrchestratorService.processMessage()
   ├─→ Runner.runAsync() con session state
   ├─→ Gemini analiza: "Usuario quiere comprar" → Intent: SHOPPING
   └─→ Delega a sales_agent

6. SalesAgentService (LlmAgent)
   ├─→ Tool: search_products({ query: "Producto X" })
   │   └─→ MetaCatalogService → Supabase products table
   │       └─→ Retorna: { id: "SKU123", name: "Producto X", price: 500 }
   │
   ├─→ Tool: create_payment_order({ amount: 500, details: "Producto X" })
   │   └─→ PaymentClientService.createCirclePayment()
   │       ├─→ POST https://api.circle.com/v1/payments
   │       └─→ Retorna: { payment_id, payment_link }
   │
   └─→ Genera respuesta natural:
       "Perfecto! Encontré Producto X por $500. 
        Para pagar con USDC, usa este link: https://pay.circle.com/xxx"

7. OrchestrationResult → WhatsappAdkBridgeService
   └─→ Convierte a RouterAction[]

8. WhatsappService.sendTextMessage() → Meta API
   └─→ Usuario recibe mensaje con link de pago

--- WEBHOOK SEPARADO ---

9. Usuario completa pago en Circle → Circle Webhook
   └─→ POST /webhook/payments/result

10. PaymentWebhookController.handlePaymentEvent()
    ├─→ IdentityService.resolveTenantByOrderId()
    └─→ SalesAgentService.handlePaymentWebhook({ event: 'PAID' })
        ├─→ Actualiza estado orden: AWAITING_PAYMENT → PAID
        ├─→ OrdersSyncService.syncToSupabase()
        └─→ Retorna texto confirmación

11. WhatsappService.sendTextMessage()
    └─→ "✅ Pago confirmado! Tu pedido está en proceso."
```

### Caso 2: Admin Solicita Reporte (con OAuth)

```
1. Admin: "Dame el reporte de ventas de hoy"

2. WhatsApp → IdentityService
   ├─→ resolveTenantByPhoneId()
   └─→ Verifica rol: senderId en company_users.role='ADMIN' → ✅

3. AdkOrchestratorService
   ├─→ Detecta Intent: REPORTING
   ├─→ Valida: userRole === ADMIN → ✅
   └─→ Delega a reporting_agent

4. OnboardingService.run()
   ├─→ CompanyIntegrationsService.hasGoogleCalendar()
   └─→ NO tiene tokens → Genera OAuth URL

5. GoogleOauthService.buildConsentUrl()
   ├─→ state: { company_id, admin_phone } (base64)
   └─→ Retorna: https://accounts.google.com/o/oauth2/auth?...

6. Respuesta al admin:
   "Para acceder a reportes, vincula tu Google Calendar:"
   [Link OAuth]

--- USUARIO COMPLETA OAUTH EN BROWSER ---

7. Redirect → GET /auth/google/callback?code=xxx&state=yyy

8. GoogleAuthController.handleCallback()
   ├─→ Decodifica state → { company_id, admin_phone }
   ├─→ GoogleOauthService.exchangeCode(code)
   │   └─→ { access_token, refresh_token }
   ├─→ EncryptionService.encrypt(refresh_token)
   └─→ CompanyIntegrationsService.saveGoogleTokens()
       └─→ UPDATE company_integrations

9. Responde: "✅ Cuenta vinculada. Vuelve a WhatsApp y repite tu solicitud."

--- USUARIO REPITE SOLICITUD ---

10. Admin: "Dame el reporte de ventas de hoy"

11. ReportingAgentService (ahora con OAuth)
    ├─→ Tool: get_sales_metrics({ date: 'today' })
    │   └─→ Query Supabase orders WHERE created_at::date = CURRENT_DATE
    │       └─→ { total: 5, revenue: 12500, avg_ticket: 2500 }
    │
    ├─→ Tool: get_appointment_stats({ date: 'today' })
    │   └─→ Query appointments table
    │       └─→ { scheduled: 3, completed: 2, canceled: 0 }
    │
    └─→ Tool: generate_executive_report()
        └─→ Gemini genera resumen narrativo

12. Respuesta:
    "📊 Reporte Ejecutivo - 23 Enero 2026
    
    💰 Ventas: 5 órdenes completadas ($12,500 MXN)
    📈 Ticket promedio: $2,500
    
    📅 Citas: 3 programadas, 2 completadas
    
    🎯 Observaciones: Día productivo, mantén este ritmo!"
```

### Caso 3: Sincronización Meta Catalog (Automática)

```
1. Backend inicia → main.ts bootstrap()
   └─→ NestJS carga WhatsappModule

2. MetaCatalogService.onModuleInit()
   ├─→ Check: CATALOG_SYNC_ON_STARTUP=true
   └─→ syncAllCatalogs()

3. Query Supabase:
   SELECT id, business_catalog_id 
   FROM companies 
   WHERE business_catalog_id IS NOT NULL

4. Para cada compañía con catalog_id:
   └─→ syncInventoryFromMeta(company_id)
       ├─→ GET https://graph.facebook.com/v24.0/{catalog_id}/products
       │   └─→ Retorna: [{ retailer_id, name, price, availability, ... }]
       │
       └─→ Para cada producto Meta:
           ├─→ Mapea a schema Supabase:
           │   { id: retailer_id, company_id, name, price, is_available }
           │
           └─→ INSERT ... ON CONFLICT (id, company_id) DO UPDATE
               └─→ Upsert en tabla products

5. Log: "Catálogo de {company_id} sincronizado: 45 productos"
```

### Caso 4: Sincronización Google Sheets → Knowledge Base

```
1. Google Workspace Add-on (Sidebar.html)
   ├─→ Usuario selecciona Sheet "Clientes"
   ├─→ Marca checkbox "Datos públicos"
   └─→ Click "Sincronizar"

2. Apps Script (Code.gs)
   ├─→ Lee headers: ['Nombre', 'Teléfono', 'Email', 'Ciudad']
   ├─→ Lee filas: [{ Nombre: 'Juan', Teléfono: '+52...', ... }, ...]
   └─→ POST /sheets-sync
       Body: {
         company_id: "uuid",
         sheet_name: "Clientes",
         is_public: true,
         data: [{ Nombre: 'Juan', ... }, ...]
       }

3. SheetsSyncController → SheetsSyncService.syncSheetData()

4. SheetsSyncService
   ├─→ verifyCompanyExists(company_id) → ✅
   │
   ├─→ upsertEntityDefinition()
   │   ├─→ entity_name: "Clientes"
   │   ├─→ schema_sample: { Nombre: "string", Teléfono: "string", ... }
   │   └─→ INSERT ... ON CONFLICT DO UPDATE is_public_default=true
   │       └─→ Retorna entity_definition_id
   │
   ├─→ deleteOldRecords(entity_definition_id)
   │   └─→ DELETE FROM dynamic_records WHERE entity_definition_id=xxx
   │
   └─→ insertNewRecords()
       └─→ Para cada fila:
           ├─→ data: JSONB de la fila
           ├─→ search_text: "juan +52... email ciudad" (para full-text)
           └─→ INSERT dynamic_records

5. Respuesta: { success: true, records_synced: 150 }

--- USO POR AGENTES ---

6. Usuario admin: "¿Cuántos clientes tenemos en Guadalajara?"

7. ReportingAgentService
   └─→ Tool: query_dynamic_data({ 
         entity_name: "Clientes", 
         search: "Guadalajara" 
       })
       └─→ Query Supabase:
           SELECT data 
           FROM dynamic_records dr
           JOIN entity_definitions ed ON ed.id = dr.entity_definition_id
           WHERE ed.entity_name = 'Clientes'
             AND dr.search_text @@ to_tsquery('Guadalajara')
           
           └─→ Retorna: 12 registros

8. Respuesta: "Tienes 12 clientes en Guadalajara según tu base de datos."
```

## Ventajas de la Arquitectura Actual

✅ **Google ADK Native** - Sistema multi-agente usando LlmAgent + Runner pattern oficial
✅ **Coordinator Pattern** - Orquestador inteligente que delega a sub-agentes especializados
✅ **Function Tools** - Capacidades extendibles mediante herramientas (search_products, create_payment, etc.)
✅ **Session Persistence** - Estado conversacional guardado en Supabase
✅ **Multi-tenant** - Aislamiento completo por empresa (company_id)
✅ **Role-based Access** - Admin/Client con validación en orquestador
✅ **Meta Catalog Integration** - Sincronización bidireccional con WhatsApp Business Catalog
✅ **Google Sheets Knowledge** - Base de conocimiento dinámica con full-text search
✅ **Circle USDC Payments** - Pagos estables en blockchain sin volatilidad
✅ **PII Sanitization** - Protección de datos sensibles antes de enviar a IA
✅ **Extensible** - Nuevos agentes = nueva clase + registro en orquestador
✅ **Streaming Ready** - Runner.runAsync() permite respuestas en tiempo real
✅ **Fallback Robust** - Si Gemini falla, usa lógica estática

## Stack Tecnológico

### Backend
- **NestJS** 11.x - Framework principal
- **TypeScript** 5.7.x - Tipado estático
- **Google ADK** 0.1.x - Sistema multi-agente
- **Gemini AI** 2.0-flash - Modelo LLM
- **Node.js** 22.x - Runtime

### Base de Datos
- **Supabase** - PostgreSQL managed
- **pgbouncer** - Connection pooling (puerto 6543)
- **pg** - Driver PostgreSQL
- **Full-text search** - Índices GIN para búsqueda en español

### Integraciones
- **WhatsApp Cloud API** v24.0 - Mensajería
- **Meta Graph API** v24.0 - Catalog management
- **Circle API** - Pagos USDC
- **Google Calendar API** - Gestión de citas
- **Google Sheets API** - Knowledge base sync
- **Pinata IPFS** - Storage descentralizado

### DevOps
- **Chokidar** - File watcher (.env hot reload)
- **Swagger/OpenAPI** - Documentación interactiva
- **ESLint + Prettier** - Code quality
- **Jest** - Testing framework

## Estructura de Directorios

```
src/
├── main.ts                          # Bootstrap + Swagger + .env watcher
├── app.module.ts                    # Módulo raíz
├── whatsapp.module.ts               # Módulo principal con todos los providers
│
├── controllers/                     # Capa de entrada (REST endpoints)
│   ├── whatsapp.controller.ts       # GET/POST /webhook (Meta verification)
│   ├── payment-webhook.controller.ts # POST /webhook/payments/result
│   ├── google-auth.controller.ts    # GET /auth/google/callback
│   ├── sheets-sync.controller.ts    # POST /sheets-sync
│   ├── catalog-test.controller.ts   # Testing Meta catalog
│   └── payment-proxy.controller.ts  # Proxy pagos
│
├── dto/                             # Data Transfer Objects (validación)
│   ├── whatsapp-webhook.dto.ts      # Webhooks Meta
│   ├── meta-catalog.dto.ts          # Catálogo Meta
│   ├── payment-webhook.dto.ts       # Pagos Circle
│   ├── sheets-sync.dto.ts           # Google Sheets
│   └── send-*.dto.ts                # Mensajes WhatsApp
│
├── services/
│   ├── agents/                      # Sistema ADK multi-agente
│   │   ├── adk-orchestrator.service.ts      # Orquestador principal
│   │   ├── whatsapp-adk-bridge.service.ts   # Puente WhatsApp-ADK
│   │   ├── session/
│   │   │   └── adk-session.service.ts       # Persistencia sesiones
│   │   ├── subagents/
│   │   │   ├── sales-agent.service.ts       # Ventas + pagos
│   │   │   ├── appointment-agent.service.ts # Citas
│   │   │   └── reporting-agent.service.ts   # Reportes
│   │   └── tools/                           # Function tools
│   │       ├── sales.tools.ts
│   │       ├── appointment.tools.ts
│   │       ├── reporting.tools.ts
│   │       └── knowledge-base.tools.ts
│   │
│   ├── whatsapp/
│   │   └── whatsapp.service.ts      # Envío/recepción mensajes
│   │
│   ├── meta/whatsapp/
│   │   └── meta-catalog.service.ts  # Sincronización catálogo
│   │
│   ├── payments/
│   │   └── payment-client.service.ts # Circle USDC API
│   │
│   ├── google/
│   │   └── google-oauth.service.ts  # OAuth Calendar
│   │
│   ├── sheets-sync/
│   │   └── sheets-sync.service.ts   # Sincronización Sheets
│   │
│   ├── gemini/
│   │   └── gemini.service.ts        # Wrapper Gemini AI
│   │
│   ├── database/
│   │   └── supabase.service.ts      # Pool PostgreSQL
│   │
│   ├── encryption/
│   │   └── encryption.service.ts    # AES-256 para tokens
│   │
│   ├── sanitization/
│   │   └── sanitization.service.ts  # PII removal
│   │
│   ├── identity/
│   │   └── identity.service.ts      # Multi-tenant resolution
│   │
│   ├── integrations/
│   │   └── company-integrations.service.ts
│   │
│   ├── onboarding/
│   │   └── onboarding.service.ts
│   │
│   ├── orders/
│   │   └── orders-sync.service.ts
│   │
│   └── pinata/
│       └── pinata.service.ts
│
└── types/
    ├── whatsapp.interface.ts        # Interfaces WhatsApp API
    ├── whatsapp.types.ts            # Tipos de dominio
    └── agents/
        └── agent.types.ts           # Tipos sistema ADK
```

## Decisiones de Diseño Clave

### 1. ¿Por qué Google ADK en lugar de LangChain?

- **Oficial de Google**: Mejor integración con Gemini
- **Runner pattern**: Manejo nativo de streaming
- **InMemorySessionService**: Gestión de sesiones built-in
- **Function Tools**: Composición más limpia que LangChain chains
- **TypeScript-first**: Tipado fuerte sin wrappers

### 2. ¿Por qué Circle en lugar de bancos tradicionales?

- **Stablecoins**: Sin volatilidad (USDC = $1 USD)
- **Global**: Funciona en cualquier país sin banking
- **Instant settlement**: Confirmación en minutos
- **API simple**: RESTful sin complicaciones bancarias legacy
- **On-chain verifiable**: Transacciones auditables en blockchain

### 3. ¿Por qué Supabase en lugar de Prisma/TypeORM?

- **Managed PostgreSQL**: No gestionar infraestructura DB
- **pgbouncer incluido**: Connection pooling out-of-the-box
- **Real-time subscriptions**: Potencial para features futuras
- **Full-text search nativo**: pg_trgm + GIN indexes
- **Row Level Security**: Multi-tenancy a nivel DB
- **Edge Functions**: Posible extensión serverless

### 4. ¿Por qué NestJS en lugar de Express/Fastify?

- **Dependency Injection**: Inyección automática de servicios
- **Módulos**: Organización escalable
- **Decorators**: Validación declarativa (DTOs)
- **Swagger integrado**: Documentación automática
- **Testing utilities**: TestingModule para unit tests
- **Enterprise-ready**: Arquitectura probada en producción

## Próximas Mejoras Sugeridas

### Corto Plazo
🔹 **Tests E2E**: Implementar suite de tests con `@nestjs/testing`
🔹 **Rate Limiting**: Protección contra abuse en webhooks
🔹 **Logging estructurado**: Winston/Pino con contexto de tenant
🔹 **Health checks**: Endpoints `/health` y `/metrics`

### Mediano Plazo
🔸 **Vector Memory**: `pgvector` para búsqueda semántica de conversaciones
🔸 **Caching**: Redis para sesiones ADK + productos Meta
🔸 **Queue system**: BullMQ para procesamiento async de pagos
🔸 **Webhooks retry**: Reintentos automáticos con exponential backoff

### Largo Plazo
🔶 **Multi-channel**: Telegram, Instagram DM, Messenger
🔶 **Analytics dashboard**: Métricas de agentes + conversiones
🔶 **A/B testing**: Variantes de personalidad de agentes
🔶 **Voice integration**: Whisper API para mensajes de voz

## Variables de Entorno Críticas

```bash
# Google Gemini AI (OBLIGATORIO)
GOOGLE_GENAI_API_KEY=AIzaSy...
GOOGLE_GENAI_MODEL=gemini-2.0-flash

# WhatsApp Cloud API
WHATSAPP_API_VERSION=v24.0
WHATSAPP_PHONE_NUMBER_ID=123456789  # Fallback
META_API_TOKEN=EAAxxxxx

# Supabase (Multi-tenant DB)
SUPABASE_DB_URL=postgresql://postgres.xxxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Circle Payments (USDC)
PAYMENT_BACKEND_URL=https://api.circle.com
PAYMENT_API_KEY=tu-circle-api-key

# Google OAuth (Calendar)
GOOGLE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_OAUTH_REDIRECT_URI=https://tu-dominio.com/auth/google/callback

# Meta Catalog
CATALOG_SYNC_ON_STARTUP=true
```

---

**Última actualización**: Enero 2026  
**Versión ADK**: 0.1.3  
**Modelo Gemini**: 2.0-flash
