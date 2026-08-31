# Diccionario de datos (Supabase - public)

Este documento describe la estructura completa de la base de datos en Supabase (schema `public`), soportando catálogo unificado, verticales (`general`, `academy`, `salon`), normalización de identidades, sincronización bidireccional de Google Calendar, auditorías, recibos de WhatsApp, gestión multi-staff y la configuración validada en **schema_v3** para agentes autónomos.

Convenciones:
- **PK**: Primary Key
- **FK**: Foreign Key
- **Nulo**: Indica si la columna permite `NULL` (`YES` / `NO`)
- **Default**: Valor por defecto en BD

---

## Tabla `adk_sessions`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| session_id | text | NO | - | PK | - | Identificador único de sesión ADK (`appName:userId`) |
| company_id | uuid | NO | - | - | companies.id | Tenant asociado |
| context_data | jsonb | NO | '{}'::jsonb | - | - | Estado y eventos serializados de la sesión |
| updated_at | timestamp with time zone | NO | now() | - | - | Marca de última interacción |

---

## Tabla `appointment_audit_logs`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID del log de auditoría |
| company_id | uuid | NO | - | - | companies.id | Tenant asociado |
| appointment_id | uuid | YES | - | - | appointments.id | Cita auditada |
| action | text | NO | - | - | - | Acción realizada (`create`, `update`, `cancel`, `reschedule`, etc.) |
| actor_type | text | NO | - | - | - | Tipo de actor (`user`, `staff`, `agent`, `system`) |
| actor_user_id | uuid | YES | - | - | company_users.id | Usuario que ejecutó la acción si aplica |
| actor_staff_id | uuid | YES | - | - | company_staff.id | Miembro del personal que ejecutó la acción si aplica |
| actor_phone | text | YES | - | - | - | Teléfono del actor si aplica |
| previous_state | jsonb | YES | - | - | - | Estado previo de la cita |
| new_state | jsonb | YES | - | - | - | Estado nuevo de la cita |
| metadata | jsonb | NO | '{}'::jsonb | - | - | Metadatos contextuales del evento |
| created_at | timestamp with time zone | NO | now() | - | - | Timestamp de creación |

---

## Tabla `appointment_notifications`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de la notificación |
| company_id | uuid | NO | - | - | companies.id | Tenant asociado |
| appointment_id | uuid | NO | - | - | appointments.id | Cita vinculada |
| notification_type | text | NO | - | - | - | Tipo de notificación (`reminder_24h`, `reminder_2h`, `confirmation`, `cancellation`) |
| channel | text | NO | 'whatsapp'::text | - | - | Canal de envío (`whatsapp`, `email`, etc.) |
| recipient | text | NO | - | - | - | Destinatario (ej. número telefónico) |
| scheduled_at | timestamp with time zone | NO | - | - | - | Fecha y hora programada de envío |
| status | text | NO | 'pending'::text | - | - | Estado (`pending`, `sent`, `failed`, `cancelled`) |
| attempts | integer | NO | 0 | - | - | Número de reintentos efectuados |
| max_attempts | integer | NO | 5 | - | - | Máximo de reintentos permitidos |
| sent_at | timestamp with time zone | YES | - | - | - | Timestamp en el que se despachó exitosamente |
| last_error | text | YES | - | - | - | Mensaje del último error |
| dedupe_key | text | NO | - | - | - | Clave única de idempotencia |
| payload | jsonb | NO | '{}'::jsonb | - | - | Carga útil del mensaje |
| created_at | timestamp with time zone | NO | now() | - | - | Timestamp de creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Timestamp de actualización |

---

