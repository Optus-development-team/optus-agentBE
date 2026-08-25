-- Fixture integral e idempotente para probar la vertical salon/barberia.
--
-- IMPORTANTE:
--   1. Ejecutar primero las tres migraciones de Calendar.
--   2. Este script mueve temporalmente el WhatsApp Phone Number ID indicado.
--   3. No crea ni copia tokens OAuth, calendarios ni webhooks de Google.
--   4. Puede ejecutarse otra vez para restaurar los datos base del fixture.

BEGIN;

DO $$
DECLARE
  v_company_id CONSTANT UUID := 'd16b0000-0000-4000-8000-000000000001';
  v_owner_user_id CONSTANT UUID := 'd16b0000-0000-4000-8000-000000000101';
  v_barber_user_id CONSTANT UUID := 'd16b0000-0000-4000-8000-000000000102';
  v_client_user_id CONSTANT UUID := 'd16b0000-0000-4000-8000-000000000103';
  v_owner_staff_id CONSTANT UUID := 'd16b0000-0000-4000-8000-000000000201';
  v_barber_staff_id CONSTANT UUID := 'd16b0000-0000-4000-8000-000000000202';
  v_customer_id CONSTANT UUID := 'd16b0000-0000-4000-8000-000000000301';
  v_phone_number_id CONSTANT TEXT := '1069607422894461';
  v_display_number CONSTANT TEXT := '59175220141';

  v_original_company_id UUID;
  v_original_company_name TEXT;
  v_original_display_number TEXT;
  v_original_admin_phones TEXT[];
  v_saved_owner JSONB;
