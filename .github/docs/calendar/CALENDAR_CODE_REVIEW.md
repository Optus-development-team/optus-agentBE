# Revisión técnica y refactor del módulo Calendar

Fecha: 2026-08-20

## Resultado

El diseño general es correcto: PostgreSQL mantiene la fuente de verdad, la disponibilidad se calcula desde reglas del negocio y Google Calendar funciona como una integración recuperable. El aislamiento por `company_id`, los permisos por actor y la restricción de solapamiento por empleado son coherentes con el dominio.

La revisión detectó y corrigió los siguientes problemas:

| Riesgo | Corrección aplicada |
|---|---|
| Una cita podía bloquearse a sí misma al reprogramarse | La consulta de disponibilidad admite `excludeAppointmentId` |
| Carrera entre validar y actualizar una reprogramación | Reprogramación transaccional con advisory lock, buffer y segunda validación |
| Clientes duplicados por formatos de teléfono o reservas simultáneas | Normalización, lock por teléfono e índice único normalizado |
| Cancelar citas terminadas o reabrir estados finales | Matriz explícita de transiciones e idempotencia |
| Un cliente podía indicar un calendario Google arbitrario | `targetCalendarId` queda reservado a administradores |
| Usuario de otra empresa asignable como empleado | Validación previa de pertenencia a la empresa |
| Horarios de empleado o negocio solapados | Validación de intervalos y locks de configuración |
| Zona horaria o fecha normalizada silenciosamente | Validación estricta de zona, fecha y rangos |
| Doble mensaje inmediato al reprogramar | Se envía aviso de reprogramación sin una segunda confirmación |
| Jobs/notificaciones atascados tras un reinicio | Recuperación de elementos `processing` antiguos |
| Mensajes enviados después de finalizar/cancelar | Validación del estado actual antes del envío |
| Fallo secundario devolvía error después de guardar la cita | Auditoría/notificaciones aisladas y reconciliación periódica |
| Actualización incompleta de servicios | Precio, moneda y capacidad también pueden actualizarse |
| Lectura de configuración mediante rutas administrativas por clientes | Los GET administrativos ahora exigen rol administrativo |

## Propiedades conservadas

- Varias citas pueden ocupar la misma hora si pertenecen a empleados diferentes.
- Un empleado no puede tener citas activas solapadas.
- Los buffers también se respetan bajo concurrencia.
- Una cita se conserva aunque Google Calendar no esté disponible.
- Los contratos HTTP existentes no fueron renombrados ni eliminados.
- Los cambios de Google continúan procesándose mediante webhook, cola y sincronización programada.

## Deuda técnica restante

1. `appointments.scheduled_start` y `scheduled_end` provienen del respaldo como `timestamp without time zone`. El código usa ISO y zona de empresa, pero una migración futura a `TIMESTAMPTZ` reduciría ambigüedades. Debe planificarse porque existen vistas y funciones dependientes.
2. Faltan pruebas de integración con PostgreSQL real para constraints, RLS, locks y carreras simultáneas. Las pruebas actuales verifican servicios y sincronización mediante dobles.
3. `capacity` sigue siendo informativa para reservas individuales. Las clases grupales requieren una entidad sesión/cupo y una regla de concurrencia distinta.
4. `AppointmentRepository` concentra consultas de citas, integraciones y calendarios. Puede dividirse en repositorios menores cuando el módulo crezca; hacerlo ahora aportaría principalmente organización y aumentaría el riesgo de una regresión sin mejorar el comportamiento.
5. La migración operativa debe probarse contra una copia real del respaldo antes de producción. El entorno actual no pudo resolver el hostname configurado de Supabase.

## Verificación

- Compilación Nest/TypeScript.
- Pruebas unitarias y de regresión.
- ESLint y Prettier sobre todo `src/features/calendar`.
- `git diff --check`.
- Arranque del módulo y registro de rutas realizado previamente.