## Tabla `appointments`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de la cita |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| customer_id | uuid | YES | - | - | customers.id | Cliente agendado |
| staff_id | uuid | YES | - | - | company_staff.id | Profesional/barbero asignado |
| appointment_type | appointment_type | NO | 'other'::appointment_type | - | - | Enum: `sales`, `service`, `academy`, `advisory`, `demo`, `follow_up`, `support`, `other` |
| context_type | appointment_context_type | NO | 'general'::appointment_context_type | - | - | Enum: `product`, `service`, `course`, `general` |
| catalog_item_id | uuid | YES | - | - | catalog_items.id | Servicio/producto reservado |
| title | character varying | YES | - | - | - | Título descriptivo |
| description | text | YES | - | - | - | Descripción |
| scheduled_start | timestamp with time zone | NO | - | - | - | Inicio programado (con zona horaria) |
| scheduled_end | timestamp with time zone | NO | - | - | - | Fin programado (con zona horaria) |
| location | text | YES | - | - | - | Ubicación o sucursal |
| meeting_link | text | YES | - | - | - | Enlace de videollamada |
| status | appointment_status | NO | 'pending'::appointment_status | - | - | Enum: `pending`, `confirmed`, `completed`, `cancelled`, `no_show` |
| source | character varying | YES | - | - | - | Origen (`whatsapp_agent`, `manual`, `web`, etc.) |
| created_by_staff_id | uuid | YES | - | - | company_staff.id | Personal creador |
| metadata | jsonb | NO | '{}'::jsonb | - | - | Metadatos extensibles |
| created_at | timestamp without time zone | NO | now() | - | - | Creación |
| updated_at | timestamp without time zone | NO | now() | - | - | Actualización |
| notes | text | YES | - | - | - | Notas internas |
| google_calendar_event_id | text | YES | - | - | - | ID único del evento en Google Calendar |
| google_calendar_link | text | YES | - | - | - | URL pública del evento en Google Calendar |
| external_event_id | text | YES | - | - | - | ID genérico para otros proveedores (Outlook, iCal) |
| external_provider | text | YES | - | - | - | Proveedor externo (`GOOGLE_CALENDAR`, `OUTLOOK`, `ICAL`, `OTHER`) |
| sync_status | text | YES | 'pending'::text | - | - | Estado de sincronización: `pending`, `synced`, `error`, `conflict` |
| sync_error_message | text | YES | - | - | - | Mensaje de error de sincronización |
| last_synced_at | timestamp with time zone | YES | - | - | - | Timestamp de sincronización exitosa |
| google_updated_at | timestamp with time zone | YES | - | - | - | Timestamp de última modificación en Google Calendar |
| db_updated_at | timestamp with time zone | YES | now() | - | - | Timestamp de modificación en DB |
| sync_direction | text | YES | 'bidirectional'::text | - | - | Dirección (`db_to_google`, `google_to_db`, `bidirectional`, `none`) |
| conflict_resolution | text | YES | - | - | - | Resolución (`google_wins`, `db_wins`, `manual`) |
| target_calendar_id | text | YES | - | - | - | ID específico de Google Calendar destino |
| created_by_user_id | uuid | YES | - | - | company_users.id | Usuario creador |
| cancelled_by_user_id | uuid | YES | - | - | company_users.id | Usuario cancelador |
| cancellation_reason | text | YES | - | - | - | Motivo de cancelación |
| cancelled_at | timestamp with time zone | YES | - | - | - | Fecha de cancelación |
| completed_at | timestamp with time zone | YES | - | - | - | Fecha de finalización |
| no_show_at | timestamp with time zone | YES | - | - | - | Fecha de inasistencia |
| booking_version | integer | NO | 1 | - | - | Versión de control concurrente |

---

## Tabla `calendar_registry_canonicalization_snapshots`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| staff_id | uuid | NO | - | PK | company_staff.id | ID de staff snapshot |
| google_calendar_id | text | YES | - | - | - | ID de calendario de Google asociado |
| google_calendar_name | text | YES | - | - | - | Nombre descriptivo del calendario |
| calendar_color | text | YES | - | - | - | Color visual asignado |
| captured_at | timestamp with time zone | NO | now() | - | - | Timestamp de captura |

---

