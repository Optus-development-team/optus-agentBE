# Catálogo y Referencia Completa de Tools (Herramientas)

Este documento contiene la documentación exhaustiva de **todas las herramientas (`FunctionTool`)** implementadas en el sistema agéntico de Optus, organizadas por servicio y subagente responsable.

---

## Tabla Resumen de Herramientas

| Herramienta | Servicio Proveedor | Asignada a | Estado |
| :--- | :--- | :--- | :--- |
| [`verify_phone_code`](#1-verify_phone_code) | `OrchestratorToolsService` | Todos los Orquestadores | **Activa** |
| [`check_availability`](#2-check_availability) | `AppointmentToolsService` | `AppointmentClientAgent`, `AppointmentAdminAgent` | **Activa** |
| [`create_appointment`](#3-create_appointment) | `AppointmentToolsService` | `AppointmentClientAgent`, `AppointmentAdminAgent` | **Activa** |
| [`cancel_appointment`](#4-cancel_appointment) | `AppointmentToolsService` | `AppointmentClientAgent`, `AppointmentAdminAgent` | **Activa (Mock/Base)** |
| [`reschedule_appointment`](#5-reschedule_appointment) | `AppointmentToolsService` | `AppointmentClientAgent`, `AppointmentAdminAgent` | **Activa (Mock/Base)** |
| [`list_user_appointments`](#6-list_user_appointments) | `AppointmentToolsService` | `AppointmentAdminAgent` | **Activa (Mock/Base)** |
| [`create_payment_order`](#7-create_payment_order) | `SalesToolsService` | `SalesAgent` | **Activa** |
| [`check_payment_status`](#8-check_payment_status) | `SalesToolsService` | `SalesAgent` | **Activa** |
| [`generate_payment_qr`](#9-generate_payment_qr) | `SalesToolsService` | `SalesAgent` | **Activa** |
| [`sync_inventory`](#10-sync_inventory) | `SalesToolsService` | `SalesAgent` (Admin) | **Activa (Base)** |
| [`search_company_information`](#11-search_company_information) | `KnowledgeBaseToolsService` | `KnowledgeAgent` | **Activa (RAG)** |
| [`get_daily_metrics`](#12-get_daily_metrics) | `ReportingToolsService` | `ReportingAgent` | **Activa (Base)** |
| [`generate_sales_report`](#13-generate_sales_report) | `ReportingToolsService` | `ReportingAgent` | **Activa (Base)** |
| [`get_low_stock_alerts`](#14-get_low_stock_alerts) | `ReportingToolsService` | `ReportingAgent` | **Activa (Base)** |
| [`get_appointments_report`](#15-get_appointments_report) | `ReportingToolsService` | `ReportingAgent` | **Activa (Base)** |
| [`get_business_kpis`](#16-get_business_kpis) | `ReportingToolsService` | `ReportingAgent` | **Activa (Base)** |
| [`list_low_stock_items`](#17-list_low_stock_items) | `ReestockToolsService` | `ReestockAgent` | *TODO / Pendiente* |
| [`create_restock_order`](#18-create_restock_order) | `ReestockToolsService` | `ReestockAgent` | *TODO / Pendiente* |
| [`sync_inventory_snapshot`](#19-sync_inventory_snapshot) | `ReestockToolsService` | `ReestockAgent` | *TODO / Pendiente* |
| [`query_student_grades`](#20-query_student_grades) | `AcademyToolsService` | `AcademyAgent` | *TODO / Pendiente* |
| [`check_student_enrollments`](#21-check_student_enrollments) | `AcademyToolsService` | `AcademyAgent` | *TODO / Pendiente* |
| [`assign_salon_chair`](#22-assign_salon_chair) | `SalonToolsService` | `SalonStylistAgent` | *TODO / Pendiente* |
| [`manage_hairdresser_shifts`](#23-manage_hairdresser_shifts) | `SalonToolsService` | `SalonStylistAgent` | *TODO / Pendiente* |

---

## 1. Herramientas de Orquestación (`OrchestratorToolsService`)

Archivo fuente: `src/core/adk/orchestrator/orchestrator.tools.ts`

### 1. `verify_phone_code`
- **Descripción**: Verifica un código OTP de 6 caracteres enviado por el usuario para validar su identidad telefónica y actualizar su estado a verificado.
- **Asignada a**: Todos los orquestadores (General, Academia, Salón para Client y Admin).
- **Parámetros (Zod Schema)**:
  ```typescript
  {
    senderPhone: z.string().describe('Número de teléfono del usuario'),
    code: z.string().describe('Código OTP extraído del mensaje'),
    whatsappUsername: z.string().optional().describe('Nombre de WhatsApp si está disponible')
  }
  ```
- **Contexto de Sesión**: Lee `app:companyId`.
- **Eventos Emitidos**: `SystemEventType.TOOL_ACTION_TRIGGERED`.
- **Servicios Invocados**: `VerificationService.verifyCode(senderPhone, code)`.
- **Retorno**:
  ```json
  {
    "verified": true
  }
  ```
- **Estado**: **Activa** en producción.

---

## 2. Herramientas de Citas y Calendario (`AppointmentToolsService`)

Archivo fuente: `src/core/adk/agents/general/appointment/appointment.tools.ts`

### 2. `check_availability`
- **Descripción**: Consulta los eventos y huecos disponibles en Google Calendar para una fecha determinada. Acepta fechas en lenguaje natural.
- **Asignada a**: `AppointmentClientAgent`, `AppointmentAdminAgent`.
- **Parámetros (Zod Schema)**:
  ```typescript
  {
    date: z.string().describe('Fecha para consultar (puede ser natural: "mañana", "próximo lunes")'),
    serviceType: z.string().optional().describe('Tipo de servicio a agendar'),
    duration: z.number().optional().describe('Duración estimada en minutos')
  }
  ```
- **Contexto de Sesión**: Lee `app:companyId`, `user:phone`.
- **Flujo Interno**:
  1. Resuelve la fecha con `TimeService.resolveDateBounds(args.date, userPhone)`.
  2. Consulta Google Calendar v3 con `CalendarService.checkAvailability(companyId, resolvedDate.date, userPhone)`.
- **Retorno**:
  ```json
  {
    "success": true,
    "date": "2026-08-19",
    "events": [
      {
        "start": "2026-08-19T14:00:00-04:00",
        "end": "2026-08-19T15:00:00-04:00",
        "summary": "Consulta General"
      }
    ],
    "message": "Encontré estos eventos para 2026-08-19: Consulta General"
  }
  ```
- **Estado**: **Activa**.

---

### 3. `create_appointment`
- **Descripción**: Agenda un nuevo evento/cita en Google Calendar del tenant tras validar disponibilidad.
- **Asignada a**: `AppointmentClientAgent`, `AppointmentAdminAgent`.
- **Parámetros (Zod Schema)**:
  ```typescript
  {
    date: z.string().describe('Fecha de la cita'),
    time: z.string().describe('Hora de la cita (formato 24h, ej: "14:00")'),
    duration: z.string().describe('Duración obligatoria de la cita (ej: "1 hora", "15 minutos")'),
    serviceType: z.string().optional().describe('Tipo de servicio'),
    notes: z.string().optional().describe('Notas adicionales')
  }
  ```
- **Contexto de Sesión**: Lee `app:companyId`, `user:phone`, `user:name`.
- **Flujo Interno**:
  1. Convierte duración a minutos con `TimeService.parseDurationToMinutes(args.duration)`.
  2. Calcula inicio en ISO con `TimeService.buildAppointmentStart(args.date, args.time, userPhone)`.
  3. Crea evento en Google Calendar con `CalendarService.createAppointment(...)`.
  4. Emite evento de negocio `SystemEventType.APPOINTMENT_CREATED`.
- **Retorno**:
  ```json
  {
    "success": true,
    "appointmentId": "cal_evt_987654",
    "link": "https://calendar.google.com/event?eid=...",
    "durationMinutes": 60,
    "timezone": "America/Caracas",
    "message": "Cita agendada correctamente."
  }
  ```
- **Estado**: **Activa**.

---

### 4. `cancel_appointment`
- **Descripción**: Cancela una cita existente por su identificador único.
- **Asignada a**: `AppointmentClientAgent`, `AppointmentAdminAgent`.
- **Parámetros (Zod Schema)**:
  ```typescript
  {
    appointmentId: z.string().describe('ID de la cita a cancelar'),
    reason: z.string().optional().describe('Motivo de la cancelación')
  }
  ```
- **Retorno**:
  ```json
  {
    "success": true,
    "appointmentId": "APT-12345",
    "status": "cancelled",
    "reason": "Cancelada por el usuario",
    "message": "La cita APT-12345 ha sido cancelada. ¿Deseas reagendar?"
  }
  ```
- **Estado**: **Activa (Base)**.

---

### 5. `reschedule_appointment`
- **Descripción**: Reprograma la fecha u hora de una cita agendada.
- **Asignada a**: `AppointmentClientAgent`, `AppointmentAdminAgent`.
- **Parámetros (Zod Schema)**:
  ```typescript
  {
    appointmentId: z.string().describe('ID de la cita a reprogramar'),
    newDate: z.string().describe('Nueva fecha'),
    newTime: z.string().describe('Nueva hora')
  }
  ```
- **Retorno**:
  ```json
  {
    "success": true,
    "appointmentId": "APT-12345",
    "previousDate": "2026-08-20",
    "previousTime": "10:00",
    "newDate": "2026-08-22",
    "newTime": "16:00",
    "status": "rescheduled",
    "message": "Cita APT-12345 reprogramada para 2026-08-22 a las 16:00."
  }
  ```
- **Estado**: **Activa (Base)**.

---

### 6. `list_user_appointments`
- **Descripción**: Lista las citas programadas de un usuario específico. Solo expuesta al subagente administrativo.
- **Asignada a**: `AppointmentAdminAgent` (dentro de `adminTools`).
- **Parámetros (Zod Schema)**:
  ```typescript
  {
    status: z.enum(['all', 'upcoming', 'past', 'cancelled']).optional().describe('Filtrar por estado'),
    limit: z.number().optional().describe('Número máximo de citas a mostrar')
  }
  ```
- **Retorno**:
  ```json
  {
    "success": true,
    "appointments": [
      {
        "id": "APT-001",
        "date": "2026-08-20",
        "time": "10:00",
        "status": "confirmed",
        "serviceType": "Consulta general"
      }
    ],
    "filter": "upcoming",
    "message": "Tienes 1 cita programada próximamente."
  }
  ```
- **Estado**: **Activa (Base)**.

---

## 3. Herramientas de Ventas y Pagos (`SalesToolsService`)

Archivo fuente: `src/core/adk/agents/general/sales/sales.tools.ts`

### 7. `create_payment_order`
- **Descripción**: Crea una orden de pago en estado pendiente (`PENDING_PAYMENT`) en Supabase y genera la URL/enlace de pago.
- **Asignada a**: `SalesAgent`.
- **Parámetros (Zod Schema)**:
  ```typescript
  {
    amount: z.number().describe('Monto total a pagar'),
    description: z.string().optional().describe('Descripción o concepto del pago'),
    products: z.array(z.object({
      productId: z.string(),
      quantity: z.number()
    })).optional().describe('Lista de productos (si aplica)')
  }
  ```
- **Contexto de Sesión**: Lee `app:companyId`, `user:phone`, `app:currency`.
- **Flujo Interno**:
  1. Inserta en la tabla `orders` de Supabase: `company_id`, `user_id`, `total_amount`, `status: PENDING_PAYMENT`.
  2. Emite evento reactivo `SystemEventType.SALES_ORDER_REGISTERED`.
- **Retorno**:
  ```json
  {
    "success": true,
    "orderId": "ORD-1723958400-abc123",
    "amount": 150.0,
    "currency": "USD",
    "status": "pending",
    "companyId": "uuid-tenant",
    "paymentUrl": "https://pay.example.com/ORD-1723958400-abc123",
    "message": "Orden de pago creada por $150. Escanea el QR o usa el link para pagar."
  }
  ```
- **Estado**: **Activa**.

---

### 8. `check_payment_status`
- **Descripción**: Consulta el estado actual de una orden de pago específica o de la última registrada en la sesión.
- **Asignada a**: `SalesAgent`.
- **Parámetros (Zod Schema)**:
  ```typescript
  {
    orderId: z.string().optional().describe('ID de la orden a verificar. Si no se proporciona, busca la más reciente.')
  }
  ```
- **Retorno**:
  ```json
  {
    "success": true,
    "orderId": "ORD-1723958400-abc123",
    "status": "pending",
    "amount": 150.0,
    "currency": "USD",
    "paidAt": null,
    "message": "La orden ORD-1723958400-abc123 está pendiente de pago."
  }
  ```
- **Estado**: **Activa**.

---

### 9. `generate_payment_qr`
- **Descripción**: Genera el código QR para realizar pagos bancarios o móviles.
- **Asignada a**: `SalesAgent`.
- **Parámetros (Zod Schema)**:
  ```typescript
  {
    orderId: z.string().describe('ID de la orden para generar QR'),
    regenerate: z.boolean().optional().describe('Forzar regeneración del QR')
  }
  ```
- **Retorno**:
  ```json
  {
    "success": true,
    "orderId": "ORD-1723958400-abc123",
    "qrUrl": "https://ipfs.example.com/qr/ORD-1723958400-abc123.png",
    "expiresAt": "2026-08-18T01:35:00.000Z",
    "message": "QR generado para la orden ORD-1723958400-abc123. Válido por 30 minutos."
  }
  ```
- **Estado**: **Activa**.

---

### 10. `sync_inventory`
- **Descripción**: Sincroniza el inventario entre Meta Catalog y la base de datos de la empresa (restringido a administradores).
- **Asignada a**: `SalesAgent`.
- **Parámetros (Zod Schema)**:
  ```typescript
  {
    direction: z.enum(['to_meta', 'from_meta', 'both']).optional().describe('Dirección de sincronización')
  }
  ```
- **Contexto de Sesión**: Valida `user:role === 'ADMIN'`.
- **Retorno**:
  ```json
  {
    "success": true,
    "direction": "from_meta",
    "synced": 25,
    "errors": 0,
    "message": "Inventario sincronizado: 25 productos actualizados (from_meta)."
  }
  ```
- **Estado**: **Activa (Base)**.

---

## 4. Herramientas de Base de Conocimiento RAG (`KnowledgeBaseToolsService`)

Archivo fuente: `src/core/adk/agents/general/knowledge/knowledge.tools.ts`

### 11. `search_company_information`
- **Descripción**: Ejecuta búsqueda semántica y textual sobre la base de conocimiento pública de la empresa en Supabase PostgreSQL.
- **Asignada a**: `KnowledgeAgent`.
- **Parámetros (Zod Schema)**:
  ```typescript
  {
    query: z.string().trim().min(1).describe('Consulta breve con palabras clave para buscar información pública de la empresa.')
  }
  ```
- **Contexto de Sesión**: Lee `app:companyId`.
- **Flujo Interno**:
  - Invoca la función RPC de base de datos `public.search_public_knowledge(companyId::uuid, query::text)`.
- **Retorno**:
  ```json
  {
    "success": true,
    "message": "Se encontraron 2 resultado(s) relevantes.",
    "results": [
      {
        "entityName": "Horarios de Atención",
        "data": {
          "dias": "Lunes a Sábado",
          "apertura": "08:00",
          "cierre": "19:00"
        }
      }
    ]
  }
  ```
- **Estado**: **Activa (RAG)**.

---

## 5. Herramientas de Reportes y Métricas (`ReportingToolsService`)

Archivo fuente: `src/core/adk/agents/general/reporting/reporting.tools.ts`

Todas las herramientas de reportes validan estrictamente `user:role === 'ADMIN'`.

### 12. `get_daily_metrics`
- **Parámetros**: `date?: string`, `compareWithPrevious?: boolean`.
- **Retorno**: Métricas de ventas del día, cantidad de órdenes, citas y clientes nuevos.

### 13. `generate_sales_report`
- **Parámetros**: `period: 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'custom'`, `startDate?: string`, `endDate?: string`, `groupBy?: 'day' | 'week' | 'product' | 'payment_method'`.
- **Retorno**: Facturación total, ticket promedio, productos top y desglose por método de pago.

### 14. `get_low_stock_alerts`
- **Parámetros**: `threshold?: number`, `includeOutOfStock?: boolean`.
- **Retorno**: Lista de productos bajo el umbral de stock mínimo o agotados.

### 15. `get_appointments_report`
- **Parámetros**: `period: 'today' | 'week' | 'month'`, `includeNoShows?: boolean`.
- **Retorno**: Total de citas, completadas, canceladas, tasa de ocupación (%) y horas pico.

### 16. `get_business_kpis`
- **Parámetros**: `period: 'week' | 'month' | 'quarter'`.
- **Retorno**: Tasa de retención, tasa de conversión, satisfacción promedio (CSAT) y tiempo medio de respuesta.

---

## 6. Herramientas de Reabastecimiento (`ReestockToolsService`)

Archivo fuente: `src/core/adk/agents/general/reestock/reestock.tools.ts`

### 17. `list_low_stock_items`
- **Parámetros**: `threshold?: number`, `companyId?: string`.
- **Estado**: *TODO / Mock*.

### 18. `create_restock_order`
- **Parámetros**: `items: Array<{ productId: string, quantity: number }>`, `companyId?: string`.
- **Estado**: *TODO / Mock*.

### 19. `sync_inventory_snapshot`
- **Parámetros**: `companyId?: string`, `source?: string`.
- **Estado**: *TODO / Mock*.

---

## 7. Herramientas Verticales Especializadas

### Vertical Academia (`AcademyToolsService`)
Archivo fuente: `src/core/adk/agents/verticals/academy/academy.tools.ts`

### 20. `query_student_grades`
- **Descripción**: Consulta notas académicas por código o ID de estudiante y período.
- **Parámetros**: `studentId: string`, `period?: string`.
- **Estado**: *TODO / Pendiente de integración académica*.

### 21. `check_student_enrollments`
- **Descripción**: Consulta materias e inscripciones activas de un estudiante.
- **Parámetros**: `studentId: string`.
- **Estado**: *TODO / Pendiente de integración académica*.

---

### Vertical Salón de Belleza (`SalonToolsService`)
Archivo fuente: `src/core/adk/agents/verticals/salon/salon.tools.ts`

### 22. `assign_salon_chair`
- **Descripción**: Asigna una silla física de peluquería/estética a un estilista en una fecha específica.
- **Parámetros**: `stylistId: string`, `chairId: string`, `shiftDate: string`.
- **Estado**: *TODO / Pendiente de integración operativa*.

### 23. `manage_hairdresser_shifts`
- **Descripción**: Crea, actualiza o cancela turnos de trabajo para estilistas.
- **Parámetros**: `stylistId: string`, `action: 'create' | 'update' | 'cancel'`, `shiftDate: string`, `startTime?: string`, `endTime?: string`.
- **Estado**: *TODO / Pendiente de integración operativa*.
