# Descripción de Archivos y Carpetas

## Estructura Principal

```
optsms_backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── whatsapp.module.ts
│   ├── controllers/
│   ├── dto/
│   ├── services/
│   ├── types/
│   └── ...
├── scripts/
├── google-addon/
├── .github/docs/
└── test/
```

---

## Archivos Core

| Ruta                          | Descripción                                                                                                                                               |
|-------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/main.ts`                 | Bootstrap de NestJS con Swagger UI (`/docs`), hot-reload de `.env` con Chokidar, y CORS habilitado para integraciones externas.                        |
| `src/app.module.ts`           | Módulo raíz que importa `ConfigModule` (global), `ScheduleModule` y `WhatsappModule`. Punto de entrada de toda la aplicación.                           |
| `src/whatsapp.module.ts`      | **Módulo principal** que registra todos los controladores, servicios de agentes ADK, integraciones (Meta, Google, Circle), y servicios auxiliares.       |

---

## Controllers (Capa de Entrada)

| Ruta                                             | Endpoint                                               | Descripción                                                                                                                       |
|--------------------------------------------------|--------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `src/controllers/whatsapp.controller.ts`         | `GET/POST /webhook`                                    | Verificación y recepción de webhooks de WhatsApp Cloud API. Normaliza payloads de Meta y delega a `WhatsappService`.            |
| `src/controllers/payment-webhook.controller.ts`  | `POST /webhook/payments/result` <br> `POST /webhook/payment/confirm` | Recibe eventos de Circle USDC (settlements) y confirmaciones de pago desde frontend. Delega a `SalesAgentService`.   |
| `src/controllers/google-auth.controller.ts`      | `GET /auth/google/callback`                            | Callback de OAuth 2.0 para Google Calendar. Intercambia `code` por tokens y los encripta en `company_integrations`.             |
| `src/controllers/sheets-sync.controller.ts`      | `POST /sheets-sync`                                    | Endpoint para Google Workspace Add-on. Sincroniza datos de Sheets a `entity_definitions` + `dynamic_records` (Wipe & Replace).  |
| `src/controllers/catalog-test.controller.ts`     | `POST /catalog/test/*`                                 | Endpoints de testing para sincronización Meta Catalog. **Eliminar en producción**.                                               |
| `src/controllers/payment-proxy.controller.ts`    | `POST /proxy/payment`                                  | Proxy para pagos Circle USDC. Retorna headers especiales para frontend.                                                          |

---

## DTOs (Data Transfer Objects)

| Ruta                                    | Descripción                                                                                                                                   |
|-----------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `src/dto/whatsapp-webhook.dto.ts`      | Tipos para webhooks de Meta: `WhatsAppMessage`, `WhatsAppIncomingMessage`, `WhatsAppStatus`. Exporta `WhatsAppWebhookModels` para Swagger.  |
| `src/dto/meta-catalog.dto.ts`          | DTOs para Meta Business Catalog API: `MetaProductItem`, `MetaBatchRequest`, `MetaBatchResponse`, `SyncInventoryResult`.                      |
| `src/dto/payment-webhook.dto.ts`       | DTO para webhooks de Circle: `PaymentWebhookDto`, `PaymentWebhookAction`. Incluye `companyId` para multi-tenancy.                            |
| `src/dto/sheets-sync.dto.ts`           | DTOs para sincronización Google Sheets: `SheetsSyncPayloadDto`, `SheetRowDto`, `SheetsSyncResponseDto`.                                      |
| `src/dto/send-text-message.dto.ts`     | DTO validado para envío de mensajes de texto vía WhatsApp.                                                                                   |
| `src/dto/send-image-message.dto.ts`    | DTO para envío de imágenes (base64 o URL) con caption opcional.                                                                              |
| `src/dto/send-template-message.dto.ts` | DTO para envío de templates aprobados de WhatsApp.                                                                                           |

---

## Sistema ADK Multi-Agente

### Orquestador

| Ruta                                                      | Descripción                                                                                                                                                                 |
|-----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/services/agents/adk-orchestrator.service.ts`        | **Orquestador principal** usando patrón Coordinator. LlmAgent que analiza intención del usuario y delega a sub-agentes. Usa `Runner.runAsync()` para streaming.           |
| `src/services/agents/whatsapp-adk-bridge.service.ts`     | **Puente WhatsApp ↔ ADK**. Traduce `WhatsAppIncomingMessage` → `AgentMessageContext`, sanitiza PII, y convierte `OrchestrationResult` → `RouterAction[]`.                 |

### Sesiones

| Ruta                                                      | Descripción                                                                                                                                            |
|-----------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/services/agents/session/adk-session.service.ts`     | Persistencia de sesiones ADK en tabla `adk_sessions`. Crea sessions con ID `${companyId}:${userPhone}`, inyecta variables de contexto (`app:companyName`, `user:role`, etc.). |

### Sub-Agentes Especializados

| Ruta                                                           | Responsabilidad                                                                                                          | Tools Disponibles                                                                                                                                  |
|----------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/services/agents/subagents/sales-agent.service.ts`        | **Ventas + Pagos + Catálogo**. Mantiene máquina de estados de órdenes en memoria. Integra Meta Catalog y Circle USDC.  | `search_products`, `get_product_info`, `create_payment_order`, `check_payment_status`, `sync_inventory_to_meta`, `sync_inventory_from_meta`      |
| `src/services/agents/subagents/appointment-agent.service.ts`  | **Citas + Calendar**. Calcula slots disponibles, crea eventos en Google Calendar vía OAuth, persiste en tabla `appointments`. | `check_availability`, `create_appointment`, `cancel_appointment`, `list_appointments`                                                       |
| `src/services/agents/subagents/reporting-agent.service.ts`    | **Reportes + Métricas** (solo admins). Consulta Supabase para métricas reales, usa Gemini para generar resúmenes ejecutivos. | `get_sales_metrics`, `get_appointment_stats`, `query_dynamic_data`, `generate_executive_report`                                            |

### Function Tools

| Ruta                                                  | Descripción                                                                         |
|-------------------------------------------------------|-------------------------------------------------------------------------------------|
| `src/services/agents/tools/sales.tools.ts`           | Definición de FunctionTools para SalesAgent: esquemas JSON + descripciones para Gemini. |
| `src/services/agents/tools/appointment.tools.ts`     | Definición de FunctionTools para AppointmentAgent.                                 |
| `src/services/agents/tools/reporting.tools.ts`       | Definición de FunctionTools para ReportingAgent.                                   |
| `src/services/agents/tools/knowledge-base.tools.ts`  | Tools para consultar `dynamic_records` (datos de Google Sheets).                   |

---

## WhatsApp Service

| Ruta                                          | Descripción                                                                                                                                                                                                                  |
|-----------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/services/whatsapp/whatsapp.service.ts`  | **Servicio central de WhatsApp**. Procesa mensajes entrantes, resuelve tenants vía `IdentityService`, marca mensajes como leídos, delega a `WhatsappAdkBridgeService`, y envía respuestas a Meta API usando `phone_number_id` del tenant. |

---

## Integraciones Externas

### Meta / WhatsApp

| Ruta                                                    | Descripción                                                                                                                                                                       |
|---------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/services/meta/whatsapp/meta-catalog.service.ts`   | **Sincronización Meta Business Catalog**. Auto-sync al iniciar (`CATALOG_SYNC_ON_STARTUP=true`). Batch API para crear/actualizar productos en lotes de 50. Sincronización bidireccional con tabla `products`. |

### Pagos Circle USDC

| Ruta                                             | Descripción                                                                                                                     |
|--------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| `src/services/payments/payment-client.service.ts` | **Cliente Circle API**. Crea payment intents USDC, genera links de pago, verifica settlements. **Reemplaza flujos bancarios legacy**. |

### Google

| Ruta                                             | Descripción                                                                                                                                                                        |
|--------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/services/google/google-oauth.service.ts`   | OAuth 2.0 para Google Calendar. Genera URLs de consentimiento, intercambia códigos por tokens, refresca access tokens. Usa `google-auth-library`.                                 |
| `src/services/sheets-sync/sheets-sync.service.ts` | **Sincronización Google Sheets → Supabase**. Estrategia Wipe & Replace: elimina registros antiguos e inserta nuevos en `dynamic_records`. Crea schemas dinámicos en `entity_definitions`. |

### Google AI

| Ruta                                      | Descripción                                                                                                                                             |
|-------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/services/gemini/gemini.service.ts`  | **Wrapper Gemini AI**. Inicializa modelo `gemini-2.0-flash` (API Key o Vertex AI). Métodos: `generateText()`, `generateChatResponse()`. Usado por todos los agentes ADK. |

---


## Servicios Auxiliares

### Identity & Multi-Tenancy

| Ruta                                         | Descripción                                                                                                                                                                                                |
|----------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/services/identity/identity.service.ts` | **Resolución de tenants**. Métodos: `resolveTenantByPhoneId()` (vía webhook), `resolveTenantByCompanyId()` (envíos manuales), `ensureUserExists()` (auto-registro clientes), `getUserRole()` (admin/client). |

### Integraciones de Empresa

| Ruta                                                           | Descripción                                                                                                                                                 |
|----------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/services/integrations/company-integrations.service.ts`   | Gestiona credenciales encriptadas en `company_integrations`: Google Calendar tokens, configuraciones de pago. Verifica integración activa con `hasGoogleCalendar()`. |

### Órdenes

| Ruta                                            | Descripción                                                                                                                                      |
|-------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/services/orders/orders-sync.service.ts`   | Sincroniza estados de órdenes de pago en tabla `orders` de Supabase. Recibe eventos de `SalesAgentService` y persiste cambios (CART → PAID → COMPLETED). |

### Seguridad

| Ruta                                              | Descripción                                                                                                                     |
|---------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| `src/services/encryption/encryption.service.ts`   | Encriptación AES-256 para tokens sensibles (Google refresh tokens, API keys). Usa `GOOGLE_OAUTH_ENCRYPTION_KEY` de `.env`.     |
| `src/services/sanitization/sanitization.service.ts` | **Sanitización de PII**. Remueve/tokeniza teléfonos, emails, nombres antes de enviar a agentes IA. Usado por `WhatsappAdkBridgeService`. |

### Onboarding

| Ruta                                            | Descripción                                                                                                                                   |
|-------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `src/services/onboarding/onboarding.service.ts` | Verifica si admin tiene integraciones configuradas (ej. Google Calendar). Si no, genera URL de OAuth y guía al usuario. Solo se ejecuta para admins. |

### Storage

| Ruta                                      | Descripción                                                                                        |
|-------------------------------------------|----------------------------------------------------------------------------------------------------|
| `src/services/pinata/pinata.service.ts`   | Cliente IPFS para Pinata. Sube archivos descentralizados (imágenes, documentos). Opcional, usado para storage permanente. |

---
