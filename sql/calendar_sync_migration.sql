-- =========================================================================
-- MIGRACIÓN: Sistema de Sincronización Google Calendar
-- Base de datos: Supabase PostgreSQL (optus-agentBE)
-- Fecha: 2026-08-18
-- Propósito: Agregar capacidades de sincronización bidireccional entre 
--            la tabla appointments y Google Calendar
-- =========================================================================


BEGIN;

-- =========================================================================
-- SECCIÓN 1: MODIFICAR TABLA appointments
-- =========================================================================

-- Agregar campos para sincronización con Google Calendar
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_link TEXT,
ADD COLUMN IF NOT EXISTS external_event_id TEXT,
ADD COLUMN IF NOT EXISTS external_provider TEXT,
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS sync_error_message TEXT,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS google_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS db_updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS sync_direction TEXT DEFAULT 'bidirectional',
ADD COLUMN IF NOT EXISTS conflict_resolution TEXT,
ADD COLUMN IF NOT EXISTS target_calendar_id TEXT;

-- Comentarios para documentación
COMMENT ON COLUMN appointments.google_calendar_event_id IS 'ID único del evento en Google Calendar';
COMMENT ON COLUMN appointments.google_calendar_link IS 'URL pública del evento en Google Calendar';
COMMENT ON COLUMN appointments.external_event_id IS 'ID genérico para otros proveedores (Outlook, iCal)';
COMMENT ON COLUMN appointments.external_provider IS 'Proveedor del calendario externo: GOOGLE_CALENDAR, OUTLOOK, ICAL';
COMMENT ON COLUMN appointments.sync_status IS 'Estado de sincronización: pending, synced, error, conflict';
COMMENT ON COLUMN appointments.sync_error_message IS 'Mensaje de error si falla la sincronización';
COMMENT ON COLUMN appointments.last_synced_at IS 'Timestamp de la última sincronización exitosa';
COMMENT ON COLUMN appointments.google_updated_at IS 'Timestamp de última modificación en Google Calendar';
COMMENT ON COLUMN appointments.db_updated_at IS 'Timestamp de última modificación en la base de datos (auto-actualizado)';
COMMENT ON COLUMN appointments.sync_direction IS 'Dirección de sincronización: db_to_google, google_to_db, bidirectional';
COMMENT ON COLUMN appointments.conflict_resolution IS 'Estrategia de resolución de conflictos: google_wins, db_wins, manual';
COMMENT ON COLUMN appointments.target_calendar_id IS 'ID del calendario específico de Google (ej: primary, c_abc@group.calendar.google.com). Si NULL, usa el calendario del staff asignado';

-- Constraints para validar valores
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_sync_status;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_external_provider;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_sync_direction;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_conflict_resolution;

ALTER TABLE appointments 
ADD CONSTRAINT chk_appointments_sync_status 
CHECK (sync_status IN ('pending', 'synced', 'error', 'conflict'));

ALTER TABLE appointments 
ADD CONSTRAINT chk_appointments_external_provider 
CHECK (external_provider IS NULL OR external_provider IN ('GOOGLE_CALENDAR', 'OUTLOOK', 'ICAL', 'OTHER'));

ALTER TABLE appointments 
ADD CONSTRAINT chk_appointments_sync_direction 
CHECK (sync_direction IN ('db_to_google', 'google_to_db', 'bidirectional', 'none'));

ALTER TABLE appointments 
ADD CONSTRAINT chk_appointments_conflict_resolution 
CHECK (conflict_resolution IS NULL OR conflict_resolution IN ('google_wins', 'db_wins', 'manual'));

-- =========================================================================
-- SECCIÓN 2: ÍNDICES PARA OPTIMIZACIÓN
-- =========================================================================

-- Índice para búsqueda por evento de Google (debe ser rápido)
CREATE INDEX IF NOT EXISTS idx_appointments_google_event_id 
ON appointments(company_id, google_calendar_event_id) 
WHERE google_calendar_event_id IS NOT NULL;

-- Índice para monitoreo de estado de sincronización
CREATE INDEX IF NOT EXISTS idx_appointments_sync_status 
ON appointments(company_id, sync_status);