## Tabla `calendar_sync_conflicts`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID del conflicto |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| appointment_id | uuid | YES | - | - | appointments.id | Cita en conflicto |
| google_calendar_event_id | text | NO | - | - | - | Evento de Google Calendar |
| conflict_type | text | NO | - | - | - | Tipo de discrepancia detectada |
| db_state | jsonb | NO | - | - | - | Snapshot del estado en BD |
| google_state | jsonb | NO | - | - | - | Snapshot del estado en Google Calendar |
| resolution_strategy | text | YES | - | - | - | Estrategia elegida |
| resolution_status | text | YES | 'pending'::text | - | - | Estado (`pending`, `resolved`, `ignored`) |
| resolved_at | timestamp with time zone | YES | - | - | - | Timestamp de resolución |
| resolved_by | text | YES | - | - | - | Usuario o sistema que resolvió |
| resolution_notes | text | YES | - | - | - | Notas de resolución |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `calendar_sync_jobs`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID del trabajo en cola |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| calendar_id | text | YES | - | - | - | Calendario a sincronizar |
| job_type | text | NO | - | - | - | Tipo de sync (`incremental`, `full`, `webhook_event`) |
| status | text | NO | 'pending'::text | - | - | Estado (`pending`, `processing`, `completed`, `failed`) |
| run_after | timestamp with time zone | NO | now() | - | - | Timestamp mínimo de ejecución |
| attempts | integer | NO | 0 | - | - | Reintentos actuales |
| max_attempts | integer | NO | 5 | - | - | Máximo reintentos |
| dedupe_key | text | NO | - | - | - | Clave de deduplicación |
| payload | jsonb | NO | '{}'::jsonb | - | - | Parámetros del trabajo |
| locked_at | timestamp with time zone | YES | - | - | - | Bloqueo concurrente |
| completed_at | timestamp with time zone | YES | - | - | - | Finalización |
| last_error | text | YES | - | - | - | Detalle de error |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `calendar_sync_logs`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID del registro |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| appointment_id | uuid | YES | - | - | appointments.id | Cita sincronizada |
| sync_type | text | NO | - | - | - | Tipo de sincronización ejecutada |
| sync_direction | text | NO | - | - | - | Dirección de sincronización |
| status | text | NO | - | - | - | Estado final |
| events_processed | integer | YES | 0 | - | - | Total de eventos procesados |
| events_created | integer | YES | 0 | - | - | Eventos insertados |
| events_updated | integer | YES | 0 | - | - | Eventos actualizados |
| events_deleted | integer | YES | 0 | - | - | Eventos eliminados |
| events_skipped | integer | YES | 0 | - | - | Eventos omitidos |
| errors_count | integer | YES | 0 | - | - | Total errores |
| error_details | jsonb | YES | '[]'::jsonb | - | - | Array con detalle de errores |
| started_at | timestamp with time zone | NO | now() | - | - | Inicio |
| completed_at | timestamp with time zone | YES | - | - | - | Fin |
| duration_ms | integer | YES | - | - | - | Duración en milisegundos |
| triggered_by | text | YES | - | - | - | Origen (`cron`, `webhook`, `user`, `agent`, `system`) |
| metadata | jsonb | YES | '{}'::jsonb | - | - | Datos contextuales adicionales |
| created_at | timestamp with time zone | NO | now() | - | - | Timestamp de creación |

---

## Tabla `catalog_inventory`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de control de stock |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| catalog_item_id | uuid | NO | - | - | catalog_items.id | Producto de inventario |
| current_stock | numeric | NO | 0 | - | - | Stock actual disponible |
| reorder_point | numeric | NO | 0 | - | - | Punto de reorden |
| safety_stock | numeric | NO | 0 | - | - | Stock de seguridad |
| notify | jsonb | NO | '{"to": [], "channels": ["whatsapp"]}'::jsonb | - | - | Configuración de alertas de stock |
| updated_at | timestamp with time zone | NO | now() | - | - | Timestamp de actualización |

---

