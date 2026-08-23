-- Correcciones posteriores a calendar_sync_migration.sql.
-- Esta migración es idempotente y debe ejecutarse después de la migración base.

BEGIN;

-- Multi-calendario: un event_id solo es único dentro de un calendario.
DROP INDEX IF EXISTS idx_appointments_google_unique;
UPDATE appointments
   SET target_calendar_id = get_target_calendar_id_for_appointment(id)
 WHERE google_calendar_event_id IS NOT NULL
   AND target_calendar_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_google_event_per_calendar
  ON appointments(company_id, COALESCE(target_calendar_id, 'primary'), google_calendar_event_id)
  WHERE google_calendar_event_id IS NOT NULL AND google_calendar_event_id <> '';

-- Un webhook de Google corresponde a un calendario. Los campos únicos de
-- company_integrations no alcanzan para empresas con varios calendarios.
CREATE TABLE IF NOT EXISTS google_calendar_webhook_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  resource_id TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  expiration TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_google_webhook_active_calendar
  ON google_calendar_webhook_channels(company_id, calendar_id)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_google_webhook_expiration
  ON google_calendar_webhook_channels(expiration)
  WHERE is_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_google_webhook_channel_resource
  ON google_calendar_webhook_channels(channel_id, resource_id);

ALTER TABLE google_calendar_webhook_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS google_webhook_channels_company_isolation
  ON google_calendar_webhook_channels;
CREATE POLICY google_webhook_channels_company_isolation
  ON google_calendar_webhook_channels FOR ALL
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ));

-- Hace repetible la migración base en ambientes donde se reconstruye el schema.
DROP POLICY IF EXISTS calendar_sync_logs_company_isolation ON calendar_sync_logs;
CREATE POLICY calendar_sync_logs_company_isolation ON calendar_sync_logs
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS calendar_sync_conflicts_company_isolation
  ON calendar_sync_conflicts;
CREATE POLICY calendar_sync_conflicts_company_isolation
  ON calendar_sync_conflicts FOR ALL
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS google_calendar_registry_company_isolation
  ON google_calendar_registry;
CREATE POLICY google_calendar_registry_company_isolation
  ON google_calendar_registry FOR ALL
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM company_users WHERE id = auth.uid()
  ));

COMMIT;