-- Índice para consultas de sincronización incremental
CREATE INDEX IF NOT EXISTS idx_appointments_last_synced 
ON appointments(company_id, last_synced_at DESC NULLS LAST);

-- Índice para agenda de staff (consulta frecuente)
CREATE INDEX IF NOT EXISTS idx_appointments_staff_schedule 
ON appointments(company_id, staff_id, scheduled_start DESC) 
WHERE status NOT IN ('cancelled', 'no_show');

-- Índice para detectar eventos que necesitan sincronización
CREATE INDEX IF NOT EXISTS idx_appointments_needs_sync
ON appointments(company_id, sync_status, updated_at DESC)
WHERE sync_status IN ('pending', 'error');

-- Índice compuesto para rango de fechas (reportes y disponibilidad)
CREATE INDEX IF NOT EXISTS idx_appointments_date_range
ON appointments(company_id, scheduled_start, scheduled_end)
WHERE status NOT IN ('cancelled', 'no_show');

-- Constraint único para evitar duplicados de eventos de Google
-- Solo si google_calendar_event_id tiene valor
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_google_event_per_calendar
ON appointments(company_id, COALESCE(target_calendar_id, 'primary'), google_calendar_event_id)
WHERE google_calendar_event_id IS NOT NULL AND google_calendar_event_id != '';

-- =========================================================================
-- SECCIÓN 3: TRIGGER PARA ACTUALIZAR db_updated_at
-- =========================================================================

-- Función para actualizar automáticamente db_updated_at
CREATE OR REPLACE FUNCTION update_appointments_db_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo actualizar si realmente cambió algo significativo
  IF (OLD.scheduled_start IS DISTINCT FROM NEW.scheduled_start) OR
     (OLD.scheduled_end IS DISTINCT FROM NEW.scheduled_end) OR
     (OLD.title IS DISTINCT FROM NEW.title) OR
     (OLD.description IS DISTINCT FROM NEW.description) OR
     (OLD.location IS DISTINCT FROM NEW.location) OR
     (OLD.status IS DISTINCT FROM NEW.status) OR
     (OLD.staff_id IS DISTINCT FROM NEW.staff_id) OR
     (OLD.customer_id IS DISTINCT FROM NEW.customer_id) THEN
    NEW.db_updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger si no existe
DROP TRIGGER IF EXISTS trg_appointments_db_updated_at ON appointments;
CREATE TRIGGER trg_appointments_db_updated_at
BEFORE UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION update_appointments_db_updated_at();

-- =========================================================================
-- SECCIÓN 4: NUEVA TABLA calendar_sync_logs
-- =========================================================================

CREATE TABLE IF NOT EXISTS calendar_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  sync_type TEXT NOT NULL,
  sync_direction TEXT NOT NULL,
  status TEXT NOT NULL,
  events_processed INTEGER DEFAULT 0,
  events_created INTEGER DEFAULT 0,
  events_updated INTEGER DEFAULT 0,
  events_deleted INTEGER DEFAULT 0,
  events_skipped INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  error_details JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  triggered_by TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_sync_logs_sync_type 
    CHECK (sync_type IN ('full_sync', 'incremental', 'webhook', 'manual', 'retry')),
  CONSTRAINT chk_sync_logs_sync_direction 
    CHECK (sync_direction IN ('db_to_google', 'google_to_db', 'bidirectional')),
  CONSTRAINT chk_sync_logs_status 
    CHECK (status IN ('success', 'partial_success', 'error', 'in_progress'))
);

-- Comentarios
COMMENT ON TABLE calendar_sync_logs IS 'Registro de todas las operaciones de sincronización con calendarios externos';
COMMENT ON COLUMN calendar_sync_logs.sync_type IS 'Tipo de sincronización ejecutada';
COMMENT ON COLUMN calendar_sync_logs.sync_direction IS 'Dirección de la sincronización';
COMMENT ON COLUMN calendar_sync_logs.triggered_by IS 'Origen del trigger: cron, webhook, user, agent, system';
COMMENT ON COLUMN calendar_sync_logs.metadata IS 'Datos adicionales: user_id, ip, request_id, etc.';

