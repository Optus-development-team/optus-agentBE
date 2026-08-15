# Diccionario de datos (Supabase - public)

Este documento describe la estructura de la base de datos después de la refactorización para soportar un catálogo unificado, verticales (`general`, `academy`, `salon`), normalización de identidades y optimizaciones para vectores de inteligencia artificial.

Convenciones:
- **PK**: Primary Key
- **FK**: Foreign Key
- **Nulo**: Indica si la columna permite `NULL`
- **Default**: Valor por defecto en BD

## Tabla `adk_sessions`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| session_id | text | NO | - | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| context_data | jsonb | NO | '{}'::jsonb | - | - |
| updated_at | timestamp with time zone | NO | now() | - | - |

## Tabla `appointments`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| customer_id | uuid | YES | - | - | customers.id |
| staff_id | uuid | YES | - | - | company_staff.id |
| appointment_type | USER-DEFINED | NO | 'other'::appointment_type | - | - |
| context_type | USER-DEFINED | NO | 'general'::appointment_context_type | - | - |
| catalog_item_id | uuid | YES | - | - | catalog_items.id |
| title | character varying | YES | - | - | - |
| description | text | YES | - | - | - |
| scheduled_start | timestamp without time zone | NO | - | - | - |
| scheduled_end | timestamp without time zone | NO | - | - | - |
| location | text | YES | - | - | - |
| meeting_link | text | YES | - | - | - |
| status | USER-DEFINED | NO | 'pending'::appointment_status | - | - |
| source | character varying | YES | - | - | - |
| created_by_staff_id | uuid | YES | - | - | company_staff.id |
| metadata | jsonb | NO | '{}'::jsonb | - | - |
| created_at | timestamp without time zone | NO | now() | - | - |
| updated_at | timestamp without time zone | NO | now() | - | - |

## Tabla `catalog_inventory`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| catalog_item_id | uuid | NO | - | - | catalog_items.id |
| current_stock | numeric | NO | 0 | - | - |
| reorder_point | numeric | NO | 0 | - | - |
| safety_stock | numeric | NO | 0 | - | - |
| notify | jsonb | NO | '{"to": [], "channels": ["whatsapp"]}'::jsonb | - | - |
| updated_at | timestamp without time zone | NO | now() | - | - |

## Tabla `catalog_items`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| item_type | text | NO | - | - | - |
| name | text | NO | - | - | - |
| description | text | YES | - | - | - |
| category | text | YES | - | - | - |
| sale_price | numeric | NO | 0 | - | - |
| cost_price | numeric | NO | 0 | - | - |
| currency | text | NO | 'BOB'::text | - | - |
| sku | text | YES | - | - | - |
| barcode | text | YES | - | - | - |
| stock_on_hand | numeric | YES | - | - | - |
| duration_minutes | integer | YES | - | - | - |
| capacity | integer | YES | - | - | - |
| sessions_count | integer | YES | - | - | - |
| is_active | boolean | NO | true | - | - |
| is_bookable | boolean | NO | false | - | - |
| is_sellable | boolean | NO | true | - | - |
| metadata | jsonb | NO | '{}'::jsonb | - | - |
| created_at | timestamp with time zone | NO | now() | - | - |
| updated_at | timestamp with time zone | NO | now() | - | - |

## Tabla `companies`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| name | character varying | NO | - | - | - |
| company_type | USER-DEFINED | NO | 'hybrid'::company_type | - | - |
| email | character varying | YES | - | - | - |
| phone | character varying | YES | - | - | - |
| address | text | YES | - | - | - |
| city | character varying | YES | - | - | - |
| country | character varying | YES | - | - | - |
| timezone | character varying | YES | 'America/La_Paz'::character varying | - | - |
| currency_code | character varying | YES | 'BOB'::character varying | - | - |
| currency | text | NO | 'BOB'::text | - | - |
| vertical | text | NO | 'general'::text | - | - |
| settings | jsonb | NO | '{}'::jsonb | - | - |
| is_active | boolean | NO | true | - | - |
| created_at | timestamp without time zone | NO | now() | - | - |
| updated_at | timestamp without time zone | NO | now() | - | - |

