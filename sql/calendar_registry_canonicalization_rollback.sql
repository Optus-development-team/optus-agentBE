-- Revierte la canonicalización del registro de calendarios.
-- Los eventos que ya hayan sido creados en Google no se eliminan.

BEGIN;

DROP TRIGGER IF EXISTS validate_calendar_registry_staff_company
  ON google_calendar_registry;
DROP FUNCTION IF EXISTS validate_calendar_registry_staff_company();

DROP INDEX IF EXISTS uq_calendar_registry_active_staff;
DROP INDEX IF EXISTS uq_company_integrations_active_provider;

UPDATE company_staff staff
   SET google_calendar_id = snapshot.google_calendar_id,
       google_calendar_name = snapshot.google_calendar_name,
       calendar_color = snapshot.calendar_color,
       updated_at = NOW()
  FROM calendar_registry_canonicalization_snapshots snapshot
 WHERE snapshot.staff_id = staff.id;

CREATE OR REPLACE FUNCTION get_target_calendar_id_for_appointment(
  p_appointment_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_calendar_id TEXT;
  v_staff_id UUID;
  v_company_id UUID;
BEGIN
  SELECT staff_id, company_id, target_calendar_id
    INTO v_staff_id, v_company_id, v_calendar_id
    FROM appointments
   WHERE id = p_appointment_id;

  IF v_calendar_id IS NOT NULL THEN
    RETURN v_calendar_id;
  END IF;

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

  SELECT calendar_id
    INTO v_calendar_id
    FROM google_calendar_registry
   WHERE company_id = v_company_id
     AND is_primary = TRUE
     AND is_active = TRUE
   LIMIT 1;

  RETURN COALESCE(v_calendar_id, 'primary');
END;
$$ LANGUAGE plpgsql;

DROP TABLE IF EXISTS calendar_registry_canonicalization_snapshots;

COMMIT;