-- Índices para calendar_sync_logs
CREATE INDEX IF NOT EXISTS idx_sync_logs_company_date 
ON calendar_sync_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_logs_status 
ON calendar_sync_logs(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_logs_appointment 
ON calendar_sync_logs(appointment_id)
WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sync_logs_errors
ON calendar_sync_logs(company_id, errors_count)
WHERE errors_count > 0;

-- =========================================================================
-- SECCIÓN 5: NUEVA TABLA calendar_sync_conflicts
-- =========================================================================

-- =========================================================================
-- SECCIÓN 4.5: NUEVA TABLA google_calendar_registry
-- =========================================================================

CREATE TABLE IF NOT EXISTS google_calendar_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  calendar_name TEXT NOT NULL,
  calendar_description TEXT,
  calendar_type TEXT NOT NULL DEFAULT 'secondary',
  calendar_color TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  assigned_to_staff_id UUID REFERENCES company_staff(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_calendar_registry_type 
    CHECK (calendar_type IN ('primary', 'secondary', 'shared', 'resource')),
  CONSTRAINT uq_calendar_registry_company_calendar
    UNIQUE (company_id, calendar_id)
);

-- Comentarios
COMMENT ON TABLE google_calendar_registry IS 'Registro de todos los calendarios de Google vinculados a la empresa (principal + secundarios por staff)';
COMMENT ON COLUMN google_calendar_registry.calendar_id IS 'ID del calendario en Google (ej: primary, c_abc123@group.calendar.google.com)';
COMMENT ON COLUMN google_calendar_registry.calendar_type IS 'Tipo: primary (del dueño), secondary (creado para staff), shared (compartido), resource (sala/recurso)';
COMMENT ON COLUMN google_calendar_registry.assigned_to_staff_id IS 'Si es calendario de un trabajador específico, su ID';
COMMENT ON COLUMN google_calendar_registry.is_primary IS 'TRUE solo para el calendario principal de la empresa';

-- Índices
CREATE INDEX IF NOT EXISTS idx_calendar_registry_company 
ON google_calendar_registry(company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_calendar_registry_staff 
ON google_calendar_registry(assigned_to_staff_id)
WHERE assigned_to_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_registry_primary
ON google_calendar_registry(company_id)
WHERE is_primary = TRUE AND is_active = TRUE;

-- Constraint: Solo un calendario puede ser primary por empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_registry_primary_per_company
ON google_calendar_registry(company_id)
WHERE is_primary = TRUE AND is_active = TRUE;

-- =========================================================================
-- SECCIÓN 5: NUEVA TABLA calendar_sync_conflicts
-- =========================================================================

CREATE TABLE IF NOT EXISTS calendar_sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  google_calendar_event_id TEXT NOT NULL,
  conflict_type TEXT NOT NULL,
  db_state JSONB NOT NULL,
  google_state JSONB NOT NULL,
  resolution_strategy TEXT,
  resolution_status TEXT DEFAULT 'pending',
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_conflicts_type 
    CHECK (conflict_type IN (
      'time_mismatch', 
      'deleted_in_google', 
      'deleted_in_db', 
      'data_mismatch',
      'duplicate',
      'staff_mismatch',
      'other'
    )),
  CONSTRAINT chk_conflicts_resolution_strategy 
    CHECK (resolution_strategy IS NULL OR resolution_strategy IN (
      'auto_google_wins', 
      'auto_db_wins', 
      'pending_manual',
      'ignore'
    )),
  CONSTRAINT chk_conflicts_resolution_status 
    CHECK (resolution_status IN ('pending', 'resolved', 'ignored', 'escalated'))
);

-- Comentarios
COMMENT ON TABLE calendar_sync_conflicts IS 'Registro de conflictos detectados durante sincronización';
COMMENT ON COLUMN calendar_sync_conflicts.db_state IS 'Snapshot del estado en la base de datos en el momento del conflicto';
COMMENT ON COLUMN calendar_sync_conflicts.google_state IS 'Snapshot del estado en Google Calendar en el momento del conflicto';
COMMENT ON COLUMN calendar_sync_conflicts.resolved_by IS 'user_id o system que resolvió el conflicto';

-- Índices para calendar_sync_conflicts
CREATE INDEX IF NOT EXISTS idx_conflicts_company_status 
ON calendar_sync_conflicts(company_id, resolution_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conflicts_appointment 
ON calendar_sync_conflicts(appointment_id)
WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conflicts_pending
ON calendar_sync_conflicts(company_id, conflict_type)
WHERE resolution_status = 'pending';

-- =========================================================================
-- SECCIÓN 6: MODIFICAR company_integrations
-- =========================================================================

-- =========================================================================
-- SECCIÓN 5.5: MODIFICAR company_staff (CRÍTICO PARA MULTI-CALENDARIO)
-- =========================================================================

-- Agregar mapeo de calendario específico por trabajador
ALTER TABLE company_staff
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_name TEXT,
ADD COLUMN IF NOT EXISTS calendar_color TEXT,
ADD COLUMN IF NOT EXISTS calendar_sync_enabled BOOLEAN DEFAULT TRUE;

-- Comentarios
COMMENT ON COLUMN company_staff.google_calendar_id IS 'ID del calendario de Google específico para este trabajador (ej: primary, c_123abc@group.calendar.google.com). CRÍTICO para multi-staff. Si NULL, se usa el calendario principal de la empresa';
COMMENT ON COLUMN company_staff.google_calendar_name IS 'Nombre descriptivo del calendario (ej: "Agenda Juan - Barbero")';
COMMENT ON COLUMN company_staff.calendar_color IS 'Color del calendario en Google (para identificación visual)';
COMMENT ON COLUMN company_staff.calendar_sync_enabled IS 'Activar/desactivar sincronización para este trabajador específico';

-- Índice para búsqueda rápida de staff por calendario
CREATE INDEX IF NOT EXISTS idx_company_staff_google_calendar
ON company_staff(company_id, google_calendar_id)
WHERE google_calendar_id IS NOT NULL;

-- =========================================================================
-- SECCIÓN 6: MODIFICAR company_integrations
-- =========================================================================

-- Agregar campos específicos de sincronización de Google Calendar
ALTER TABLE company_integrations
ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS sync_frequency_minutes INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS sync_direction TEXT DEFAULT 'bidirectional',
ADD COLUMN IF NOT EXISTS webhook_configured BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS webhook_channel_id TEXT,
ADD COLUMN IF NOT EXISTS webhook_resource_id TEXT,
ADD COLUMN IF NOT EXISTS webhook_expiration TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS webhook_url TEXT,
ADD COLUMN IF NOT EXISTS last_full_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sync_settings JSONB DEFAULT '{}'::jsonb;

-- Comentarios
COMMENT ON COLUMN company_integrations.sync_enabled IS 'Activar/desactivar sincronización automática';
COMMENT ON COLUMN company_integrations.sync_frequency_minutes IS 'Frecuencia de sincronización incremental en minutos';
COMMENT ON COLUMN company_integrations.sync_direction IS 'Dirección de sincronización: to_google, from_google, bidirectional';
COMMENT ON COLUMN company_integrations.webhook_configured IS 'Indica si el webhook de Google Calendar está activo';
COMMENT ON COLUMN company_integrations.webhook_channel_id IS 'ID del canal de notificaciones push de Google Calendar';
COMMENT ON COLUMN company_integrations.webhook_resource_id IS 'ID del recurso watch de Google Calendar';
COMMENT ON COLUMN company_integrations.webhook_expiration IS 'Fecha de expiración del webhook (máx 7 días)';
COMMENT ON COLUMN company_integrations.sync_settings IS 'Configuración adicional: auto_resolve_conflicts, notification_preferences, etc.';

-- Constraint para sync_direction
ALTER TABLE company_integrations DROP CONSTRAINT IF EXISTS chk_integrations_sync_direction;
ALTER TABLE company_integrations ADD CONSTRAINT chk_integrations_sync_direction 
CHECK (sync_direction IN ('to_google', 'from_google', 'bidirectional', 'none'));

-- Índice para buscar webhooks que necesitan renovación
CREATE INDEX IF NOT EXISTS idx_integrations_webhook_expiration 
ON company_integrations(provider, webhook_expiration) 
WHERE webhook_configured = TRUE 
  AND is_active = TRUE 
  AND webhook_expiration IS NOT NULL;

-- Índice para sync activos
CREATE INDEX IF NOT EXISTS idx_integrations_sync_enabled
ON company_integrations(company_id, provider)
WHERE sync_enabled = TRUE AND is_active = TRUE;

-- =========================================================================
-- SECCIÓN 7: MODIFICAR user_integrations
-- =========================================================================

-- Agregar campos para sincronización de calendarios individuales de staff
ALTER TABLE user_integrations
ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS sync_frequency_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS auto_accept_company_appointments BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}'::jsonb;

-- Comentarios
COMMENT ON COLUMN user_integrations.sync_enabled IS 'Activar sincronización del calendario personal del usuario';
COMMENT ON COLUMN user_integrations.auto_accept_company_appointments IS 'Auto-aceptar citas asignadas desde el calendario de la empresa';
COMMENT ON COLUMN user_integrations.notification_preferences IS 'Preferencias de notificación para cambios en el calendario';

-- =========================================================================
-- SECCIÓN 8: VISTAS ÚTILES
-- =========================================================================

-- Vista para appointments con información de sincronización
CREATE OR REPLACE VIEW v_appointments_sync_status AS
SELECT 
  a.id,
  a.company_id,
  a.customer_id,
  a.staff_id,
  a.title,
  a.scheduled_start,
  a.scheduled_end,
  a.status,
  a.google_calendar_event_id,
  a.google_calendar_link,
  a.sync_status,
  a.sync_error_message,
  a.last_synced_at,
  a.db_updated_at,
  a.google_updated_at,
  -- Calcular si necesita sincronización
  CASE 
    WHEN a.sync_status IN ('pending', 'error') THEN TRUE
    WHEN a.db_updated_at > COALESCE(a.last_synced_at, '1970-01-01'::timestamptz) THEN TRUE
    ELSE FALSE
  END AS needs_sync,
  -- Calcular antigüedad del último sync
  EXTRACT(EPOCH FROM (NOW() - a.last_synced_at)) / 60 AS minutes_since_sync,
  -- Información de staff
  cs.first_name AS staff_first_name,
  cs.last_name AS staff_last_name,
  cs.google_calendar_id AS staff_calendar_id,
  cs.google_calendar_name AS staff_calendar_name,
  cs.calendar_sync_enabled AS staff_sync_enabled,
  -- Información de cliente
  c.first_name AS customer_first_name,
  c.last_name AS customer_last_name,
  c.phone AS customer_phone
FROM appointments a
LEFT JOIN company_staff cs ON cs.id = a.staff_id
LEFT JOIN customers c ON c.id = a.customer_id;

COMMENT ON VIEW v_appointments_sync_status IS 'Vista consolidada con información de sincronización de citas';

-- Vista para monitoreo de sincronización por empresa
CREATE OR REPLACE VIEW v_company_sync_health AS
SELECT 
  c.id AS company_id,
  c.name AS company_name,
  COUNT(a.id) AS total_appointments,
  COUNT(a.id) FILTER (WHERE a.sync_status = 'synced') AS synced_count,
  COUNT(a.id) FILTER (WHERE a.sync_status = 'pending') AS pending_count,
  COUNT(a.id) FILTER (WHERE a.sync_status = 'error') AS error_count,
  COUNT(a.id) FILTER (WHERE a.sync_status = 'conflict') AS conflict_count,
  MAX(a.last_synced_at) AS last_sync_time,
  -- Estado de integración
  ci.sync_enabled,
  ci.webhook_configured,
  ci.webhook_expiration,
  ci.last_full_sync_at,
  -- Calcular salud general
  CASE 
    WHEN ci.sync_enabled = FALSE THEN 'disabled'
    WHEN COUNT(a.id) FILTER (WHERE a.sync_status = 'error') > 5 THEN 'critical'
    WHEN COUNT(a.id) FILTER (WHERE a.sync_status = 'pending') > 10 THEN 'warning'
    WHEN ci.webhook_expiration < NOW() + INTERVAL '1 day' THEN 'warning'
    ELSE 'healthy'
  END AS sync_health_status
FROM companies c
LEFT JOIN appointments a ON a.company_id = c.id 
  AND a.status NOT IN ('cancelled', 'no_show')
  AND a.scheduled_start >= NOW() - INTERVAL '30 days'
LEFT JOIN company_integrations ci ON ci.company_id = c.id 
  AND ci.provider = 'GOOGLE_CALENDAR'
GROUP BY c.id, c.name, ci.sync_enabled, ci.webhook_configured, 
         ci.webhook_expiration, ci.last_full_sync_at;

COMMENT ON VIEW v_company_sync_health IS 'Dashboard de salud de sincronización por empresa';

-- =========================================================================
-- SECCIÓN 9: FUNCIONES ÚTILES
-- =========================================================================

-- Función para obtener el calendar_id correcto para una cita
CREATE OR REPLACE FUNCTION get_target_calendar_id_for_appointment(
  p_appointment_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_calendar_id TEXT;
  v_staff_id UUID;
  v_company_id UUID;
BEGIN
  -- Obtener datos de la cita
  SELECT staff_id, company_id, target_calendar_id
  INTO v_staff_id, v_company_id, v_calendar_id
  FROM appointments
  WHERE id = p_appointment_id;

  -- Si la cita ya tiene un target_calendar_id específico, usarlo
  IF v_calendar_id IS NOT NULL THEN
    RETURN v_calendar_id;
  END IF;

  -- Si hay staff asignado, buscar su calendario
  IF v_staff_id IS NOT NULL THEN
    SELECT google_calendar_id
    INTO v_calendar_id
    FROM company_staff
    WHERE id = v_staff_id
      AND google_calendar_id IS NOT NULL
      AND calendar_sync_enabled = TRUE;
    
    IF v_calendar_id IS NOT NULL THEN
      RETURN v_calendar_id;
    END IF;
  END IF;

  -- Fallback: usar el calendario principal de la empresa
  SELECT calendar_id
  INTO v_calendar_id
  FROM google_calendar_registry
  WHERE company_id = v_company_id
    AND is_primary = TRUE
    AND is_active = TRUE
  LIMIT 1;

  -- Si aún no hay, usar 'primary' como último recurso
  RETURN COALESCE(v_calendar_id, 'primary');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_target_calendar_id_for_appointment IS 'Determina el calendar_id de Google correcto para sincronizar una cita (prioridad: target_calendar_id explícito > calendario del staff > calendario principal empresa > "primary")';

-- Función para marcar appointment como necesita sincronización
CREATE OR REPLACE FUNCTION mark_appointment_needs_sync(p_appointment_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE appointments
  SET sync_status = 'pending',
      db_updated_at = NOW()
  WHERE id = p_appointment_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_appointment_needs_sync IS 'Marca una cita para re-sincronización';

-- Función para obtener appointments que necesitan sincronización
CREATE OR REPLACE FUNCTION get_appointments_needing_sync(
  p_company_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  google_calendar_event_id TEXT,
  scheduled_start TIMESTAMP,
  scheduled_end TIMESTAMP,
  sync_status TEXT,
  last_synced_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.google_calendar_event_id,
    a.scheduled_start,
    a.scheduled_end,
    a.sync_status,
    a.last_synced_at
  FROM appointments a
  WHERE a.company_id = p_company_id
    AND a.status NOT IN ('cancelled', 'no_show')
    AND (
      a.sync_status IN ('pending', 'error')
      OR a.db_updated_at > COALESCE(a.last_synced_at, '1970-01-01'::timestamptz)
    )
  ORDER BY 
    CASE a.sync_status
      WHEN 'pending' THEN 1
      WHEN 'error' THEN 2
      ELSE 3
    END,
    a.db_updated_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_appointments_needing_sync IS 'Obtiene citas que necesitan sincronización, priorizadas';

-- =========================================================================
-- SECCIÓN 10: POLÍTICAS RLS (Row Level Security)
-- =========================================================================

-- Habilitar RLS en nuevas tablas
ALTER TABLE calendar_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_calendar_registry ENABLE ROW LEVEL SECURITY;

-- Política para calendar_sync_logs: solo acceso dentro de la misma empresa
DROP POLICY IF EXISTS calendar_sync_logs_company_isolation ON calendar_sync_logs;
CREATE POLICY calendar_sync_logs_company_isolation ON calendar_sync_logs
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ));

-- Política para calendar_sync_conflicts: solo acceso dentro de la misma empresa
DROP POLICY IF EXISTS calendar_sync_conflicts_company_isolation ON calendar_sync_conflicts;
CREATE POLICY calendar_sync_conflicts_company_isolation ON calendar_sync_conflicts
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ));

