# API Endpoints - optus-agentBE

Base URL local: `http://localhost:3000/v1`
Base URL prod (según Swagger): `https://api.optus.bamp.lat/v1`

## 1) Health

### GET `/`
- **Descripción:** endpoint simple de disponibilidad.
- **Requisitos:** ninguno.

**Request completo**
```http
GET /v1/ HTTP/1.1
Host: localhost:3000
```

**Respuesta completa (200)**
```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8

Hello World!
```

**Códigos de respuesta**
- `200`: servicio operativo.

---

## 2) Auth

### GET `/auth/google/login`
- **Descripción:** inicia OAuth con Google y redirige al consentimiento.
- **Requisitos:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.

**Request completo**
```http
GET /v1/auth/google/login HTTP/1.1
Host: localhost:3000
```

**Respuesta completa (302)**
```http
HTTP/1.1 302 Found
Location: https://accounts.google.com/o/oauth2/v2/auth?...&scope=openid%20https://www.googleapis.com/auth/userinfo.email%20https://www.googleapis.com/auth/userinfo.profile
```

**Códigos de respuesta**
- `302`: redirección a Google.

---

### GET `/auth/google/callback`
- **Descripción:** procesa `code` OAuth, valida usuario/empresa por correo, genera JWT y setea cookie segura, luego redirige al dashboard frontend.
- **Requisitos:**
  - Query param `code` obligatorio.
  - En DB: usuario de `company_users` asociado por correo.
  - Variables `AUTH_JWT_SECRET` (o `APP_JWT_SECRET`) y `FRONTEND_DASHBOARD_URL` (o `MAIN_PAGE_URL`).

**Request completo**
```http
GET /v1/auth/google/callback?code=4/0AbCdEf...&state=login HTTP/1.1
Host: localhost:3000
```

**Respuesta completa (302 + cookie)**
```http
HTTP/1.1 302 Found
Set-Cookie: optus_auth=<jwt>; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=Strict
Location: http://localhost:5173/dashboard
```

**Respuesta de error (400)**
```http
HTTP/1.1 400 Bad Request
Content-Type: text/plain; charset=utf-8

Missing authorization code
```

**Respuesta de error (500)**
```http
HTTP/1.1 500 Internal Server Error
Content-Type: text/plain; charset=utf-8

Error authenticating with Google
```

**Códigos de respuesta**
- `302`: login correcto y redirección al dashboard.
- `400`: falta `code`.
- `500`: fallo en intercambio OAuth o validación de usuario.

---

### GET `/auth/salt`
- **Descripción:** consulta si usuario OAuth existe y devuelve su salt.
- **Requisitos:** header `x-oauth-token`.

**Request completo**
```http
GET /v1/auth/salt HTTP/1.1
Host: localhost:3000
x-oauth-token: <jwt-del-proveedor>
x-auth-provider: GOOGLE
```

**Respuesta completa (200)**
```json
{
  "exists": true,
  "salt": "random-user-salt"
}
```

**Códigos de respuesta**
- `200`: respuesta válida.
- `400`: JWT inválido o claims incompletos.

---

### POST `/auth/login`
- **Descripción:** login app legacy por JWT de proveedor + datos de wallet.
- **Requisitos:** body válido de `LoginRequestDto`.

**Request completo**
```http
POST /v1/auth/login HTTP/1.1
Host: localhost:3000
Content-Type: application/json
x-auth-provider: GOOGLE

{
  "jwt": "<jwt-proveedor>",
  "salt": "random-user-salt",
  "suiAddress": "0x123abc",
  "alias": "Usuario Demo"
}
```

**Respuesta completa (200)**
```json
{
  "accessToken": "<access-token>",
  "user": {
    "id": "uuid-user",
    "suiAddress": "0x123abc",
    "phoneVerified": false,
    "status": "PENDING_PHONE"
  }
}
```

**Códigos de respuesta**
- `200`: sesión iniciada.
- `400`: datos inválidos o salt inconsistente.
- `401`: falta configuración de empresa o autenticación inválida.

---

### POST `/auth/zkp`
- **Descripción:** solicita prueba ZK al proving service.
- **Requisitos:** body válido de `ZkProofRequestDto`.

**Request completo**
```http
POST /v1/auth/zkp HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "input": "demo"
}
```

