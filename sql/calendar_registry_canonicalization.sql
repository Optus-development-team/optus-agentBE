-- Estandariza google_calendar_registry como fuente canónica del calendario.
-- La credencial OAuth pertenece a la empresa/dueño y puede administrar varios
-- calendarios; cada calendario se asigna al staff desde el registro central.

BEGIN;

CREATE TABLE IF NOT EXISTS calendar_registry_canonicalization_snapshots (
  staff_id UUID PRIMARY KEY REFERENCES company_staff(id) ON DELETE CASCADE,
  google_calendar_id TEXT,
  google_calendar_name TEXT,
  calendar_color TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO calendar_registry_canonicalization_snapshots (
  staff_id, google_calendar_id, google_calendar_name, calendar_color
)
SELECT id, google_calendar_id, google_calendar_name, calendar_color
  FROM company_staff
ON CONFLICT (staff_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM google_calendar_registry
     WHERE is_active = TRUE AND assigned_to_staff_id IS NOT NULL
     GROUP BY company_id, assigned_to_staff_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Hay empleados con más de un calendario activo en google_calendar_registry';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM company_integrations
     WHERE is_active = TRUE
     GROUP BY company_id, provider
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Hay más de una integración activa para la misma empresa y proveedor';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_registry_active_staff
  ON google_calendar_registry(company_id, assigned_to_staff_id)
  WHERE is_active = TRUE AND assigned_to_staff_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_integrations_active_provider
  ON company_integrations(company_id, provider)
  WHERE is_active = TRUE;

CREATE OR REPLACE FUNCTION validate_calendar_registry_staff_company()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to_staff_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM company_staff staff
     WHERE staff.id = NEW.assigned_to_staff_id
       AND staff.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION
      'El empleado % no pertenece a la empresa %',
      NEW.assigned_to_staff_id,
      NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_calendar_registry_staff_company
  ON google_calendar_registry;
CREATE TRIGGER validate_calendar_registry_staff_company
BEFORE INSERT OR UPDATE OF company_id, assigned_to_staff_id
ON google_calendar_registry
FOR EACH ROW
EXECUTE FUNCTION validate_calendar_registry_staff_company();

-- Mantiene los campos legados como espejo para consumidores antiguos. El
-- backend deja de leerlos para resolver o priorizar calendarios.
UPDATE company_staff staff
   SET google_calendar_id = registry.calendar_id,
       google_calendar_name = registry.calendar_name,
       calendar_color = registry.calendar_color,
       updated_at = NOW()
  FROM google_calendar_registry registry
 WHERE registry.company_id = staff.company_id
   AND registry.assigned_to_staff_id = staff.id
   AND registry.is_active = TRUE
   AND (
     staff.google_calendar_id IS DISTINCT FROM registry.calendar_id OR
     staff.google_calendar_name IS DISTINCT FROM registry.calendar_name OR
     staff.calendar_color IS DISTINCT FROM registry.calendar_color
   );

CREATE OR REPLACE FUNCTION get_target_calendar_id_for_appointment(
  p_appointment_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_calendar_id TEXT;
  v_explicit_calendar_id TEXT;
  v_staff_id UUID;
  v_company_id UUID;
BEGIN
  SELECT staff_id, company_id, target_calendar_id
    INTO v_staff_id, v_company_id, v_explicit_calendar_id
    FROM appointments
   WHERE id = p_appointment_id;

  IF v_company_id IS NULL THEN
    RETURN 'primary';
  END IF;

  -- Un destino explícito solo es válido si pertenece al registro activo de
  -- la empresa. Evita escribir en calendarios obsoletos o de otro tenant.
  IF v_explicit_calendar_id IS NOT NULL THEN
    SELECT registry.calendar_id
      INTO v_calendar_id
      FROM google_calendar_registry registry
     WHERE registry.company_id = v_company_id
       AND registry.calendar_id = v_explicit_calendar_id
       AND registry.is_active = TRUE
     LIMIT 1;

    IF v_calendar_id IS NOT NULL THEN
      RETURN v_calendar_id;
    END IF;
  END IF;

  -- Fuente canónica: calendario activo asignado al empleado.
  IF v_staff_id IS NOT NULL THEN
    SELECT registry.calendar_id
      INTO v_calendar_id
      FROM google_calendar_registry registry
     WHERE registry.company_id = v_company_id
       AND registry.assigned_to_staff_id = v_staff_id
       AND registry.is_active = TRUE
     ORDER BY registry.is_primary DESC, registry.created_at ASC
     LIMIT 1;

    IF v_calendar_id IS NOT NULL THEN
      RETURN v_calendar_id;
    END IF;
  END IF;

  -- Calendario predeterminado de la empresa; no es otra credencial OAuth.
  SELECT registry.calendar_id
    INTO v_calendar_id
    FROM google_calendar_registry registry
   WHERE registry.company_id = v_company_id
     AND registry.is_primary = TRUE
     AND registry.is_active = TRUE
   ORDER BY registry.created_at ASC
   LIMIT 1;

  RETURN COALESCE(v_calendar_id, 'primary');
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_target_calendar_id_for_appointment(UUID) IS
  'Resuelve el calendario usando: destino explícito registrado > registro activo del staff > calendario predeterminado de empresa > primary. google_calendar_registry es la fuente canónica.';

COMMIT;