## Tabla `catalog_items`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID del ítem |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| item_type | text | NO | - | - | - | Tipo (`product`, `service`, `course`) |
| name | text | NO | - | - | - | Nombre |
| description | text | YES | - | - | - | Descripción |
| category | text | YES | - | - | - | Categoría |
| sale_price | numeric | NO | 0 | - | - | Precio de venta |
| cost_price | numeric | NO | 0 | - | - | Costo unitario |
| currency | text | NO | 'BOB'::text | - | - | Moneda |
| sku | text | YES | - | - | - | Código SKU |
| barcode | text | YES | - | - | - | Código de barras |
| stock_on_hand | numeric | YES | - | - | - | Stock físico |
| duration_minutes | integer | YES | - | - | - | Duración en minutos (servicios) |
| capacity | integer | YES | - | - | - | Capacidad de cupos (cursos/talleres) |
| sessions_count | integer | YES | - | - | - | Cantidad de sesiones (cursos) |
| is_active | boolean | NO | true | - | - | Activo/Inactivo |
| is_bookable | boolean | NO | false | - | - | Permite reservas en agenda |
| is_sellable | boolean | NO | true | - | - | Permite venta directa en pedidos |
| metadata | jsonb | NO | '{}'::jsonb | - | - | Atributos adicionales |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `companies`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | Identificador de la empresa |
| name | character varying | NO | - | - | - | Razón social / Nombre comercial |
| company_type | company_type | NO | 'hybrid'::company_type | - | - | Enum: `product`, `service`, `academy`, `hybrid` |
| email | character varying | YES | - | - | - | Correo corporativo |
| phone | character varying | YES | - | - | - | Teléfono oficial |
| address | text | YES | - | - | - | Dirección fiscal/física |
| city | character varying | YES | - | - | - | Ciudad |
| country | character varying | YES | - | - | - | País |
| timezone | character varying | YES | 'America/La_Paz'::character varying | - | - | Zona horaria IANA |
| currency_code | character varying | YES | 'BOB'::character varying | - | - | Código ISO moneda |
| currency | text | NO | 'BOB'::text | - | - | Moneda operativa |
| vertical | text | NO | 'general'::text | - | - | Vertical de negocio: `general`, `academy`, `salon` |
| settings | jsonb | NO | '{}'::jsonb | - | - | Ajustes generales |
| academy_json | jsonb | NO | '{}'::jsonb | - | - | Estructura específica para vertical academias |
| branding | jsonb | NO | '{}'::jsonb | - | - | Personalización visual y marca |
| payment_settings | jsonb | NO | '{}'::jsonb | - | - | Configuración de pasarelas y cobros |
| business_hours | jsonb | NO | '{}'::jsonb | - | - | Horarios de atención estructurados por día |
| config | jsonb | NO | '{}'::jsonb | - | - | **Configuración versionada schema_v3** (ver detalle abajo) |
| config_updated_at | timestamp with time zone | YES | now() | - | - | Timestamp de cambio de config (invalida caché de sesión ADK) |
| whatsapp_admin_phone_ids | ARRAY (_text) | NO | '{}'::text[] | - | - | IDs de teléfonos WhatsApp autorizados como admin |
| whatsapp_display_phone_number | text | YES | - | - | - | Número visible de WhatsApp Cloud API |
| whatsapp_phone_id | text | YES | - | - | - | Phone Number ID de Meta Cloud API |
| is_active | boolean | NO | true | - | - | Estado activo/inactivo |
| created_at | timestamp without time zone | NO | now() | - | - | Creación |
| updated_at | timestamp without time zone | NO | now() | - | - | Actualización |

### Estructura de `companies.config` (schema_v3)
La columna `config` está validada por el constraint `chk_companies_agent_config_v3` y normalizada automáticamente por `trg_normalize_company_agent_config`:
- `schema_version`: `3` (entero)
- `configuration`: `{ status: 'draft' | 'complete', profile_completed: boolean, behavior_completed: boolean, business_info_completed: boolean, configured_at: string | null, configured_by: string | null }`
- `agent_profile`: `{ agent_name: string, language: string (regex ^[a-z]{2,3}(-[A-Z]{2})?$), tone: string, persona_description: string }`
- `agent_behavior`: `{ response_style: 'concise' | 'balanced' | 'detailed', use_emojis: boolean, emoji_intensity: 0..3, address_customer_as: 'tu' | 'usted', ask_clarifying_questions: boolean, confirm_before_actions: boolean, never_invent_information: boolean, educational_mode_enabled: boolean, fallback_message: string }`
- `agent_admin_security`: `{ require_2fa_for_admin_actions: boolean, protect_sensitive_data: boolean }`
- `agent_capabilities`: `{ knowledge: boolean, appointments: boolean, sales: boolean, payments: boolean, reporting: boolean }`
- `agent_sales_policy`: `{ accepted_payment_methods: string[], refund_policy: string }`
- `agent_client_operational_rules`: `{ human_handoff_enabled: boolean, human_handoff_message: string, walk_ins_allowed: boolean }`
- `agent_client_appointment_policy`: `{ enabled: boolean, service_name: string, cancellation_rule: string, slot_duration_minutes: 5..480, buffer_between_appointments_minutes: 0..240, max_advance_booking_days: 1..730, min_advance_booking_minutes: 0..10080, cancellation_notice_minutes: 0..43200, reminders_minutes: number[], deposit_required_percentage: 0..100, deposit_amount: number >= 0 }`
- `agent_extensions`: `{}`

---

## Tabla `company_config_migration_snapshots`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| company_id | uuid | NO | - | - | companies.id | Tenant respaldado |
| schema_version | integer | NO | - | - | - | Versión histórica del config guardado (`1`, `2`, ...) |
| original_config | jsonb | NO | - | - | - | Snapshot completo del JSON de configuración |
| original_vertical | text | YES | - | - | - | Vertical histórica en el momento del respaldo |
| created_at | timestamp with time zone | NO | now() | - | - | Timestamp del snapshot |