-- Política para google_calendar_registry: solo acceso dentro de la misma empresa
DROP POLICY IF EXISTS google_calendar_registry_company_isolation ON google_calendar_registry;
CREATE POLICY google_calendar_registry_company_isolation ON google_calendar_registry
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ));

-- =========================================================================
-- SECCIÓN 11: DATOS INICIALES Y ACTUALIZACIÓN
-- =========================================================================

-- Actualizar appointments existentes con valores por defecto
UPDATE appointments
SET 
  sync_status = 'pending',
  db_updated_at = COALESCE(updated_at, created_at),
  sync_direction = 'bidirectional'
WHERE sync_status IS NULL;

-- Actualizar company_integrations de Google Calendar existentes
UPDATE company_integrations
SET 
  sync_enabled = TRUE,
  sync_frequency_minutes = 15,
  sync_direction = 'bidirectional'
WHERE provider = 'GOOGLE_CALENDAR' 
  AND sync_enabled IS NULL;

-- =========================================================================
-- FINALIZACIÓN
-- =========================================================================

COMMIT;

-- Verificar resultados
DO $$
BEGIN
  RAISE NOTICE '>>> Migración completada exitosamente';
  RAISE NOTICE '>>> Ejecutar las siguientes consultas para verificar:';
  RAISE NOTICE 'SELECT COUNT(*) FROM appointments WHERE google_calendar_event_id IS NOT NULL;';
  RAISE NOTICE 'SELECT * FROM v_company_sync_health;';
  RAISE NOTICE 'SELECT COUNT(*) FROM calendar_sync_logs;';