**Respuesta completa (200)**
```json
{
  "proof": "...",
  "publicSignals": []
}
```

**Códigos de respuesta**
- `200`: prueba generada.
- `500`: fallo en servicio externo.

---

### GET `/auth/zkp/ping`
- **Descripción:** health check del proving service.
- **Requisitos:** ninguno.

**Request completo**
```http
GET /v1/auth/zkp/ping HTTP/1.1
Host: localhost:3000
```

**Respuesta completa (200)**
```json
{
  "status": "ok"
}
```

**Códigos de respuesta**
- `200`: servicio disponible.

---

### POST `/auth/phone/otp`
- **Descripción:** emite OTP para verificar teléfono.
- **Requisitos:** `Authorization: Bearer <access-token>`.

**Request completo**
```http
POST /v1/auth/phone/otp HTTP/1.1
Host: localhost:3000
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "phone": "+5491122334455"
}
```

**Respuesta completa (200)**
```json
{
  "code": "123456",
  "instruction": "Envía este código a nuestro bot de WhatsApp"
}
```

**Códigos de respuesta**
- `200`: OTP emitido.
- `401`: token inválido.

---

### GET `/auth/phone/status`
- **Descripción:** consulta estado de verificación telefónica.
- **Requisitos:** `Authorization: Bearer <access-token>`.

**Request completo**
```http
GET /v1/auth/phone/status?phone=+5491122334455 HTTP/1.1
Host: localhost:3000
Authorization: Bearer <access-token>
```

**Respuesta completa (200)**
```json
{
  "verified": true,
  "linkedAt": "2026-03-04T12:00:00.000Z"
}
```

**Códigos de respuesta**
- `200`: estado consultado.
- `401`: token inválido.

---

## 3) Company

### GET `/company`
- **Descripción:** lista empresas del usuario autenticado.
- **Requisitos:** `Authorization: Bearer <access-token>`.

**Request completo**
```http
GET /v1/company HTTP/1.1
Host: localhost:3000
Authorization: Bearer <access-token>
```

**Respuesta completa (200)**
```json
[
  {
    "id": "uuid-company",
    "name": "Optus Academy",
    "vertical": "academy",
    "currency": "USD"
  }
]
```

**Códigos de respuesta**
- `200`: lista obtenida.
- `401`: token inválido.

---

### POST `/company`
- **Descripción:** crea empresa y asocia al creador.
- **Requisitos:** `Authorization: Bearer <access-token>`.

**Request completo**
```http
POST /v1/company HTTP/1.1
Host: localhost:3000
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "name": "Nueva Empresa",
  "vertical": "general",
  "currency": "USD"
}
```

**Respuesta completa (200)**
```json
{
  "id": "uuid-company",
  "name": "Nueva Empresa",
  "vertical": "general",
  "currency": "USD"
}
```

**Códigos de respuesta**
- `200`: empresa creada.
- `401`: token inválido.

---

### POST `/company/:id/users`
- **Descripción:** agrega/actualiza usuario dentro de una empresa.
- **Requisitos:** `Authorization: Bearer <access-token>`.

**Request completo**
```http
POST /v1/company/uuid-company/users HTTP/1.1
Host: localhost:3000
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "userId": "uuid-user",
  "role": "ADMIN"
}
```

**Respuesta completa (200)**
```json
{
  "updated": true
}
```

**Códigos de respuesta**
- `200`: usuario asociado.
- `400`: falta companyId.
- `401`: token inválido.

---

### GET `/company/:id/users`
- **Descripción:** lista usuarios de una empresa.
- **Requisitos:** `Authorization: Bearer <access-token>`.

**Request completo**
```http
GET /v1/company/uuid-company/users HTTP/1.1
Host: localhost:3000
Authorization: Bearer <access-token>
```

**Respuesta completa (200)**
```json
[
  {
    "id": "uuid-user",
    "companyId": "uuid-company",
    "role": "ADMIN",
    "email": "admin@empresa.com",
    "phone": "+5491122334455"
  }
]
```

**Códigos de respuesta**
- `200`: lista obtenida.
- `400`: falta companyId.
- `401`: token inválido.

---

## 4) Transactions