## Tabla `company_integrations`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| provider | text | NO | - | - | - |
| integration_name | text | YES | - | - | - |
| encrypted_credentials | jsonb | NO | '{}'::jsonb | - | - |
| config_json | jsonb | NO | '{}'::jsonb | - | - |
| status | text | NO | 'active'::text | - | - |
| is_active | boolean | NO | true | - | - |
| last_sync_at | timestamp with time zone | YES | - | - | - |
| created_at | timestamp with time zone | NO | now() | - | - |
| updated_at | timestamp with time zone | NO | now() | - | - |

## Tabla `company_staff`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| user_id | uuid | YES | - | - | company_users.id |
| first_name | character varying | NO | - | - | - |
| last_name | character varying | YES | - | - | - |
| role | USER-DEFINED | NO | - | - | - |
| specialty | character varying | YES | - | - | - |
| hire_date | date | YES | - | - | - |
| end_date | date | YES | - | - | - |
| salary | numeric | YES | - | - | - |
| commission_config | jsonb | NO | '{}'::jsonb | - | - |
| is_active | boolean | NO | true | - | - |
| created_at | timestamp without time zone | NO | now() | - | - |
| updated_at | timestamp without time zone | NO | now() | - | - |

## Tabla `company_users`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| phone | text | YES | - | - | - |
| role | USER-DEFINED | NO | 'CLIENT'::user_role | - | - |
| email | text | YES | - | - | - |
| alias | text | YES | - | - | - |
| permissions | jsonb | NO | '{}'::jsonb | - | - |
| embedding | vector(1536) | YES | - | - | - |
| is_phone_verified | boolean | NO | false | - | - |
| last_login_at | timestamp with time zone | YES | - | - | - |
| created_at | timestamp with time zone | NO | now() | - | - |
| updated_at | timestamp with time zone | NO | now() | - | - |

## Tabla `company_whatsapp_stickers`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| name | text | NO | - | - | - |
| sticker_url | text | NO | - | - | - |
| trigger_type | text | YES | - | - | - |
| trigger_value | text | YES | - | - | - |
| is_active | boolean | NO | true | - | - |
| metadata | jsonb | NO | '{}'::jsonb | - | - |
| event_key | text | YES | 'error_or_unauthorized_action'::text | - | - |
| created_at | timestamp with time zone | NO | now() | - | - |
| updated_at | timestamp with time zone | NO | now() | - | - |

## Tabla `course_enrollments`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| customer_id | uuid | YES | - | - | customers.id |
| catalog_item_id | uuid | NO | - | - | catalog_items.id |
| status | USER-DEFINED | NO | 'active'::enrollment_status | - | - |
| enrolled_at | timestamp without time zone | NO | now() | - | - |
| notes | text | YES | - | - | - |

## Tabla `customers`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| user_id | uuid | YES | - | - | company_users.id |
| customer_type | USER-DEFINED | NO | 'person'::customer_type | - | - |
| first_name | character varying | YES | - | - | - |
| last_name | character varying | YES | - | - | - |
| company_name | character varying | YES | - | - | - |
| notes | text | YES | - | - | - |
| extra_data | jsonb | NO | '{}'::jsonb | - | - |
| is_active | boolean | NO | true | - | - |
| created_at | timestamp without time zone | NO | now() | - | - |
| updated_at | timestamp without time zone | NO | now() | - | - |

## Tabla `order_items`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| order_id | uuid | NO | - | - | orders.id |
| company_id | uuid | NO | - | - | companies.id |
| item_type | text | NO | - | - | - |
| catalog_item_id | uuid | YES | - | - | catalog_items.id |
| item_name | text | NO | - | - | - |
| quantity | numeric | NO | 1 | - | - |
| unit_price | numeric | NO | 0 | - | - |
| unit_cost | numeric | NO | 0 | - | - |
| line_total | numeric | NO | 0 | - | - |
| created_at | timestamp with time zone | NO | now() | - | - |