---

## Tabla `company_integrations`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de integración |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| provider | text | NO | - | - | - | Proveedor (`google_calendar`, `meta_whatsapp`, `stripe`, etc.) |
| integration_name | text | YES | - | - | - | Nombre visible |
| encrypted_credentials | jsonb | NO | '{}'::jsonb | - | - | Credenciales y tokens cifrados |
| config_json | jsonb | NO | '{}'::jsonb | - | - | Configuración técnica |
| status | text | NO | 'active'::text | - | - | Estado (`active`, `disconnected`, `error`) |
| sync_enabled | boolean | YES | true | - | - | Sincronización automática activada |
| sync_frequency_minutes | integer | YES | 15 | - | - | Frecuencia de sync en minutos |
| sync_direction | text | YES | 'bidirectional'::text | - | - | Dirección (`to_google`, `from_google`, `bidirectional`) |
| webhook_configured | boolean | YES | false | - | - | Indica si webhook de push notifications está activo |
| webhook_channel_id | text | YES | - | - | - | ID del canal push |
| webhook_resource_id | text | YES | - | - | - | ID del watch resource |
| webhook_expiration | timestamp with time zone | YES | - | - | - | Expiración del canal de webhook |
| webhook_url | text | YES | - | - | - | Endpoint receptor del webhook |
| last_sync_at | timestamp with time zone | YES | - | - | - | Última sincronización incremental |
| last_full_sync_at | timestamp with time zone | YES | - | - | - | Última sincronización total |
| sync_settings | jsonb | YES | '{}'::jsonb | - | - | Ajustes extendidos de sincronización |
| is_active | boolean | NO | true | - | - | Activo/Inactivo |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `company_staff`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de miembro del personal |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| user_id | uuid | YES | - | - | company_users.id | Cuenta de usuario asociada si posee login |
| first_name | character varying | NO | - | - | - | Nombres |
| last_name | character varying | YES | - | - | - | Apellidos |
| email | character varying | YES | - | - | - | Correo |
| phone | character varying | YES | - | - | - | Teléfono |
| role | staff_role | NO | - | - | - | Enum: `owner`, `manager`, `seller`, `advisor`, `barber`, `teacher`, `assistant`, `admin` |
| specialty | character varying | YES | - | - | - | Especialidad o rubro |
| hire_date | date | YES | - | - | - | Fecha de contratación |
| end_date | date | YES | - | - | - | Fecha de desvinculación |
| salary | numeric | YES | - | - | - | Salario base |
| commission_config | jsonb | NO | '{}'::jsonb | - | - | Esquema de comisiones |
| google_calendar_id | text | YES | - | - | - | ID de Google Calendar propio (`primary` o `c_...@group.calendar.google.com`) |
| google_calendar_name | text | YES | - | - | - | Nombre visible de la agenda de Google |
| calendar_color | text | YES | - | - | - | Color en Google Calendar |
| calendar_sync_enabled | boolean | YES | true | - | - | Activar sincronización para este staff |
| is_active | boolean | NO | true | - | - | Activo/Inactivo |
| created_at | timestamp without time zone | NO | now() | - | - | Creación |
| updated_at | timestamp without time zone | NO | now() | - | - | Actualización |

---

## Tabla `company_users`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de usuario |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| phone | text | YES | - | - | - | Número de teléfono normalizado |
| email | text | YES | - | - | - | Correo |
| alias | text | YES | - | - | - | Nombre público o apodo |
| role | user_role | NO | 'CLIENT'::user_role | - | - | Enum: `ADMIN`, `CLIENT` |
| permissions | jsonb | NO | '{}'::jsonb | - | - | Permisos granulares |
| embedding | vector(1536) | YES | - | - | - | Vector de perfil/identidad |
| is_phone_verified | boolean | NO | false | - | - | Teléfono validado por OTP |
| last_login_at | timestamp with time zone | YES | - | - | - | Último acceso |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `company_whatsapp_stickers`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID del sticker |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| name | text | NO | - | - | - | Nombre del sticker |
| sticker_url | text | NO | - | - | - | URL pública del archivo WebP/sticker |
| trigger_type | text | YES | - | - | - | Tipo de disparador |
| trigger_value | text | YES | - | - | - | Valor del disparador |
| event_key | text | YES | 'error_or_unauthorized_action'::text | - | - | Clave de evento asociada |
| metadata | jsonb | NO | '{}'::jsonb | - | - | Metadatos |
| is_active | boolean | NO | true | - | - | Activo/Inactivo |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `course_enrollments`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de matrícula |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| customer_id | uuid | YES | - | - | customers.id | Alumno/Cliente |
| catalog_item_id | uuid | NO | - | - | catalog_items.id | Curso (`item_type = 'course'`) |
| status | enrollment_status | NO | 'active'::enrollment_status | - | - | Enum: `active`, `completed`, `cancelled`, `suspended` |
| enrolled_at | timestamp without time zone | NO | now() | - | - | Fecha de inscripción |
| notes | text | YES | - | - | - | Notas de seguimiento académico |

