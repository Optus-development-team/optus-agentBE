# Plan corregido de implementación de Google Calendar

Fecha de revisión: 2026-08-20

## Objetivo y fuente de verdad

`appointments` es la fuente de verdad. Una cita se guarda primero en PostgreSQL y después se proyecta a Google Calendar. Si Google falla, la cita no se pierde: queda con `sync_status = error` y el scheduler la reintenta.

La resolución multi-calendario sigue esta prioridad:

1. `appointments.target_calendar_id` explícito.
2. Calendario asignado en `company_staff.google_calendar_id`.
3. Calendario principal de `google_calendar_registry`.
4. `primary` como último fallback.

## Hallazgos de la auditoría

Los planes originales describían varios archivos como implementados, pero en el código solo existían `CalendarService` y un módulo mínimo. Las operaciones de cancelar, reprogramar y listar del agente devolvían datos simulados.

Además se encontraron estos bloqueadores:

- El callback OAuth consultaba `company_users cuzzzzzz...`, que no existe.
- Había dos servicios Google con variables y formatos de credenciales incompatibles.
- La migración hacía único `google_calendar_event_id` por empresa, aunque en multi-calendario la unicidad debe incluir el calendario.
- `company_integrations` solo podía guardar un webhook, pero Google requiere un canal por calendario.
- La migración no era completamente repetible: recreaba constraints y policies sin eliminarlos antes.
- No existían endpoints reales, repositorio, sincronización entrante, logs, conflictos, webhooks, cron ni pruebas.
- El `UPSERT` de `user_integrations` asumía una restricción única ausente en el respaldo v1.

## Implementación aplicada

### 1. Persistencia y dominio — completado

- Repositorio multi-tenant para crear, buscar, solapar, cancelar, reprogramar y listar citas.
- Alta o reutilización de cliente por teléfono.
- Asignación automática del primer staff disponible con sincronización habilitada.
- Prevención de solapamientos antes de escribir.
- Flujo DB-first con estado de error recuperable.

### 2. Sincronización DB → Google — completado

- Creación, actualización y eliminación real de eventos.
- El evento incluye `optusAppointmentId` en propiedades privadas para idempotencia.
- Selección correcta del calendario destino.
- Persistencia de ID, enlace, fecha Google, calendario y estado de sync.
- Reintentos por lotes para citas pendientes o con error.

### 3. Sincronización Google → DB — completado

- Lectura paginada de todos los calendarios registrados.
- Tokens incrementales por calendario guardados en `sync_settings.sync_tokens`.
- Recuperación automática ante token expirado (HTTP 410).
- Creación, modificación y cancelación importadas a DB.
- Detección de cambios concurrentes; resolución por última modificación cuando hay más de cinco minutos de diferencia y escalamiento manual en los demás casos.

### 4. Webhooks y cron — completado

- Tabla correctiva `google_calendar_webhook_channels`, un canal por calendario.
- Validación de `channel_id + resource_id` antes de aceptar una notificación.
- Renovación cada seis horas de canales próximos a expirar.
- Sincronización incremental cada 15 minutos y full sync diario a las 03:00.
- Protección contra ejecuciones solapadas dentro de una instancia.

### 5. API y agente — completado

Endpoints autenticados bajo `/v1/calendar`:

- `GET /connect`
- `POST /appointments`
- `GET /appointments`
- `GET /availability`
- `PATCH /appointments/:id/reschedule`
- `POST /appointments/:id/cancel`
- `POST /sync` (admin)
- `POST /webhooks/setup` (admin)
- `GET /status` (admin)
- `POST /conflicts/:id/resolve` (admin)

Webhook público validado: `POST /v1/webhooks/google-calendar`.

Las herramientas del agente ahora usan la DB para disponibilidad, alta, cancelación, reprogramación y listado; ya no devuelven IDs o fechas simuladas.

### 6. OAuth y seguridad — completado

- Corrección de la consulta de usuario.
- Un único formato de credenciales (`encrypted_credentials.token`).
- Conservación del refresh token anterior.
- Persistencia automática de tokens renovados.
- Operaciones de sync, setup y monitoreo restringidas a admin/owner.
- URL de webhook obligatoriamente HTTPS.

## Migraciones y despliegue

Orden requerido:

1. Ejecutar `sql/calendar_sync_migration.sql` si aún no se aplicó.
2. Ejecutar `sql/calendar_sync_hardening.sql`.
3. Configurar `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `ENCRYPTION_KEY`, `MAIN_PAGE_URL` y `GOOGLE_CALENDAR_WEBHOOK_URL`.
4. Registrar calendarios y asignarlos a staff.
5. Reconectar Google desde `GET /v1/calendar/connect`.
6. Ejecutar `POST /v1/calendar/webhooks/setup`.
7. Ejecutar una sincronización manual y revisar `GET /v1/calendar/status`.

La migración correctiva no se aplicó automáticamente al servidor remoto durante esta revisión porque el hostname configurado de Supabase no resolvió por DNS. El archivo quedó listo para ejecución controlada.

## Validación

- Compilación NestJS.
- Pruebas unitarias de DB-first, tolerancia a fallo Google, solapamientos, duración al reprogramar, creación multi-calendario, cancelación y manejo de error.
- ESLint sobre todos los archivos modificados del calendario.
- Pendiente de entorno: prueba E2E contra una cuenta Google y la base real después de ejecutar la migración correctiva.

## Fuera de alcance inmediato

El dashboard visual del frontend sigue siendo opcional. La API de estado ya entrega salud, logs y conflictos para construirlo sin acoplar la sincronización al frontend.

En despliegues con varias réplicas conviene reemplazar el bloqueo en memoria del scheduler por un advisory lock de PostgreSQL o un job runner distribuido.
