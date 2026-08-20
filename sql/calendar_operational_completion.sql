-- ============================================================================
-- CALENDARIO OPERATIVO: reglas, seguridad, disponibilidad y notificaciones
-- Ejecutar después de calendar_sync_migration.sql y calendar_sync_hardening.sql.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Metadatos operativos de citas.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES company_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id UUID REFERENCES company_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_appointments_customer_upcoming
  ON appointments(company_id, customer_id, scheduled_start)
  WHERE status IN ('pending', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_appointments_staff_upcoming
  ON appointments(company_id, staff_id, scheduled_start)
  WHERE status IN ('pending', 'confirmed');

-- Evita clientes duplicados cuando dos reservas del mismo teléfono llegan a
-- la vez. Se detiene con un mensaje claro si el respaldo ya contiene duplicados.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM customers
     WHERE is_active = TRUE AND phone IS NOT NULL
     GROUP BY company_id, regexp_replace(phone, '\D', '', 'g')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Hay clientes activos duplicados por teléfono. Unificarlos antes de aplicar calendar_operational_completion.sql';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_company_normalized_phone_active
  ON customers(company_id, regexp_replace(phone, '\D', '', 'g'))
  WHERE is_active = TRUE AND phone IS NOT NULL;

-- Protección final ante solapamientos exactos. La aplicación también toma un
-- advisory lock para aplicar buffers dentro de la misma transacción.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM appointments a
    JOIN appointments b
      ON a.company_id = b.company_id
     AND a.staff_id = b.staff_id
     AND a.id < b.id
     AND a.status IN ('pending', 'confirmed')
     AND b.status IN ('pending', 'confirmed')
     AND tsrange(a.scheduled_start, a.scheduled_end, '[)')
         && tsrange(b.scheduled_start, b.scheduled_end, '[)')
  ) THEN
    RAISE EXCEPTION
      'Hay citas solapadas existentes. Resolverlas antes de aplicar calendar_operational_completion.sql';
  END IF;
END $$;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_no_staff_overlap;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_staff_overlap
  EXCLUDE USING gist (
    company_id WITH =,
    staff_id WITH =,
    tsrange(scheduled_start, scheduled_end, '[)') WITH &&
  )
  WHERE (staff_id IS NOT NULL AND status IN ('pending', 'confirmed'));

-- Servicios que cada empleado puede realizar.
CREATE TABLE IF NOT EXISTS staff_catalog_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES company_staff(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  custom_duration_minutes INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_staff_catalog_service UNIQUE (staff_id, catalog_item_id),
  CONSTRAINT chk_staff_service_duration
    CHECK (custom_duration_minutes IS NULL OR custom_duration_minutes > 0)
);
CREATE INDEX IF NOT EXISTS idx_staff_services_company_item
  ON staff_catalog_services(company_id, catalog_item_id)
  WHERE is_active = TRUE;

-- Horario semanal del empleado. day_of_week usa 0=domingo ... 6=sábado.
CREATE TABLE IF NOT EXISTS staff_working_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES company_staff(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  effective_from DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_staff_working_day CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT chk_staff_working_range CHECK (start_time < end_time)
);
CREATE INDEX IF NOT EXISTS idx_staff_working_hours_lookup
  ON staff_working_hours(company_id, staff_id, day_of_week)
  WHERE is_active = TRUE;

-- Ausencias, vacaciones, descansos extraordinarios o bloqueos.
CREATE TABLE IF NOT EXISTS staff_time_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES company_staff(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  created_by_user_id UUID REFERENCES company_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_staff_time_off_range CHECK (starts_at < ends_at),
  CONSTRAINT chk_staff_time_off_status
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_staff_time_off_lookup
  ON staff_time_off(company_id, staff_id, starts_at, ends_at)
  WHERE status = 'approved';

-- Historial de negocio, separado de los logs técnicos de sincronización.
CREATE TABLE IF NOT EXISTS appointment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES company_users(id) ON DELETE SET NULL,
  actor_staff_id UUID REFERENCES company_staff(id) ON DELETE SET NULL,
  actor_phone TEXT,
  previous_state JSONB,
  new_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_appointment_audit_actor
    CHECK (actor_type IN ('owner', 'admin', 'staff', 'customer', 'system', 'google'))
);
CREATE INDEX IF NOT EXISTS idx_appointment_audit_lookup
  ON appointment_audit_logs(company_id, appointment_id, created_at DESC);

-- Cola de confirmaciones y recordatorios WhatsApp.
CREATE TABLE IF NOT EXISTS appointment_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  recipient TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_appointment_notification_type
    CHECK (notification_type IN (
      'confirmation', 'reminder_24h', 'reminder_2h',
      'rescheduled', 'cancelled', 'staff_assigned'
    )),
  CONSTRAINT chk_appointment_notification_status
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_appointment_notifications_due
  ON appointment_notifications(status, scheduled_at)
  WHERE status = 'pending';

-- Cola persistente para webhooks y reintentos de sincronización.
CREATE TABLE IF NOT EXISTS calendar_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  calendar_id TEXT,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_calendar_sync_job_type
    CHECK (job_type IN ('webhook_sync', 'incremental_sync', 'full_sync', 'retry')),
  CONSTRAINT chk_calendar_sync_job_status
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_jobs_due
  ON calendar_sync_jobs(status, run_after)
  WHERE status = 'pending';

-- RLS para nuevas tablas.
ALTER TABLE staff_catalog_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_sync_jobs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
  policy_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'staff_catalog_services',
    'staff_working_hours',
    'staff_time_off',
    'appointment_audit_logs',
    'appointment_notifications',
    'calendar_sync_jobs'
  ]
  LOOP
    policy_name := table_name || '_company_isolation';
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL
       USING (company_id IN (
         SELECT company_id FROM company_users WHERE id = auth.uid()
       ))
       WITH CHECK (company_id IN (
         SELECT company_id FROM company_users WHERE id = auth.uid()
       ))',
      policy_name,
      table_name
    );
  END LOOP;
END $$;

COMMIT;