### POST `/tx/sponsor/create`
### POST `/tx/sponsor/deposit`
### POST `/tx/sponsor/payout`
### POST `/tx/sponsor/deploy`
- **Descripción:** solicitan firma sponsor al backend Paybe.
- **Requisitos:** `Authorization: Bearer <access-token>` + body del DTO correspondiente.

**Request completo (ejemplo sponsor/create)**
```http
POST /v1/tx/sponsor/create HTTP/1.1
Host: localhost:3000
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "transactionBytes": "AAABBB...",
  "sender": "0x123abc",
  "gasPayments": []
}
```

**Respuesta completa (200)**
```json
{
  "digest": "0xabc",
  "signature": "base64-signature",
  "bytes": "AAABBB..."
}
```

**Códigos de respuesta**
- `200`: firma generada.
- `401`: token inválido.
- `500`: fallo en servicio de firma o DB.

---

### POST `/tx/notify-success`
- **Descripción:** marca orden como pagada con digest de transacción.
- **Requisitos:** `Authorization: Bearer <access-token>`.

**Request completo**
```http
POST /v1/tx/notify-success HTTP/1.1
Host: localhost:3000
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "digest": "0xtransactiondigest"
}
```

**Respuesta completa (200)**
```json
{
  "updated": true
}
```

**Códigos de respuesta**
- `200`: actualizado.
- `401`: token inválido.

---

## 5) Webhooks externos

### POST `/webhooks/bank-provider`
- **Descripción:** recibe webhooks del proveedor bancario (QR generado).
- **Requisitos:** payload con `type = QR_GENERATED` y `order_id`.

**Request completo**
```http
POST /v1/webhooks/bank-provider HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "type": "QR_GENERATED",
  "order_id": "uuid-order",
  "data": {
    "qr_image_link": "https://cdn.example.com/qr.png"
  }
}
```

**Respuesta completa (200)**
```json
{
  "status": "accepted"
}
```

**Códigos de respuesta**
- `200` + `accepted`: procesado.
- `200` + `ignored`: tipo inválido, sin order_id, sin Supabase o sin companyId.

---

## 6) Webhooks WhatsApp (Meta)

### GET `/webhooks/whatsapp`
- **Descripción:** verificación del webhook Meta (`hub.challenge`).
- **Requisitos:** `hub.mode`, `hub.verify_token`, `hub.challenge`.

**Request completo**
```http
GET /v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=secret&hub.challenge=123456 HTTP/1.1
Host: localhost:3000
```

**Respuesta completa (200)**
```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8

123456
```

**Códigos de respuesta**
- `200`: validación correcta.
- `400`: token inválido o parámetros incorrectos.

---

### POST `/webhooks/whatsapp`
- **Descripción:** recibe eventos entrantes de mensajes de Meta.
- **Requisitos:** payload oficial o payload de prueba compatible.

**Request completo**
```http
POST /v1/webhooks/whatsapp HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "entry-id",
      "changes": [
        {
          "field": "messages",
          "value": {
            "metadata": { "phone_number_id": "123456" },
            "messages": [
              {
                "id": "wamid.HBg...",
                "from": "5491122334455",
                "type": "text",
                "text": { "body": "Hola" }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

**Respuesta completa (200)**
```json
{
  "status": "success"
}
```

**Respuesta con error interno controlado (200)**
```json
{
  "status": "error"
}
```

**Códigos de respuesta**
- `200` + `success`: evento procesado.
- `200` + `error`: error interno, pero ACK a Meta para evitar pérdida.

---

## 7) Notifications SSE

### GET `/notifications/stream`
- **Descripción:** stream Server-Sent Events por empresa autenticada.
- **Requisitos:** cookie `optus_auth` válida (`HttpOnly`, `Secure`, `SameSite=Strict`).

**Request completo**
```http
GET /v1/notifications/stream HTTP/1.1
Host: localhost:3000
Accept: text/event-stream
Cookie: optus_auth=<jwt-cookie>
```

**Respuesta completa (200, stream abierto)**
```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: whatsapp.response.sent
data: {"companyId":"uuid-company","type":"whatsapp.response.sent","timestamp":"2026-03-04T15:33:00.000Z","payload":{"recipient":"5491122334455","phoneNumberId":"123456","whatsappMessageId":"wamid..."}}
```

**Códigos de respuesta**
- `200`: stream SSE activo.
- `401`: cookie ausente, token inválido o expirado.
