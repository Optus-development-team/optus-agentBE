# OPTUS Agent Backend

Backend NestJS para el bot de WhatsApp de OPTUS. Recibe webhooks de Meta,
resuelve la empresa por `phone_number_id`, enruta mensajes al orquestador ADK y
responde por WhatsApp Cloud API.

## Setup

```bash
npm install
npm run start
```

Por defecto la API usa prefijo global `/v1`.

Health local:

```http
GET http://localhost:3000/v1
```

Swagger:

```http
GET http://localhost:3000/docs
```

## Variables Criticas

Crear `.env` en la raiz. No commitear este archivo.

```env
PORT='3000'

WHATSAPP_API_VERSION='v24.0'
WHATSAPP_PHONE_NUMBER_ID='<phone_number_id_interno_de_meta>'
META_API_TOKEN='<token_meta>'
WHATSAPP_VERIFY_TOKEN='<token_de_verificacion_webhook>'
WHATSAPP_PROCESS_MESSAGES_SYNC='true'

SUPABASE_DB_URL='<postgres_connection_string>'
GOOGLE_GENAI_API_KEY='<gemini_api_key>'

APP_JWT_SECRET='<secret_aleatorio>'
AUTH_JWT_SECRET='<secret_aleatorio>'
ENCRYPTION_KEY='<secret_aleatorio>'
```

`WHATSAPP_PHONE_NUMBER_ID` no es el numero visible del bot. Debe salir de:

```txt
Meta Developers -> App -> WhatsApp -> API Setup -> From phone number -> Phone number ID
```

Ese valor debe coincidir con `public.companies.whatsapp_phone_id` en Supabase.

## Rutas Reales

Base local:

```txt
http://localhost:3000/v1
```

Base Vercel actual:

```txt
https://optus-agent-be.vercel.app/v1
```

Endpoints principales:

```http
GET  /v1
GET  /v1/webhooks/whatsapp
POST /v1/webhooks/whatsapp
POST /v1/webhooks/bank-provider
GET  /v1/pay/:id
POST /v1/pay/:id
GET  /v1/auth/google
GET  /v1/auth/google/callback
POST /v1/auth/login
POST /v1/auth/phone/otp
GET  /v1/auth/phone/status
GET  /v1/company
POST /v1/company
GET  /v1/company/products
GET  /v1/company/orders
GET  /v1/notifications/stream
```

Verificacion webhook Meta:

```http
GET /v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=test123
```

Debe responder:

```txt
test123
```

## Vercel

El proyecto se despliega como backend NestJS. El root `/` puede responder 404;
probar siempre `/v1`.

Variables necesarias en Vercel:

```env
WHATSAPP_API_VERSION
WHATSAPP_PHONE_NUMBER_ID
META_API_TOKEN
WHATSAPP_VERIFY_TOKEN
WHATSAPP_PROCESS_MESSAGES_SYNC=true
SUPABASE_DB_URL
GOOGLE_GENAI_API_KEY
APP_JWT_SECRET
AUTH_JWT_SECRET
ENCRYPTION_KEY
```

Para Meta, la callback URL debe ser:

```txt
https://optus-agent-be.vercel.app/v1/webhooks/whatsapp
```

## Diagnostico Rapido

Si el bot no responde:

1. Verificar que el deploy compila en Vercel.
2. Probar `GET /v1`.
3. Probar el challenge de `GET /v1/webhooks/whatsapp`.
4. Confirmar que `WHATSAPP_PHONE_NUMBER_ID` en Vercel coincide con
   `companies.whatsapp_phone_id`.
5. Revisar logs de Vercel para `POST /v1/webhooks/whatsapp`.
6. Confirmar que `WHATSAPP_PROCESS_MESSAGES_SYNC=true` en Vercel.

## Tests

```bash
npm run build
npm test -- --runInBand
```