## Tabla `orders`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| customer_id | uuid | YES | - | - | customers.id |
| staff_id | uuid | YES | - | - | company_staff.id |
| user_id | uuid | YES | - | - | company_users.id |
| order_number | text | YES | - | - | - |
| status | text | NO | 'pending'::text | - | - |
| subtotal | numeric | NO | 0 | - | - |
| discount | numeric | NO | 0 | - | - |
| total_amount | numeric | NO | 0 | - | - |
| currency | text | NO | 'BOB'::text | - | - |
| payment_status | text | NO | 'pending'::text | - | - |
| qr_payment_link | text | YES | - | - | - |
| details | text | YES | - | - | - |
| metadata | jsonb | NO | '{}'::jsonb | - | - |
| created_at | timestamp with time zone | NO | now() | - | - |
| updated_at | timestamp with time zone | NO | now() | - | - |

## Tabla `payments`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| order_id | uuid | YES | - | - | orders.id |
| customer_id | uuid | YES | - | - | customers.id |
| amount | numeric | NO | - | - | - |
| currency | text | NO | 'BOB'::text | - | - |
| method | text | NO | - | - | - |
| provider | text | YES | - | - | - |
| qr_reference | text | YES | - | - | - |
| qr_payload | jsonb | YES | - | - | - |
| status | text | NO | 'pending'::text | - | - |
| paid_at | timestamp with time zone | YES | - | - | - |
| metadata | jsonb | NO | '{}'::jsonb | - | - |
| created_at | timestamp with time zone | NO | now() | - | - |

## Tabla `public_knowledge_entries`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| entity_name | text | NO | - | - | - |
| text_content | text | NO | - | - | - |
| data | jsonb | NO | '{}'::jsonb | - | - |
| is_active | boolean | NO | true | - | - |
| search_vector | tsvector | YES | - | - | - |
| semantic_embedding | vector(1536) | YES | - | - | - |
| created_at | timestamp with time zone | NO | now() | - | - |
| updated_at | timestamp with time zone | NO | now() | - | - |

## Tabla `staff_availability`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| company_id | uuid | NO | - | - | companies.id |
| staff_id | uuid | NO | - | - | company_staff.id |
| day_of_week | smallint | NO | - | - | - |
| start_time | time without time zone | NO | - | - | - |
| end_time | time without time zone | NO | - | - | - |
| is_available | boolean | NO | true | - | - |
| created_at | timestamp without time zone | NO | now() | - | - |

## Tabla `user_integrations`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| user_id | uuid | NO | - | - | company_users.id |
| provider | text | NO | - | - | - |
| integration_name | text | YES | - | - | - |
| encrypted_credentials | jsonb | NO | '{}'::jsonb | - | - |
| config_json | jsonb | NO | '{}'::jsonb | - | - |
| status | text | NO | 'active'::text | - | - |
| is_active | boolean | NO | true | - | - |
| last_sync_at | timestamp with time zone | YES | - | - | - |
| metadata | jsonb | NO | '{}'::jsonb | - | - |
| created_at | timestamp with time zone | NO | now() | - | - |
| updated_at | timestamp with time zone | NO | now() | - | - |

## Tabla `verification_codes`
| Columna | Tipo | Nulo | Default | PK | FK |
|---|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK | - |
| phone | text | NO | - | - | - |
| code | text | NO | - | - | - |
| expires_at | timestamp with time zone | NO | - | - | - |
| verified | boolean | NO | false | - | - |
| created_at | timestamp with time zone | NO | now() | - | - |

## Funciones relevantes

- `search_public_knowledge(uuid, text, vector)`: búsqueda combinada semántica y FTS (RAG híbrido) de conocimiento público por empresa utilizando similitud de cosenos y coincidencias léxicas.

## Notas de arquitectura

- Multi-tenant estricto particionado por `company_id` en tablas core y verticales.
- Esquema de catálogo unificado en `catalog_items` (elimina la duplicidad de productos, cursos y servicios).
- Autenticación e identidades centralizadas en `company_users`.
- Configuración de la empresa consolidada en una única columna estructural `companies.settings`.
- Sesiones de agente persistentes en `adk_sessions`.
- OTP de login gestionado en `verification_codes`.
- Búsqueda RAG soportada nativamente mediante la extensión `pgvector` en tablas de contexto.