BEGIN
  -- Fallar antes de cambiar datos si falta una migracion operativa.
  IF to_regclass('public.staff_catalog_services') IS NULL
     OR to_regclass('public.staff_working_hours') IS NULL
     OR to_regclass('public.staff_time_off') IS NULL
     OR to_regclass('public.google_calendar_registry') IS NULL
     OR to_regclass('public.google_calendar_webhook_channels') IS NULL THEN
    RAISE EXCEPTION
      'Faltan migraciones de Calendar. Ejecutar calendar_sync_migration.sql, calendar_sync_hardening.sql y calendar_operational_completion.sql';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'company_staff'
       AND column_name = 'google_calendar_id'
  ) THEN
    RAISE EXCEPTION
      'Faltan las columnas multi-calendario de company_staff';
  END IF;

  -- El login por correo resuelve una sola empresa. Evitar una identidad ambigua.
  IF EXISTS (
    SELECT 1 FROM company_users
     WHERE company_id <> v_company_id
       AND lower(email) IN (
         'erickfalcocastro@gmail.com',
         'fernandosilvanovalero@gmail.com',
         'nyxmullerweber@gmail.com'
       )
  ) THEN
    RAISE EXCEPTION
      'Uno de los correos del fixture ya pertenece a otra empresa en company_users. Resolver ese acceso antes de ejecutar el seed';
  END IF;

  INSERT INTO companies (
    id, name, company_type, email, phone, address, city, country,
    timezone, currency_code, currency, settings, academy_json, is_active,
    branding, payment_settings, business_hours, vertical, config,
    whatsapp_admin_phone_ids, whatsapp_display_phone_number,
    whatsapp_phone_id
  ) VALUES (
    v_company_id,
    'Distrito 16 Barber Studio',
    'service',
    'erickfalcocastro@gmail.com',
    v_display_number,
    'Av. Montenegro, zona San Miguel',
    'La Paz',
    'Bolivia',
    'America/La_Paz',
    'BOB',
    'BOB',
    '{"fixture_name":"barbershop-test-v1"}'::jsonb,
    '{}'::jsonb,
    TRUE,
    '{
      "business_name": "Distrito 16 Barber Studio",
      "short_description": "Barberia urbana especializada en cortes, barba y asesoria de imagen para todas las edades."
    }'::jsonb,
    '{"accepted_payment_methods":["QR","Efectivo","Transferencia bancaria"]}'::jsonb,
    '{
      "monday": [{"start":"10:00","end":"19:00"}],
      "tuesday": [{"start":"09:00","end":"13:00"},{"start":"14:00","end":"19:00"}],
      "wednesday": [{"start":"09:00","end":"13:00"},{"start":"14:00","end":"19:00"}],
      "thursday": [{"start":"09:00","end":"13:00"},{"start":"14:00","end":"19:00"}],
      "friday": [{"start":"09:00","end":"13:00"},{"start":"14:00","end":"19:00"}],
      "saturday": [{"start":"09:00","end":"15:00"}],
      "sunday": []
    }'::jsonb,
    'salon',
    '{
      "profile": {
        "agent_name": "Fígaro",
        "language": "es-BO",
        "tone": "Amigable, moderno y profesional; trata al cliente de tu y evita exageraciones.",
        "persona_description": "Asistente de Distrito 16 Barber Studio. Ayuda a elegir servicios, barberos y horarios sin inventar disponibilidad."
      },
      "business_info": {
        "industry": "Barberia y cuidado personal",
        "address": "Av. Montenegro, zona San Miguel, La Paz, Bolivia",
        "value_proposition": "Atencion puntual con reserva, barberos especializados y recomendaciones personalizadas segun el estilo del cliente."
      },
      "operational_rules": {
        "contact_phone": "+591 75220141",
        "opening_hours": {
          "monday": "10:00 - 19:00",
          "tuesday_friday": "09:00 - 13:00 y 14:00 - 19:00",
          "saturday": "09:00 - 15:00",
          "sunday": "Cerrado"
        }
      },
      "appointment_policy": {
        "service_name": "Servicios de barberia",
        "cancellation_rule": "La cita puede cancelarse o reprogramarse sin costo hasta 2 horas antes. Pasado ese plazo queda sujeta a disponibilidad.",
        "slot_duration_minutes": 30,
        "buffer_between_appointments_minutes": 10,
        "min_advance_booking_minutes": 60,
        "max_advance_booking_days": 30,
        "cancellation_notice_minutes": 120,
        "reminders_minutes": [1440, 120]
      }
    }'::jsonb,
    ARRAY['59179611475']::TEXT[],
    NULL,
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    company_type = EXCLUDED.company_type,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    country = EXCLUDED.country,
    timezone = EXCLUDED.timezone,
    currency_code = EXCLUDED.currency_code,
    currency = EXCLUDED.currency,
    settings = COALESCE(companies.settings, '{}'::jsonb) || EXCLUDED.settings,
    academy_json = EXCLUDED.academy_json,
    is_active = TRUE,
    branding = EXCLUDED.branding,
    payment_settings = EXCLUDED.payment_settings,
    business_hours = EXCLUDED.business_hours,
    vertical = EXCLUDED.vertical,
    config = EXCLUDED.config,
    whatsapp_admin_phone_ids = EXCLUDED.whatsapp_admin_phone_ids,
    updated_at = NOW();

  SELECT settings->'test_seed'->'original_whatsapp_owner'
    INTO v_saved_owner
    FROM companies
   WHERE id = v_company_id;

  -- En la primera ejecucion se captura al propietario real del Phone Number ID.
  IF v_saved_owner IS NULL THEN
    SELECT id, name, whatsapp_display_phone_number, whatsapp_admin_phone_ids
      INTO v_original_company_id, v_original_company_name,
           v_original_display_number, v_original_admin_phones
      FROM companies
     WHERE whatsapp_phone_id = v_phone_number_id
       AND id <> v_company_id
     FOR UPDATE;

    IF v_original_company_id IS NULL THEN
      RAISE EXCEPTION
        'El Phone Number ID % no esta asignado a otra empresa. No se puede generar un rollback confiable',
        v_phone_number_id;
    END IF;

    UPDATE companies
       SET settings = jsonb_set(
         COALESCE(settings, '{}'::jsonb),
         '{test_seed}',
         jsonb_build_object(
           'fixture', 'barbershop-test-v1',
           'captured_at', NOW(),
           'original_whatsapp_owner', jsonb_build_object(
             'company_id', v_original_company_id,
             'company_name', v_original_company_name,
             'whatsapp_phone_id', v_phone_number_id,
             'whatsapp_display_phone_number', v_original_display_number,
             'whatsapp_admin_phone_ids', to_jsonb(v_original_admin_phones)
           )
         ),
         TRUE
       ),
       updated_at = NOW()
     WHERE id = v_company_id;
  ELSE
    v_original_company_id := NULLIF(v_saved_owner->>'company_id', '')::UUID;

    IF EXISTS (
      SELECT 1
        FROM companies
       WHERE whatsapp_phone_id = v_phone_number_id
         AND id NOT IN (v_company_id, v_original_company_id)
    ) THEN
      RAISE EXCEPTION
        'El Phone Number ID ahora pertenece a una tercera empresa. Revisar el mapeo antes de volver a ejecutar el seed';
    END IF;
  END IF;

  -- La restriccion unica exige liberar primero el Phone Number ID.
  UPDATE companies
     SET whatsapp_phone_id = NULL,
         whatsapp_display_phone_number = NULL,
         updated_at = NOW()
   WHERE whatsapp_phone_id = v_phone_number_id
     AND id <> v_company_id;

  UPDATE companies
     SET whatsapp_phone_id = v_phone_number_id,
         whatsapp_display_phone_number = v_display_number,
         whatsapp_admin_phone_ids = ARRAY['59179611475']::TEXT[],
         updated_at = NOW()
   WHERE id = v_company_id;

  INSERT INTO company_users (
    id, company_id, phone, role, email, is_phone_verified, alias, permissions
  ) VALUES
    (v_owner_user_id, v_company_id, '59179611475', 'ADMIN',
     'erickfalcocastro@gmail.com', TRUE, 'Erick',
     '{"fixture":"barbershop-test-v1"}'::jsonb),
    (v_barber_user_id, v_company_id, '59160105221', 'CLIENT',
     'fernandosilvanovalero@gmail.com', TRUE, 'Fernando',
     '{"fixture":"barbershop-test-v1"}'::jsonb),
    (v_client_user_id, v_company_id, '59164252325', 'CLIENT',
     'nyxmullerweber@gmail.com', TRUE, 'Nyx',
     '{"fixture":"barbershop-test-v1"}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    email = EXCLUDED.email,
    is_phone_verified = EXCLUDED.is_phone_verified,
    alias = EXCLUDED.alias,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  INSERT INTO company_staff (
    id, company_id, first_name, last_name, email, phone, role,
    specialty, commission_config, is_active, user_id
  ) VALUES
    (v_owner_staff_id, v_company_id, 'Erick', 'Falco Castro',
     'erickfalcocastro@gmail.com', '59179611475', 'owner',
     'Barberia clasica, cortes ejecutivos y asesoria de imagen',
     '{"fixture":"barbershop-test-v1"}'::jsonb, TRUE, v_owner_user_id),
    (v_barber_staff_id, v_company_id, 'Fernando', 'Silvano Valero',
     'fernandosilvanovalero@gmail.com', '59160105221', 'barber',
     'Degradados, cortes modernos y diseno de barba',
     '{"fixture":"barbershop-test-v1"}'::jsonb, TRUE, v_barber_user_id)
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    specialty = EXCLUDED.specialty,
    commission_config = EXCLUDED.commission_config,
    is_active = TRUE,
    user_id = EXCLUDED.user_id,
    updated_at = NOW();

  -- No se asignan IDs falsos de Google. Al registrarlos mediante Swagger se
  -- completaran google_calendar_id y google_calendar_registry.
  UPDATE company_staff
     SET google_calendar_name = CASE id
           WHEN v_owner_staff_id THEN 'Distrito 16 - Erick'
           ELSE 'Distrito 16 - Fernando'
         END,
         calendar_color = CASE id
           WHEN v_owner_staff_id THEN '#1A73E8'
           ELSE '#0B8043'
         END,
         calendar_sync_enabled = TRUE,
         updated_at = NOW()
   WHERE id IN (v_owner_staff_id, v_barber_staff_id);

  INSERT INTO customers (
    id, company_id, customer_type, first_name, last_name, email, phone,
    notes, extra_data, is_active, user_id
  ) VALUES (
    v_customer_id, v_company_id, 'person', 'Nyx', 'Muller Weber',
    'nyxmullerweber@gmail.com', '59164252325',
    'Cliente real para pruebas integrales de agenda por WhatsApp.',
    '{"fixture":"barbershop-test-v1"}'::jsonb, TRUE, v_client_user_id
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    customer_type = EXCLUDED.customer_type,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    notes = EXCLUDED.notes,
    extra_data = EXCLUDED.extra_data,
    is_active = TRUE,
    user_id = EXCLUDED.user_id,
    updated_at = NOW();

  INSERT INTO catalog_items (
    id, company_id, item_type, name, description, category,
    sale_price, cost_price, currency, duration_minutes, capacity,
    is_active, is_bookable, is_sellable, metadata
  ) VALUES
    ('d16b0000-0000-4000-8000-000000000401', v_company_id, 'service',
     'Corte clasico', 'Corte tradicional con acabado y peinado.', 'Barberia',
     50, 0, 'BOB', 30, 1, TRUE, TRUE, TRUE,
     '{"fixture":"barbershop-test-v1","service_code":"classic-cut"}'),
    ('d16b0000-0000-4000-8000-000000000402', v_company_id, 'service',
     'Corte fade/degradado', 'Degradado personalizado segun estilo y tipo de cabello.', 'Barberia',
     60, 0, 'BOB', 45, 1, TRUE, TRUE, TRUE,
     '{"fixture":"barbershop-test-v1","service_code":"fade-cut"}'),
    ('d16b0000-0000-4000-8000-000000000403', v_company_id, 'service',
     'Perfilado de barba', 'Perfilado, contornos y acabado de barba.', 'Barberia',
     35, 0, 'BOB', 30, 1, TRUE, TRUE, TRUE,
     '{"fixture":"barbershop-test-v1","service_code":"beard-shape"}'),
    ('d16b0000-0000-4000-8000-000000000404', v_company_id, 'service',
     'Corte y barba', 'Servicio completo de corte y perfilado de barba.', 'Barberia',
     80, 0, 'BOB', 60, 1, TRUE, TRUE, TRUE,
     '{"fixture":"barbershop-test-v1","service_code":"cut-and-beard"}'),
    ('d16b0000-0000-4000-8000-000000000405', v_company_id, 'service',
     'Corte infantil', 'Corte para ninos con atencion paciente y acabado suave.', 'Barberia',
     45, 0, 'BOB', 30, 1, TRUE, TRUE, TRUE,
     '{"fixture":"barbershop-test-v1","service_code":"kids-cut"}')
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    item_type = EXCLUDED.item_type,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    sale_price = EXCLUDED.sale_price,
    cost_price = EXCLUDED.cost_price,
    currency = EXCLUDED.currency,
    duration_minutes = EXCLUDED.duration_minutes,
    capacity = EXCLUDED.capacity,
    is_active = TRUE,
    is_bookable = TRUE,
    is_sellable = TRUE,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

  INSERT INTO staff_catalog_services (
    company_id, staff_id, catalog_item_id, custom_duration_minutes, is_active
  )
  SELECT v_company_id, staff_id, service_id, NULL, TRUE
    FROM unnest(ARRAY[v_owner_staff_id, v_barber_staff_id]) AS staff(staff_id)
   CROSS JOIN unnest(ARRAY[
     'd16b0000-0000-4000-8000-000000000401'::UUID,
     'd16b0000-0000-4000-8000-000000000402'::UUID,
     'd16b0000-0000-4000-8000-000000000403'::UUID,
     'd16b0000-0000-4000-8000-000000000404'::UUID,
     'd16b0000-0000-4000-8000-000000000405'::UUID
   ]) AS service(service_id)
  ON CONFLICT (staff_id, catalog_item_id) DO UPDATE SET
    custom_duration_minutes = NULL,
    is_active = TRUE,
    updated_at = NOW();

  -- El seed restablece solamente los horarios de sus dos staff deterministas.
  DELETE FROM staff_working_hours
   WHERE company_id = v_company_id
     AND staff_id IN (v_owner_staff_id, v_barber_staff_id);

  INSERT INTO staff_working_hours (
    company_id, staff_id, day_of_week, start_time, end_time, is_active
  )
  SELECT v_company_id, v_owner_staff_id, day_number, block.start_time, block.end_time, TRUE
    FROM generate_series(2, 5) AS day_number
   CROSS JOIN (VALUES ('09:00'::TIME, '13:00'::TIME),
                      ('14:00'::TIME, '19:00'::TIME)) AS block(start_time, end_time)
  UNION ALL
  SELECT v_company_id, v_owner_staff_id, 6, '09:00'::TIME, '14:00'::TIME, TRUE
  UNION ALL
  SELECT v_company_id, v_barber_staff_id, day_number, block.start_time, block.end_time, TRUE
    FROM generate_series(1, 5) AS day_number
   CROSS JOIN (VALUES ('10:00'::TIME, '14:00'::TIME),
                      ('15:00'::TIME, '19:00'::TIME)) AS block(start_time, end_time)
  UNION ALL
  SELECT v_company_id, v_barber_staff_id, 6, '09:00'::TIME, '15:00'::TIME, TRUE;

  INSERT INTO staff_time_off (
    id, company_id, staff_id, starts_at, ends_at, reason, status,
    created_by_user_id
  ) VALUES (
    'd16b0000-0000-4000-8000-000000000501',
    v_company_id,
    v_barber_staff_id,
    '2026-08-29 11:00:00-04'::TIMESTAMPTZ,
    '2026-08-29 13:00:00-04'::TIMESTAMPTZ,
    'Tramite personal - bloqueo para validar ausencias',
    'approved',
    v_owner_user_id
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    staff_id = EXCLUDED.staff_id,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    reason = EXCLUDED.reason,
    status = EXCLUDED.status,
    created_by_user_id = EXCLUDED.created_by_user_id,
    updated_at = NOW();

  RAISE NOTICE 'Seed creado para company_id=%; propietario original de WhatsApp=%',
    v_company_id, v_original_company_id;
END $$;

COMMIT;

-- Resumen para copiar IDs a Swagger o a la hoja de pruebas.
SELECT
  c.id AS company_id,
  c.name,
  c.vertical,
  c.config->'profile'->>'agent_name' AS bot_name,
  c.whatsapp_display_phone_number,
  c.whatsapp_phone_id,
  c.whatsapp_admin_phone_ids,
  c.settings->'test_seed'->'original_whatsapp_owner' AS rollback_snapshot
FROM companies c
WHERE c.id = 'd16b0000-0000-4000-8000-000000000001';

SELECT
  cs.id AS staff_id,
  trim(cs.first_name || ' ' || coalesce(cs.last_name, '')) AS staff_name,
  cs.role,
  cs.phone,
  cs.google_calendar_name,
  cs.google_calendar_id,
  count(scs.id) FILTER (WHERE scs.is_active) AS enabled_services
FROM company_staff cs
LEFT JOIN staff_catalog_services scs ON scs.staff_id = cs.id
WHERE cs.company_id = 'd16b0000-0000-4000-8000-000000000001'
GROUP BY cs.id
ORDER BY cs.role, staff_name;

SELECT id AS service_id, name, duration_minutes, sale_price, currency
FROM catalog_items
WHERE company_id = 'd16b0000-0000-4000-8000-000000000001'
  AND metadata->>'fixture' = 'barbershop-test-v1'
ORDER BY sale_price, name;
