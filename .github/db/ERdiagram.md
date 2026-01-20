// --------------------------------------------------------
// PROYECTO: OptuSBMS (SaaS Core)
// CONTEXTO: Full Schema (Pagos + Citas + Ventas)
// --------------------------------------------------------

Project OptuSBMS {
database_type: 'PostgreSQL'
Note: 'Base de datos maestra para orquestación SaaS Multi-tenant'
}

// --------------------------------------------------------
// ENUMS
// --------------------------------------------------------

Enum user_role {
ADMIN // Dueño
CLIENT // Cliente final
}

Enum order_status {
CART  
 AWAITING_QR  
 QR_SENT  
 VERIFYING_PAYMENT
COMPLETED  
 FAILED  
 REQUIRES_2FA  
}

Enum appointment_status {
PENDING_SYNC // Guardado localmente, en cola para subir a Google
CONFIRMED // Sincronizado exitosamente con Google (tiene ID)
CANCELLED // Cancelado (Soft delete en GCal)
RESCHEDULED // Reprogramado
COMPLETED // La fecha ya pasó
}

Enum integration_provider {
BANK_ECOFUTURO  
 GOOGLE_CALENDAR // Nuevo: Para OAuth2 Tokens
WALLET_TRON  
}

// --------------------------------------------------------
// CORE SAAS & TENANCY
// --------------------------------------------------------

Table companies {
id uuid [pk, default: `gen_random_uuid()`]
name varchar [not null]
whatsapp_phone_id varchar [unique, not null, note: 'Identificador para Webhooks de WhatsApp']
config jsonb [default: '{}']
created_at timestamptz [default: `now()`]
updated_at timestamptz [default: `now()`]
}

Table company_users {
id uuid [pk, default: `gen_random_uuid()`]
company_id uuid [ref: > companies.id, not null]
phone varchar [not null]
role user_role [default: 'CLIENT']
embedding vector(1536)
created_at timestamptz [default: `now()`]

indexes {
(company_id, phone) [unique]
}
}

// --------------------------------------------------------
// INTEGRACIONES
// --------------------------------------------------------

Table company_integrations {
id uuid [pk, default: `gen_random_uuid()`]
company_id uuid [ref: > companies.id, not null]
provider integration_provider [not null]

// Contenido dinámico cifrado:
// - BANK_ECOFUTURO: { user, pass }
// - GOOGLE_CALENDAR: { refresh_token, access_token, expiry_date }
encrypted_credentials jsonb [not null]

is_active boolean [default: true]
needs_2fa_attention boolean [default: false]
updated_at timestamptz [default: `now()`]
}

// --------------------------------------------------------
// VENTAS (Agente Ventas)
// --------------------------------------------------------

Table products {
id uuid [pk, default: `gen_random_uuid()`]
company_id uuid [ref: > companies.id]
sku varchar
name varchar
price decimal(10, 2)
stock_quantity int
image_url text
}

Table orders {
id uuid [pk, default: `gen_random_uuid()`]
company_id uuid [ref: > companies.id, not null]
user_id uuid [ref: > company_users.id, not null]
total_amount decimal(12, 2) [not null]
status order_status [default: 'CART']
details varchar [not null]
metadata jsonb [default: '{}']
created_at timestamptz [default: `now()`]
updated_at timestamptz [default: `now()`]
}

Table order_items {
id uuid [pk, default: `gen_random_uuid()`]
order_id uuid [ref: > orders.id]
product_id uuid [ref: > products.id]
quantity int
unit_price decimal(10, 2)
}

// --------------------------------------------------------
// CITAS Y CALENDARIO (Agente Citas) - ¡AGREGADO!
// --------------------------------------------------------

Table appointments {
id uuid [pk, default: `gen_random_uuid()`]
company_id uuid [ref: > companies.id, not null]
user_id uuid [ref: > company_users.id, not null]

// Datos Temporales
start_time timestamptz [not null]
end_time timestamptz [not null]

status appointment_status [default: 'PENDING_SYNC']

// Sincronización Híbrida (Crucial)
google_event_id varchar [note: 'ID devuelto por GCal. Null si aun no se sincroniza.']
google_html_link varchar [note: 'Link directo al evento en GCal web']

notes text

created_at timestamptz [default: `now()`]
updated_at timestamptz [default: `now()`]

indexes {
// Índice vital para que el agente responda rápido "¿Tienes hueco mañana?"
(company_id, start_time, end_time)

    // Índice para cuando llegue un Webhook de Google ("Evento modificado")
    // y necesites encontrarlo rápido en tu BD
    (google_event_id)

}
}

// --------------------------------------------------------
// SESIONES DE CHAT (Google ADK)
// --------------------------------------------------------

Table adk_sessions {
session_id varchar [pk]
company_id uuid [ref: > companies.id]
context_data jsonb
updated_at timestamptz [default: `now()`]
}
