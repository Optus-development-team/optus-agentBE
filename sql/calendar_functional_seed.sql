-- Datos mínimos, reales e idempotentes para probar Calendar de extremo a extremo.
-- Selecciona la empresa que ya tenga Google Calendar conectado.
-- Se puede ejecutar varias veces desde Supabase SQL Editor sin duplicar datos.

BEGIN;

DO $$
DECLARE
  v_company_id UUID;
  v_staff_id UUID;
  v_service_id UUID;
  v_service_name TEXT;
BEGIN
  SELECT c.id
    INTO v_company_id
    FROM companies c
    JOIN company_integrations ci
      ON ci.company_id = c.id
     AND ci.provider = 'GOOGLE_CALENDAR'
     AND ci.is_active = TRUE
   WHERE c.is_active = TRUE
   ORDER BY ci.updated_at DESC NULLS LAST
   LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION
      'No existe una empresa activa con Google Calendar conectado';
  END IF;

  SELECT id
    INTO v_staff_id
    FROM company_staff
   WHERE company_id = v_company_id
     AND is_active = TRUE
   ORDER BY created_at
   LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION
      'La empresa conectada no tiene personal activo; créalo desde /v1/calendar/admin/staff';
  END IF;

  SELECT CASE vertical
           WHEN 'salon' THEN 'Corte clásico'
           WHEN 'academy' THEN 'Sesión de asesoría académica'
           ELSE 'Reunión de atención'
         END
    INTO v_service_name
    FROM companies
   WHERE id = v_company_id;

  SELECT id
    INTO v_service_id
    FROM catalog_items
   WHERE company_id = v_company_id
     AND metadata->>'seed_key' = 'calendar-functional-v1'
   LIMIT 1;

  IF v_service_id IS NULL THEN
    INSERT INTO catalog_items (
      company_id, item_type, name, description, category,
      sale_price, currency, duration_minutes, capacity,
      is_active, is_bookable, is_sellable, metadata
    )
    SELECT
      id, 'service', v_service_name,
      'Servicio habilitado para la prueba funcional de agenda',
      'Agenda', 50, COALESCE(currency, currency_code, 'BOB'), 60, 1,
      TRUE, TRUE, TRUE,
      '{"seed_key":"calendar-functional-v1"}'::jsonb
      FROM companies
     WHERE id = v_company_id
    RETURNING id INTO v_service_id;
  ELSE
    UPDATE catalog_items
       SET is_active = TRUE,
           is_bookable = TRUE,
           duration_minutes = COALESCE(duration_minutes, 60),
           updated_at = NOW()
     WHERE id = v_service_id;
  END IF;

  INSERT INTO staff_catalog_services (
    company_id, staff_id, catalog_item_id,
    custom_duration_minutes, is_active
  ) VALUES (
    v_company_id, v_staff_id, v_service_id, 60, TRUE
  )
  ON CONFLICT (staff_id, catalog_item_id) DO UPDATE
    SET custom_duration_minutes = EXCLUDED.custom_duration_minutes,
        is_active = TRUE,
        updated_at = NOW();

  IF NOT EXISTS (
    SELECT 1
      FROM staff_working_hours
     WHERE company_id = v_company_id
       AND staff_id = v_staff_id
       AND is_active = TRUE
  ) THEN
    INSERT INTO staff_working_hours (
      company_id, staff_id, day_of_week, start_time, end_time
    )
    SELECT v_company_id, v_staff_id, day_number, '09:00'::time, '18:00'::time
      FROM generate_series(1, 6) AS day_number;
  END IF;

  INSERT INTO google_calendar_registry (
    company_id, calendar_id, calendar_name, calendar_type,
    is_primary, is_active, metadata
  ) VALUES (
    v_company_id, 'primary', 'Calendario principal', 'primary',
    TRUE, TRUE, '{"seed_key":"calendar-functional-v1"}'::jsonb
  )
  ON CONFLICT (company_id, calendar_id) DO UPDATE
    SET calendar_name = EXCLUDED.calendar_name,
        calendar_type = 'primary',
        is_primary = TRUE,
        is_active = TRUE,
        updated_at = NOW();

  UPDATE company_staff
     SET google_calendar_id = COALESCE(google_calendar_id, 'primary'),
         google_calendar_name = COALESCE(
           google_calendar_name,
           'Calendario principal'
         ),
         calendar_sync_enabled = TRUE,
         updated_at = NOW()
   WHERE id = v_staff_id;

  UPDATE companies
     SET timezone = COALESCE(NULLIF(timezone, ''), 'America/La_Paz'),
         config = jsonb_set(
           COALESCE(config, '{}'::jsonb),
           '{appointment_policy}',
           COALESCE(config->'appointment_policy', '{}'::jsonb) ||
             '{
               "slot_duration_minutes": 30,
               "buffer_between_appointments_minutes": 0,
               "min_advance_booking_minutes": 60,
               "max_advance_booking_days": 30,
               "cancellation_notice_minutes": 120,
               "reminders_minutes": [1440, 120]
             }'::jsonb,
           TRUE
         ),
         updated_at = NOW()
   WHERE id = v_company_id;
END $$;

COMMIT;

-- Resultado útil para Swagger y pruebas manuales.
SELECT
  c.id AS company_id,
  c.name AS company_name,
  cs.id AS staff_id,
  TRIM(cs.first_name || ' ' || COALESCE(cs.last_name, '')) AS staff_name,
  ci.id AS service_id,
  ci.name AS service_name,
  gcr.calendar_id
FROM companies c
JOIN company_integrations integration
  ON integration.company_id = c.id
 AND integration.provider = 'GOOGLE_CALENDAR'
 AND integration.is_active = TRUE
JOIN company_staff cs
  ON cs.company_id = c.id
 AND cs.is_active = TRUE
JOIN staff_catalog_services scs
  ON scs.staff_id = cs.id
 AND scs.is_active = TRUE
JOIN catalog_items ci
  ON ci.id = scs.catalog_item_id
 AND ci.metadata->>'seed_key' = 'calendar-functional-v1'
JOIN google_calendar_registry gcr
  ON gcr.company_id = c.id
 AND gcr.is_primary = TRUE
 AND gcr.is_active = TRUE
ORDER BY integration.updated_at DESC NULLS LAST
LIMIT 1;
