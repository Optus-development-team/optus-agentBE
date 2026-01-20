# Variables de Entorno

| Variable                                                                                | Requerido                     | Descripción                                                                                                                                               |
| --------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                                                                  | Opcional (por defecto `3000`) | Puerto HTTP para Nest.                                                                                                                                    |
| `WHATSAPP_API_VERSION`                                                                  | Sí                            | Versión de Graph API usada para todas las llamadas.                                                                                                       |
| `WHATSAPP_API_TOKEN`                                                                    | Sí                            | Token de aplicación/Business Manager para autenticar cada llamada a Meta.                                                                                 |
| `WHATSAPP_PHONE_NUMBER_ID`                                                              | Opcional                      | Número de respaldo en caso de que una compañía no tenga `whatsapp_phone_id`. No se usa para tráfico regular si la empresa tiene su propio ID en Supabase. |
| `WHATSAPP_VERIFY_TOKEN`                                                                 | Sí                            | Token compartido usado por Meta para verificar el webhook.                                                                                                |
| **`GOOGLE_GENAI_API_KEY`**                                                              | **Requerido (o Vertex AI)**   | **API Key de Google AI Studio para Gemini 2.0 Flash. Los agentes inteligentes no funcionarán sin credenciales.**                                          |
| **`GOOGLE_GENAI_MODEL`**                                                                | **Opcional**                  | **Nombre del modelo de Gemini a utilizar. Por defecto `gemini-2.5-flash-lite`, pero se puede cambiar para pruebas AB.**                                   |
| **`GOOGLE_GENAI_USE_VERTEXAI`**                                                         | **Opcional**                  | **Si es `true`, usa Vertex AI en lugar de API directa. Requiere `GOOGLE_CLOUD_PROJECT` y `GOOGLE_CLOUD_LOCATION`.**                                       |
| **`GOOGLE_CLOUD_PROJECT`**                                                              | **Condicional**               | **ID del proyecto GCP cuando `GOOGLE_GENAI_USE_VERTEXAI=true`.**                                                                                          |
| **`GOOGLE_CLOUD_LOCATION`**                                                             | **Condicional**               | **Región de Vertex AI (default: `us-central1`) cuando se usa Vertex AI.**                                                                                 |
| `PAYMENT_BACKEND_URL`                                                                   | Sí                            | URL del backend de pagos unificado (legacy + x402).                                                                                                       |
| `PAYMENT_API_KEY`                                                                       | Sí                            | Clave para firmar llamadas hacia el backend de pagos (legacy).                                                                                            |
| **`MAIN_PAGE_URL`**                                                                     | **Recomendado**               | **URL de la página principal donde el usuario puede completar el pago. Se usa para construir `${MAIN_PAGE_URL}/pay/${orderId}`.**                         |
| **`CATALOG_SYNC_ON_STARTUP`**                                                           | **Opcional**                  | **Si es `true` (default), sincroniza productos de Meta Catalog al iniciar el backend.**                                                                   |
| `GOOGLE_OAUTH_CLIENT_ID`                                                                | Sí                            | Cliente OAuth para calendar.                                                                                                                              |
| `GOOGLE_OAUTH_CLIENT_SECRET`                                                            | Sí                            | Secreto asociado al cliente anterior.                                                                                                                     |
| `GOOGLE_OAUTH_REDIRECT_URI`                                                             | Sí                            | Debe coincidir con la URL configurada en Google Cloud (`/auth/google/callback`).                                                                          |
| `GOOGLE_OAUTH_SCOPES`                                                                   | Sí                            | Scopes solicitados; por defecto incluye `calendar` y `calendar.events`.                                                                                   |
| `GOOGLE_OAUTH_ENCRYPTION_KEY`                                                           | Sí                            | Clave AES-256 utilizada por `EncryptionService` para proteger tokens almacenados en Supabase.                                                             |
| `ADMIN_PHONE_NUMBER`                                                                    | Opcional                      | Fallback global para recibir alertas administrativas cuando una compañía no tiene teléfonos definidos.                                                    |
| `DEFAULT_COMPANY_ID/NAME/CONFIG`                                                        | Opcional                      | Valores usados en entornos de prueba cuando Supabase no está disponible.                                                                                  |
| `SUPABASE_DB_URL`                                                                       | Recomendado                   | Cadena de conexión al pool Supavisor (puerto 6543, `pgbouncer=true`).                                                                                     |
| `SUPABASE_DB_POOL_SIZE`                                                                 | Opcional                      | Máximo de conexiones simultáneas (por defecto 5).                                                                                                         |
| `SUPABASE_DB_ALLOW_SELF_SIGNED`                                                         | Opcional                      | Permite certificados autofirmados en desarrollo (`true` por defecto).                                                                                     |
| `POSTGRES_*`                                                                            | Opcional                      | Variables auxiliares expuestas por Supabase CLI; útiles para herramientas externas.                                                                       |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` | Sí                            | Credenciales REST utilizadas por microservicios u operadores externos.                                                                                    |

## Configuración de Google Gemini AI (CRÍTICO)

### Opción 1: API Key (Desarrollo/Staging)

```bash
GOOGLE_GENAI_API_KEY="AIzaSy..."  # Obtener en https://aistudio.google.com/apikey
GOOGLE_GENAI_MODEL="gemini-2.5-flash-lite"  # Cambiar por gemini-2.0-pro, etc.
```

### Opción 2: Vertex AI (Producción)

```bash
GOOGLE_GENAI_USE_VERTEXAI="true"
GOOGLE_CLOUD_PROJECT="mi-proyecto-gcp"
GOOGLE_CLOUD_LOCATION="us-central1"
# Requiere autenticación GCP: gcloud auth application-default login
```

**⚠️ IMPORTANTE**: Sin credenciales de Gemini, los agentes usarán regex legacy para detección de intenciones y respuestas estáticas. Funcional pero sin capacidades de lenguaje natural.

## Configuración del Flujo de Pagos x402

El nuevo flujo de pagos unificado soporta tanto QR fiat como pagos crypto:

# URL del servicio de pagos x402

PAYMENT_BACKEND_URL="http://localhost:3001"

# URL donde el cliente completa el pago

MAIN_PAGE_URL="https://optus.lat"

````

### Flujo de Pago x402

1. **Inicio**: El bot llama a `GET /api/pay?orderId=...&amountUsd=...`
2. **Negociación**: Recibe 402 con opciones de pago (QR fiat y/o crypto)
3. **Envío**: El bot envía mensaje interactivo CTA URL con QR + botón de pago
4. **Confirmación**: Usuario dice "ya pagué" o completa en `${MAIN_PAGE_URL}/pay/${orderId}`
5. **Webhook**: El payment backend notifica a `/webhook/x402/result`

## Configuración del Catálogo de Meta

```bash
# Sincronizar catálogos de Meta al iniciar (default: true)
CATALOG_SYNC_ON_STARTUP="true"
````

Cuando está habilitado, el backend:

1. Obtiene todas las compañías con `business_catalog_id` configurado
2. Sincroniza productos de Meta Catalog hacia Supabase
3. Registra productos nuevos y actualiza existentes

## Consideraciones Multi-tenant

- Cada fila en `public.companies` debe poblar `whatsapp_phone_id`, `whatsapp_admin_phone_ids[]` (con números de teléfono) y, opcionalmente, `whatsapp_display_phone_number` para que las respuestas salgan desde su número oficial.
- El backend usa `WHATSAPP_PHONE_NUMBER_ID` únicamente como salvavidas cuando una compañía no tiene número configurado o cuando Supabase está fuera de línea.
- Variables nuevas deben documentarse en esta tabla incluyendo el impacto que tienen en el ruteo multi-tenant.