END $$;

-- =========================================================================
-- ROLLBACK (en caso de problemas)
-- =========================================================================
-- Para revertir esta migración, ejecutar:
/*
BEGIN;

-- Eliminar vistas
DROP VIEW IF EXISTS v_company_sync_health;
DROP VIEW IF EXISTS v_appointments_sync_status;

-- Eliminar funciones
DROP FUNCTION IF EXISTS get_appointments_needing_sync(UUID, INTEGER);
DROP FUNCTION IF EXISTS mark_appointment_needs_sync(UUID);
DROP FUNCTION IF EXISTS update_appointments_db_updated_at();

-- Eliminar triggers
DROP TRIGGER IF EXISTS trg_appointments_db_updated_at ON appointments;

-- Eliminar tablas nuevas
DROP TABLE IF EXISTS calendar_sync_conflicts;
DROP TABLE IF EXISTS calendar_sync_logs;

-- Eliminar columnas de appointments
ALTER TABLE appointments
DROP COLUMN IF EXISTS conflict_resolution,
DROP COLUMN IF EXISTS sync_direction,
DROP COLUMN IF EXISTS db_updated_at,
DROP COLUMN IF EXISTS google_updated_at,
DROP COLUMN IF EXISTS last_synced_at,
DROP COLUMN IF EXISTS sync_error_message,
DROP COLUMN IF EXISTS sync_status,
DROP COLUMN IF EXISTS external_provider,
DROP COLUMN IF EXISTS external_event_id,
DROP COLUMN IF EXISTS google_calendar_link,
DROP COLUMN IF EXISTS google_calendar_event_id;

-- Eliminar columnas de company_integrations
ALTER TABLE company_integrations
DROP COLUMN IF EXISTS sync_settings,
DROP COLUMN IF EXISTS last_full_sync_at,
DROP COLUMN IF EXISTS webhook_url,
DROP COLUMN IF EXISTS webhook_expiration,
DROP COLUMN IF EXISTS webhook_resource_id,
DROP COLUMN IF EXISTS webhook_channel_id,
DROP COLUMN IF EXISTS webhook_configured,
DROP COLUMN IF EXISTS sync_direction,
DROP COLUMN IF EXISTS sync_frequency_minutes,
DROP COLUMN IF EXISTS sync_enabled;

-- Eliminar columnas de user_integrations
ALTER TABLE user_integrations
DROP COLUMN IF EXISTS notification_preferences,
DROP COLUMN IF EXISTS auto_accept_company_appointments,
DROP COLUMN IF EXISTS sync_frequency_minutes,
DROP COLUMN IF EXISTS sync_enabled;

COMMIT;
*/
