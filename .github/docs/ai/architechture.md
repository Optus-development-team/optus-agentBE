# Arquitectura del Sistema Agéntico de Optus

Este documento describe la arquitectura global del sistema agéntico multi-tenant de Optus, basado en **Google Agent Development Kit (ADK)** y **NestJS**. Explica el flujo de información de extremo a extremo, desde la recepción de eventos por WhatsApp hasta la ejecución de subagentes especializados, ejecución de herramientas (tools), persistencia de contexto y formateo estructurado de respuestas.

---

## 1. Índice de Documentación Técnica Agéntica

Para detalles exhaustivos de cada componente de la arquitectura agéntica, consulta los siguientes documentos dedicados:

- **[Flujo General del Sistema Agéntico (este documento)](file:///.github/docs/ai/architechture.md)**: Visión global, enrutamiento, ciclo de vida del mensaje y diagramas end-to-end.
- **[Arquitectura de Agentes de Orquestación](file:///.github/docs/ai/orchestrators-architecture.md)**: Detalle técnico de orquestadores, clases base, configs, builders de estado/input, ciclo del Runner y sesiones.
- **[Arquitectura del Código de Subagentes](file:///.github/docs/ai/subagents-architecture.md)**: Detalle del patrón Transient, factories, configs especializadas, instructions, inyección de herramientas e prompts.
- **[Arquitectura de Tools](file:///.github/docs/ai/tools-architecture.md)**: Detalle de diseño de herramientas, integración con ADK `FunctionTool`, Zod, `ToolContext`, eventos reactivos y servicios externos.
- **[Catálogo y Referencia Completa de Tools](file:///.github/docs/ai/tools-reference.md)**: Listado exhaustivo de todas las herramientas, parámetros Zod, tipos, retornos y estado de implementación.

---

## 2. Diagrama de Arquitectura Global

```mermaid
graph TD
    %% Capa de Entrada
    WA[Webhook WhatsApp Meta] --> InboundController[WhatsApp Webhook Controller Service]
    InboundController --> BurstBuffer[Burst Debounce Buffer\n3000ms agregador de mensajes]
    BurstBuffer --> IdentityTenant[Identity & Tenant Resolver\nIdentificación de Empresa y Rol]
    
    %% Capa de Despacho
    IdentityTenant --> GlobalDisp[AdkOrchestratorService\nDespachador Global]
    
    %% Enrutamiento por Vertical y Rol
    GlobalDisp -- Vertical: Academy | Rol: CLIENT --> AcadClient[AcademyClientOrchestratorService]
    GlobalDisp -- Vertical: Academy | Rol: ADMIN --> AcadAdmin[AcademyAdminOrchestratorService]
    
    GlobalDisp -- Vertical: Salon | Rol: CLIENT --> SalonClient[SalonClientOrchestratorService]
    GlobalDisp -- Vertical: Salon | Rol: ADMIN --> SalonAdmin[SalonAdminOrchestratorService]
    
    GlobalDisp -- Vertical: General | Rol: CLIENT --> GenClient[GeneralClientOrchestratorService]
    GlobalDisp -- Vertical: General | Rol: ADMIN --> GenAdmin[GeneralAdminOrchestratorService]
    
    %% Módulo Academia
    subgraph Modulo Academia [Vertical Academia]
        AcadClient --> AcadClientSub[KnowledgeAgent\nAppointmentClientAgent\nSalesAgent]
        AcadAdmin --> AcadAdminSub[ReportingAgent\nAppointmentAdminAgent\nReestockAgent\nKnowledgeAgent\nAcademyAgent]
    end
    
    %% Módulo Salón
    subgraph Modulo Salon [Vertical Salon de Belleza]
        SalonClient --> SalonClientSub[KnowledgeAgent\nAppointmentClientAgent\nSalesAgent]
        SalonAdmin --> SalonAdminSub[ReportingAgent\nAppointmentAdminAgent\nReestockAgent\nKnowledgeAgent\nSalonStylistAgent]
    end

    %% Módulo General
    subgraph Modulo General [Vertical General]
        GenClient --> GenClientSub[SalesAgent\nAppointmentClientAgent\nKnowledgeAgent]
        GenAdmin --> GenAdminSub[ReportingAgent\nAppointmentAdminAgent\nReestockAgent]
    end

    %% Capa de Herramientas
    subgraph Capa de Herramientas Logicas
        SharedTools[Tools Compartidas:\n- create_payment_order\n- check_payment_status\n- generate_payment_qr\n- check_availability\n- create_appointment\n- cancel_appointment\n- reschedule_appointment\n- list_user_appointments\n- get_daily_metrics\n- generate_sales_report\n- get_low_stock_alerts\n- get_appointments_report\n- get_business_kpis\n- verify_phone_code]
        KnowledgeTools[RAG Knowledge Base:\n- search_company_information]
        VerticalTools[Tools Verticales Especializadas:\n- query_student_grades\n- check_student_enrollments\n- assign_salon_chair\n- manage_hairdresser_shifts]
    end

    %% Conexiones a Tools
    AcadClientSub -.-> SharedTools
    AcadClientSub -.-> KnowledgeTools
    AcadAdminSub -.-> SharedTools
    AcadAdminSub -.-> KnowledgeTools
    AcadAdminSub -.-> VerticalTools

    SalonClientSub -.-> SharedTools
    SalonClientSub -.-> KnowledgeTools
    SalonAdminSub -.-> SharedTools
    SalonAdminSub -.-> KnowledgeTools
    SalonAdminSub -.-> VerticalTools

    GenClientSub -.-> SharedTools
    GenClientSub -.-> KnowledgeTools
    GenAdminSub -.-> SharedTools

    %% Servicios de Soporte e Infraestructura
    subgraph Infraestructura y Persistencia
        Supabase[(Supabase PostgreSQL Multi-tenant\nRLS / Sessions / Orders / RAG)]
        GoogleCalendar[(Google Calendar API v3\nOAuth2 Per-Tenant)]
        EventChannel([EventEmitter2\nCanal system.notification])
    end

    SharedTools --> Supabase
    SharedTools --> GoogleCalendar
    SharedTools --> EventChannel
    KnowledgeTools --> Supabase
    VerticalTools --> Supabase

    %% Formateo y Salida
    AcadClient --> Formatter[LlmResponseFormatterService\nEstructurador JSON a Botones/Listas/CTA]
    AcadAdmin --> Formatter
    SalonClient --> Formatter
    SalonAdmin --> Formatter
    GenClient --> Formatter
    GenAdmin --> Formatter

    Formatter --> Outbound[WhatsAppOutboundMessage\nEnvío de Respuesta a Meta API]
```

---

## 3. Principios Fundamentales del Diseño Agéntico

1. **Multi-Tenancy Aislado por Diseño**:
   - Cada empresa (tenant) posee un `companyId` único y una configuración vertical específica (`general`, `academy`, `salon`).
   - El estado de la sesión (`SupabaseSessionService`) se almacena asociado a la tupla `(appName:tenantName, userId:phone)`.
   - Las herramientas acceden al `companyId` de forma segura mediante `ToolContext.state.get('app:companyId')`, garantizando que ninguna tool mezcle información entre inquilinos.

2. **Segregación de Responsabilidades por Rol**:
   - **CLIENT (Cliente Final)**: Acceso a agentes informativos (`KnowledgeAgent`), agendamiento de citas propias (`AppointmentClientAgent`) y procesamiento de pagos (`SalesAgent`). No puede ver eventos ajenos ni métricas.
   - **ADMIN (Personal Administrativo)**: Acceso a métricas de negocio (`ReportingAgent`), calendario maestro y cancelaciones globales (`AppointmentAdminAgent`), inventario (`ReestockAgent`) y herramientas verticales operativas (`AcademyAgent`, `SalonStylistAgent`).

3. **Orquestadores Jerárquicos y Subagentes Transitorios**:
   - Los **Orquestadores** son servicios singleton en NestJS (`BaseOrchestratorService`) que ejecutan un agente ADK superior responsable de clasificar intenciones y transferir la conversación al subagente óptimo.
   - Los **Subagentes** se instancian con `Scope.TRANSIENT` para cada orquestador que los requiere, asegurando aislamiento de herramientas e instrucciones.

4. **Desacoplamiento del Canal de Mensajería (Channel-Agnostic)**:
   - El razonamiento del LLM produce texto contextualizado.
   - El servicio `LlmResponseFormatterService` traduce la salida del LLM a un formato JSON neutral de interfaz enriquecida (`buttons`, `cta_url`, `interactive_list`), permitiendo reutilizar los agentes en WhatsApp, SMS, web chat, etc.

5. **Observabilidad Reactiva por Eventos**:
   - Cada acción clave (resolución de tenant, generación de respuesta, invocación de herramientas, creación de órdenes o citas) emite eventos estructurados mediante `EventEmitter2` al canal central `system.notification`, permitiendo analíticas en tiempo real y transmisión SSE.

---

## 4. Ciclo de Vida del Mensaje End-to-End

### Secuencia Cronológica

```mermaid
sequenceDiagram
    autonumber
    actor User as Usuario (WhatsApp)
    participant Meta as Meta WhatsApp Cloud API
    participant Webhook as WhatsappService
    participant Identity as IdentityService
    participant Orchestrator as AdkOrchestratorService
    participant VerticalOrch as Vertical Orchestrator Service
    participant SessionSvc as SupabaseSessionService
    participant ADKRunner as Google ADK Runner
    participant SubAgent as Specialized SubAgent
    participant Tool as Tool / External Service
    participant Formatter as LlmResponseFormatterService
    participant Outbound as WhatsAppOutboundMessage

    User->>Meta: Envía mensaje(s) de WhatsApp
    Meta->>Webhook: Webhook POST con payload
    Webhook->>Webhook: Normaliza InboundMessage & marca como 'read'
    Webhook->>Webhook: Agrupa mensajes en ráfaga (Burst buffer 3s)
    Webhook->>Identity: Resuelve Tenant (por phoneNumberId) y Rol (por phone)
    Identity-->>Webhook: TenantContext (companyId, vertical) y UserRole
    Webhook->>Orchestrator: route(RouterMessageContext)
    
    Orchestrator->>VerticalOrch: Deriva según vertical y rol
    VerticalOrch->>VerticalOrch: preRoute() (e.g. verifica OAuth Google Calendar)
    VerticalOrch->>SessionSvc: ensureSession() (crea o carga estado inicial)
    SessionSvc-->>VerticalOrch: Sesión recuperada
    
    VerticalOrch->>ADKRunner: runAsync(userId, sessionId, newMessage)
    ADKRunner->>SubAgent: Clasifica y deriva al Subagente especializado
    SubAgent->>Tool: Invoca FunctionTool requerida (ej. check_availability)
    Tool->>Tool: Emite evento reactivo TOOL_ACTION_TRIGGERED
    Tool-->>SubAgent: Resultado JSON estructurado
    SubAgent-->>ADKRunner: Genera respuesta textual del agente
    ADKRunner-->>VerticalOrch: Evento isFinalResponse con texto acumulado
    
    VerticalOrch-->>Orchestrator: OrchestrationResult (responseText, intent, agentUsed)
    Orchestrator->>Formatter: formatResponse({ responseText, intent, agentUsed })
    Formatter-->>Orchestrator: FormattedResponse (tipo buttons/cta_url/list)
    Orchestrator-->>Webhook: OrchestrationResult con formattedResponse
    
    Webhook->>Outbound: WhatsAppOutboundMessage.Structured(...)
    Outbound->>Meta: POST Mensaje estructurado a Meta API
    Meta-->>User: Mensaje interactivo entregado al cliente
```

---

## 5. Matriz de Agentes y Orquestadores por Rol y Vertical

| Vertical | Rol | Orquestador Asignado | Subagentes Disponibles | Tools del Orquestador |
| :--- | :--- | :--- | :--- | :--- |
| **General** | **CLIENT** | `GeneralClientOrchestratorService` | `SalesAgent`<br>`AppointmentClientAgent`<br>`KnowledgeAgent` | `verify_phone_code` |
| **General** | **ADMIN** | `GeneralAdminOrchestratorService` | `ReportingAgent`<br>`AppointmentAdminAgent`<br>`ReestockAgent` | `verify_phone_code` |
| **Academy** | **CLIENT** | `AcademyClientOrchestratorService` | `KnowledgeAgent`<br>`AppointmentClientAgent`<br>`SalesAgent` | `verify_phone_code` |
| **Academy** | **ADMIN** | `AcademyAdminOrchestratorService` | `ReportingAgent`<br>`AppointmentAdminAgent`<br>`ReestockAgent`<br>`KnowledgeAgent`<br>`AcademyAgent` | `verify_phone_code` |
| **Salon** | **CLIENT** | `SalonClientOrchestratorService` | `KnowledgeAgent`<br>`AppointmentClientAgent`<br>`SalesAgent` | `verify_phone_code` |
| **Salon** | **ADMIN** | `SalonAdminOrchestratorService` | `ReportingAgent`<br>`AppointmentAdminAgent`<br>`ReestockAgent`<br>`KnowledgeAgent`<br>`SalonStylistAgent` | `verify_phone_code` |

---

## 6. Variables del Estado de Sesión (`SessionState`)

El estado de la sesión se inicializa mediante `InitialStateBuilder` y se mantiene sincronizado en PostgreSQL (`adk_sessions`) y en memoria:

| Clave | Tipo | Descripción | Ejemplo |
| :--- | :--- | :--- | :--- |
| `user:phone` | `string` | Número telefónico normalizado del emisor | `584121234567` |
| `user:role` | `UserRole` | Rol del usuario (`CLIENT` o `ADMIN`) | `CLIENT` |
| `user:name` | `string?` | Nombre de perfil de WhatsApp | `Juan Perez` |
| `app:companyId` | `string` | UUID identificador de la empresa tenant | `a1b2c3d4-...` |
| `app:companyName` | `string` | Nombre comercial de la empresa | `Academia Futuro` |
| `app:companyConfig` | `Record` | Configuración jsonb personalizada del tenant | `{ "maxAppointmentsPerDay": 10 }` |
| `app:currency` | `string` | Moneda base configurada | `USD` |
| `app:companyTone` | `string` | Tono de comunicación de la marca | `profesional`, `cálido` |
| `app:todayDate` | `string` | Fecha actual en la zona horaria del usuario | `2026-08-18` |
| `app:currentDateTime` | `string` | Fecha y hora actual formateada | `2026-08-18 10:30` |
| `app:timezone` | `string` | Zona horaria del usuario | `America/Caracas` |
| `temp:*` | `any` | Datos temporales de ejecución (no se persisten en BD) | `temp:lastOrderId` |

---

## 7. Próximos Pasos y Extensiones

Para conocer la implementación a nivel de código de cada subsistema:
1. Revisa [orchestrators-architecture.md](file:///.github/docs/ai/orchestrators-architecture.md) para extender nuevos orquestadores o verticales.
2. Revisa [subagents-architecture.md](file:///.github/docs/ai/subagents-architecture.md) para añadir nuevos subagentes con prompts optimizados.
3. Revisa [tools-architecture.md](file:///.github/docs/ai/tools-architecture.md) y [tools-reference.md](file:///.github/docs/ai/tools-reference.md) para implementar o integrar nuevas herramientas con APIs externas o base de datos.