---

## Tabla `customers`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de cliente |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| user_id | uuid | YES | - | - | company_users.id | Usuario vinculado |
| customer_type | customer_type | NO | 'person'::customer_type | - | - | Enum: `person`, `company` |
| first_name | character varying | YES | - | - | - | Nombres |
| last_name | character varying | YES | - | - | - | Apellidos |
| company_name | character varying | YES | - | - | - | Razón social si es empresa |
| email | character varying | YES | - | - | - | Correo |
| phone | character varying | YES | - | - | - | Teléfono |
| notes | text | YES | - | - | - | Notas de CRM |
| extra_data | jsonb | NO | '{}'::jsonb | - | - | Datos adicionales |
| is_active | boolean | NO | true | - | - | Activo |
| created_at | timestamp without time zone | NO | now() | - | - | Creación |
| updated_at | timestamp without time zone | NO | now() | - | - | Actualización |

---

## Tabla `google_calendar_registry`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID del registro |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| calendar_id | text | NO | - | - | - | ID del calendario en Google (`primary`, `c_...@group.calendar.google.com`) |
| calendar_name | text | NO | - | - | - | Nombre visible |
| calendar_description | text | YES | - | - | - | Descripción |
| calendar_type | text | NO | 'secondary'::text | - | - | Tipo: `primary` (dueño), `secondary` (staff), `shared`, `resource` |
| calendar_color | text | YES | - | - | - | Color en Google |
| is_primary | boolean | YES | false | - | - | `true` para el calendario principal del negocio |
| assigned_to_staff_id | uuid | YES | - | - | company_staff.id | Staff asignado si es agenda personal |
| last_synced_at | timestamp with time zone | YES | - | - | - | Timestamp de sincronización |
| metadata | jsonb | YES | '{}'::jsonb | - | - | Metadatos extendidos |
| is_active | boolean | YES | true | - | - | Activo |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `google_calendar_webhook_channels`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID del canal push |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| calendar_id | text | NO | - | - | - | ID del calendario vigilado en Google |
| channel_id | text | NO | - | - | - | UUID del canal de watch |
| resource_id | text | NO | - | - | - | Resource ID asignado por Google |
| webhook_url | text | NO | - | - | - | URL callback configurada |
| expiration | timestamp with time zone | NO | - | - | - | Timestamp de caducidad del canal |
| is_active | boolean | NO | true | - | - | Activo |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `order_items`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de la línea de pedido |
| order_id | uuid | NO | - | - | orders.id | Pedido asociado |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| catalog_item_id | uuid | YES | - | - | catalog_items.id | Ítem del catálogo |
| item_type | text | NO | - | - | - | Tipo de ítem |
| item_name | text | NO | - | - | - | Nombre al momento de la venta |
| quantity | numeric | NO | 1 | - | - | Cantidad |
| unit_price | numeric | NO | 0 | - | - | Precio unitario aplicado |
| unit_cost | numeric | NO | 0 | - | - | Costo unitario |
| line_total | numeric | NO | 0 | - | - | Total de la línea |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |

---

