-- Rollback seguro del fixture barbershop-test-v1.
--
-- No borra citas, usuarios ni datos de prueba. Devuelve el Phone Number ID a
-- su empresa original y desactiva la barberia. Luego el seed puede reactivarla.
-- Antes de ejecutarlo, cancelar citas activas y llamar
-- DELETE /v1/calendar/admin/integration para desconectar Google y sus webhooks.

BEGIN;

DO $$
DECLARE
  v_company_id CONSTANT UUID := 'd16b0000-0000-4000-8000-000000000001';
  v_phone_number_id CONSTANT TEXT := '1069607422894461';
  v_snapshot JSONB;
  v_original_company_id UUID;
  v_current_owner_id UUID;
  v_original_admin_phones TEXT[];
BEGIN
  SELECT settings->'test_seed'->'original_whatsapp_owner'
    INTO v_snapshot
    FROM companies
   WHERE id = v_company_id
   FOR UPDATE;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION
      'No existe el snapshot original del Phone Number ID; rollback cancelado';
  END IF;

  v_original_company_id := NULLIF(v_snapshot->>'company_id', '')::UUID;

  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = v_original_company_id) THEN
    RAISE EXCEPTION
      'La empresa original % ya no existe; rollback cancelado',
      v_original_company_id;
  END IF;

  SELECT id INTO v_current_owner_id
    FROM companies
   WHERE whatsapp_phone_id = v_phone_number_id
   FOR UPDATE;

  IF v_current_owner_id IS NOT NULL
     AND v_current_owner_id NOT IN (v_company_id, v_original_company_id) THEN
    RAISE EXCEPTION
      'El Phone Number ID ahora pertenece a una tercera empresa (%); rollback cancelado',
      v_current_owner_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM appointments
     WHERE company_id = v_company_id
       AND status IN ('pending', 'confirmed')
  ) THEN
    RAISE EXCEPTION
      'La barberia conserva citas pending/confirmed. Cancelarlas desde el bot o Swagger antes del rollback';
  END IF;

  IF EXISTS (
    SELECT 1 FROM company_integrations
     WHERE company_id = v_company_id
       AND provider = 'GOOGLE_CALENDAR'
       AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION
      'Google Calendar sigue conectado. Desconectarlo mediante la API antes del rollback para no dejar credenciales activas';
  END IF;

  IF to_regclass('public.google_calendar_webhook_channels') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM google_calendar_webhook_channels
        WHERE company_id = v_company_id
          AND is_active = TRUE
     ) THEN
    RAISE EXCEPTION
      'Aun existen webhooks activos de Google. Detenerlos mediante la API antes del rollback';
  END IF;

  SELECT COALESCE(array_agg(value), ARRAY[]::TEXT[])
    INTO v_original_admin_phones
    FROM jsonb_array_elements_text(
      COALESCE(v_snapshot->'whatsapp_admin_phone_ids', '[]'::jsonb)
    ) AS values_table(value);

  UPDATE companies
     SET whatsapp_phone_id = NULL,
         whatsapp_display_phone_number = NULL,
         is_active = FALSE,
         updated_at = NOW()
   WHERE id = v_company_id;

  UPDATE companies
     SET whatsapp_phone_id = NULLIF(v_snapshot->>'whatsapp_phone_id', ''),
         whatsapp_display_phone_number = NULLIF(
           v_snapshot->>'whatsapp_display_phone_number', ''
         ),
         whatsapp_admin_phone_ids = v_original_admin_phones,
         updated_at = NOW()
   WHERE id = v_original_company_id;

  RAISE NOTICE 'Phone Number ID restaurado a company_id=%; barberia desactivada',
    v_original_company_id;
END $$;

COMMIT;

SELECT
  id,
  name,
  is_active,
  whatsapp_display_phone_number,
  whatsapp_phone_id,
  whatsapp_admin_phone_ids
FROM companies
WHERE id IN (
  'd16b0000-0000-4000-8000-000000000001'::UUID,
  COALESCE(
    (
      SELECT NULLIF(
        settings->'test_seed'->'original_whatsapp_owner'->>'company_id',
        ''
      )::UUID
      FROM companies
      WHERE id = 'd16b0000-0000-4000-8000-000000000001'
    ),
    'd16b0000-0000-4000-8000-000000000001'::UUID
  )
)
ORDER BY name;