## Tabla `orders`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID del pedido |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| customer_id | uuid | YES | - | - | customers.id | Cliente |
| staff_id | uuid | YES | - | - | company_staff.id | Vendedor/Staff |
| user_id | uuid | YES | - | - | company_users.id | Usuario que registró la venta |
| order_number | text | YES | - | - | - | Número correlativo visible |
| status | text | NO | 'pending'::text | - | - | Estado (`pending`, `completed`, `cancelled`) |
| subtotal | numeric | NO | 0 | - | - | Subtotal |
| discount | numeric | NO | 0 | - | - | Descuento total |
| total_amount | numeric | NO | 0 | - | - | Monto total |
| currency | text | NO | 'BOB'::text | - | - | Moneda |
| payment_status | text | NO | 'pending'::text | - | - | Estado de pago (`pending`, `paid`, `partially_paid`, `failed`) |
| qr_payment_link | text | YES | - | - | - | URL o QR generado |
| details | text | YES | - | - | - | Detalles u observaciones |
| metadata | jsonb | NO | '{}'::jsonb | - | - | Metadatos |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `payments`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de pago |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| order_id | uuid | YES | - | - | orders.id | Pedido asociado |
| customer_id | uuid | YES | - | - | customers.id | Cliente que paga |
| amount | numeric | NO | - | - | - | Monto pagado |
| currency | text | NO | 'BOB'::text | - | - | Moneda |
| method | text | NO | - | - | - | Método (`QR`, `cash`, `card`, `transfer`) |
| provider | text | YES | - | - | - | Pasarela (`bcp`, `bnb`, `multipago`, `stripe`, etc.) |
| qr_reference | text | YES | - | - | - | Referencia de transacción QR |
| qr_payload | jsonb | YES | - | - | - | Carga del QR |
| status | text | NO | 'pending'::text | - | - | Estado (`pending`, `completed`, `failed`, `refunded`) |
| paid_at | timestamp with time zone | YES | - | - | - | Timestamp de confirmación de pago |
| metadata | jsonb | NO | '{}'::jsonb | - | - | Metadatos |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |

---

## Tabla `public_knowledge_entries`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID del documento/conocimiento |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| entity_name | text | NO | - | - | - | Nombre de la entidad / pregunta / tema |
| text_content | text | NO | - | - | - | Contenido textual para recuperación |
| data | jsonb | NO | '{}'::jsonb | - | - | Estructura complementaria |
| search_vector | tsvector | YES | - | - | - | Vector para Full Text Search (FTS) en español |
| semantic_embedding | vector(1536) | YES | - | - | - | Vector de incrustación semántica OpenAI/Gemini |
| is_active | boolean | NO | true | - | - | Activo |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `staff_availability`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de regla de disponibilidad |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| staff_id | uuid | NO | - | - | company_staff.id | Staff asignado |
| day_of_week | smallint | NO | - | - | - | Día de la semana (0 = domingo, 1 = lunes, ..., 6 = sábado) |
| start_time | time without time zone | NO | - | - | - | Hora de inicio |
| end_time | time without time zone | NO | - | - | - | Hora de fin |
| is_available | boolean | NO | true | - | - | Disponible (`true`) o no laborable (`false`) |
| created_at | timestamp without time zone | NO | now() | - | - | Creación |

---

## Tabla `staff_catalog_services`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de asignación servicio-staff |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| staff_id | uuid | NO | - | - | company_staff.id | Staff capacitado para prestar el servicio |
| catalog_item_id | uuid | NO | - | - | catalog_items.id | Servicio del catálogo (`item_type = 'service'`) |
| custom_duration_minutes | integer | YES | - | - | - | Duración personalizada por este staff (sobrescribe ítem) |
| is_active | boolean | NO | true | - | - | Activo |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `staff_time_off`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID del bloqueo/permiso |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| staff_id | uuid | NO | - | - | company_staff.id | Staff que toma tiempo libre |
| starts_at | timestamp with time zone | NO | - | - | - | Inicio del bloqueo de agenda |
| ends_at | timestamp with time zone | NO | - | - | - | Fin del bloqueo de agenda |
| reason | text | YES | - | - | - | Motivo (vacaciones, descanso, enfermedad, etc.) |
| status | text | NO | 'approved'::text | - | - | Estado (`pending`, `approved`, `rejected`) |
| created_by_user_id | uuid | YES | - | - | company_users.id | Administrador que autorizó el permiso |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `staff_working_hours`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de turno |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| staff_id | uuid | NO | - | - | company_staff.id | Staff asignado |
| day_of_week | smallint | NO | - | - | - | Día de semana (0=domingo..6=sábado) |
| start_time | time without time zone | NO | - | - | - | Inicio de turno |
| end_time | time without time zone | NO | - | - | - | Fin de turno |
| effective_from | date | YES | - | - | - | Vigencia desde |
| effective_to | date | YES | - | - | - | Vigencia hasta |
| is_active | boolean | NO | true | - | - | Activo |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `user_integrations`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID de integración a nivel usuario |
| user_id | uuid | NO | - | - | company_users.id | Usuario propietario de la credencial OAuth |
| provider | text | NO | - | - | - | Proveedor (`google_calendar`, `outlook`, etc.) |
| integration_name | text | YES | - | - | - | Nombre visible de la conexión |
| encrypted_credentials | jsonb | NO | '{}'::jsonb | - | - | Tokens OAuth y refresh cifrados |
| config_json | jsonb | NO | '{}'::jsonb | - | - | Configuración |
| status | text | NO | 'active'::text | - | - | Estado (`active`, `revoked`, `expired`) |
| sync_enabled | boolean | YES | true | - | - | Sincronización activa del calendario personal |
| sync_frequency_minutes | integer | YES | 30 | - | - | Frecuencia de sync |
| auto_accept_company_appointments | boolean | YES | true | - | - | Auto-aceptar citas asignadas desde la empresa |
| notification_preferences | jsonb | YES | '{}'::jsonb | - | - | Preferencias de alertas |
| metadata | jsonb | NO | '{}'::jsonb | - | - | Metadatos adicionales |
| is_active | boolean | NO | true | - | - | Activo |
| last_sync_at | timestamp with time zone | YES | - | - | - | Última sincronización |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |
| updated_at | timestamp with time zone | NO | now() | - | - | Actualización |

---

## Tabla `verification_codes`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - | ID del código OTP |
| phone | text | NO | - | - | - | Número telefónico destinatario |
| code | text | NO | - | - | - | Código numérico generado |
| expires_at | timestamp with time zone | NO | - | - | - | Timestamp de expiración |
| verified | boolean | NO | false | - | - | Estado de verificación exitosa |
| created_at | timestamp with time zone | NO | now() | - | - | Creación |

---

## Tabla `whatsapp_inbound_message_receipts`
| Columna | Tipo | Nulo | Default | PK | FK | Descripción |
|---|---|---|---|---|---|---|
| message_id | text | NO | - | PK | - | `wamid` de WhatsApp entrante (idempotencia) |
| company_id | uuid | NO | - | - | companies.id | Tenant |
| phone_number_id | text | NO | - | - | - | ID del número receptor en WhatsApp Cloud API |
| sender_phone | text | NO | - | - | - | Número de teléfono remitente |
| received_at | timestamp with time zone | NO | now() | - | - | Timestamp de recepción |
| expires_at | timestamp with time zone | NO | now() + '30 days'::interval | - | - | TTL para depuración periódica |

---

## Funciones Relevantes en Base de Datos

- `normalize_company_agent_config_v3(p_company_name text, p_vertical text, p_config jsonb)`: función `IMMUTABLE` que normaliza y valida estrictamente el JSON de configuración para cumplir el estándar `schema_v3`.
- `trg_normalize_company_agent_config()`: trigger en `BEFORE INSERT OR UPDATE` sobre `companies` que garantiza la estructura de `schema_v3`.
- `search_public_knowledge(p_company_id uuid, p_query text)`: búsqueda híbrida RAG combinando Full Text Search en español (`tsvector`) con similitud léxica y semántica en `public_knowledge_entries`.
- `get_target_calendar_id_for_appointment(p_appointment_id uuid)`: resuelve el ID canónico de Google Calendar (staff asignado o primario de la empresa).
- `jsonb_is_string_array(jsonb)`: función auxiliar para validar arrays JSONB compuestos exclusivamente de cadenas no vacías.
- `jsonb_is_positive_integer_array(jsonb)`: función auxiliar para validar arrays JSONB de enteros estrictamente mayores a 0.

---

## Notas de Arquitectura

1. **Multi-tenant estricto**: particionado por `company_id` con índices y constraints relacionales.
2. **Catálogo unificado**: consolidado en `catalog_items` y `catalog_inventory` para servicios, productos y cursos.
3. **Agentes Inteligentes y Configuración (schema_v3)**: Configuración versionada centralmente en `companies.config` con invalidación de caché basada en `companies.config_updated_at`.
4. **Google Calendar Multi-Staff & Bi-direccional**: soporte a múltiples agendas por barbero/profesor con resolución de conflictos, deduplicación de jobs y canales de webhook.
5. **Idempotencia de Mensajería**: control estricto de eventos entrantes de WhatsApp con `whatsapp_inbound_message_receipts`.