BEGIN;

ALTER TABLE public.company_config_migration_snapshots
  ADD COLUMN IF NOT EXISTS original_vertical TEXT;

INSERT INTO public.company_config_migration_snapshots (
  company_id,
  schema_version,
  original_config,
  original_vertical
)
SELECT id, 2, COALESCE(config, '{}'::jsonb), vertical::text
  FROM public.companies
ON CONFLICT (company_id, schema_version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.jsonb_is_string_array(p_value JSONB)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT jsonb_typeof(p_value) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_value) AS item
       WHERE jsonb_typeof(item) <> 'string'
          OR BTRIM(item #>> '{}') = ''
    );
$$;

CREATE OR REPLACE FUNCTION public.jsonb_is_positive_integer_array(p_value JSONB)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT jsonb_typeof(p_value) = 'array'
    AND jsonb_array_length(p_value) > 0
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_value) AS item
       WHERE jsonb_typeof(item) <> 'number'
          OR (item #>> '{}')::NUMERIC <> TRUNC((item #>> '{}')::NUMERIC)
          OR (item #>> '{}')::NUMERIC <= 0
    );
$$;

CREATE OR REPLACE FUNCTION public.normalize_company_agent_config_v2(
  p_company_name TEXT,
  p_vertical TEXT,
  p_config JSONB
) RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_config JSONB := CASE WHEN jsonb_typeof(p_config) = 'object'
    THEN p_config ELSE '{}'::jsonb END;
  v_profile JSONB := CASE WHEN jsonb_typeof(p_config->'profile') = 'object'
    THEN p_config->'profile' ELSE '{}'::jsonb END;
  v_behavior JSONB := CASE WHEN jsonb_typeof(p_config->'behavior') = 'object'
    THEN p_config->'behavior' ELSE '{}'::jsonb END;
  v_capabilities JSONB := CASE WHEN jsonb_typeof(p_config->'capabilities') = 'object'
    THEN p_config->'capabilities' ELSE '{}'::jsonb END;
  v_business JSONB := CASE WHEN jsonb_typeof(p_config->'business_info') = 'object'
    THEN p_config->'business_info' ELSE '{}'::jsonb END;
  v_operational JSONB := CASE WHEN jsonb_typeof(p_config->'operational_rules') = 'object'
    THEN p_config->'operational_rules' ELSE '{}'::jsonb END;
  v_security JSONB := CASE WHEN jsonb_typeof(p_config->'security') = 'object'
    THEN p_config->'security' ELSE '{}'::jsonb END;
  v_sales JSONB := CASE WHEN jsonb_typeof(p_config->'sales_policy') = 'object'
    THEN p_config->'sales_policy' ELSE '{}'::jsonb END;
  v_appointments JSONB := CASE WHEN jsonb_typeof(p_config->'appointment_policy') = 'object'
    THEN p_config->'appointment_policy' ELSE '{}'::jsonb END;
  v_configuration JSONB := CASE WHEN jsonb_typeof(p_config->'configuration') = 'object'
    THEN p_config->'configuration' ELSE '{}'::jsonb END;
  v_extensions JSONB := CASE WHEN jsonb_typeof(p_config->'extensions') = 'object'
    THEN p_config->'extensions' ELSE '{}'::jsonb END;
  v_name TEXT := COALESCE(NULLIF(BTRIM(p_company_name), ''), 'la empresa');
  v_vertical TEXT := COALESCE(NULLIF(BTRIM(p_vertical), ''), 'general');
  v_default_name TEXT;
  v_default_persona TEXT;
  v_agent_name TEXT;
  v_persona TEXT;
  v_profile_completed BOOLEAN;
  v_behavior_completed BOOLEAN;
  v_business_completed BOOLEAN;
  v_status TEXT;
  v_number NUMERIC;
  v_slot INTEGER := 30;
  v_buffer INTEGER := 0;
  v_max_days INTEGER := 30;
  v_min_minutes INTEGER := 60;
  v_cancel_minutes INTEGER := 120;
BEGIN
  v_default_name := 'Asistente de ' || v_name;
  v_default_persona := 'Asistente de ' || v_name ||
    '. Responde con información verificada y ayuda al cliente sin inventar datos.';
  v_agent_name := COALESCE(NULLIF(BTRIM(v_profile->>'agent_name'), ''), v_default_name);
  v_persona := COALESCE(NULLIF(BTRIM(v_profile->>'persona_description'), ''), v_default_persona);

  IF jsonb_typeof(v_appointments->'slot_duration_minutes') = 'number' THEN
    v_number := (v_appointments->>'slot_duration_minutes')::NUMERIC;
    IF v_number = TRUNC(v_number) AND v_number BETWEEN 5 AND 480 THEN v_slot := v_number::INTEGER; END IF;
  END IF;
  IF jsonb_typeof(v_appointments->'buffer_between_appointments_minutes') = 'number' THEN
    v_number := (v_appointments->>'buffer_between_appointments_minutes')::NUMERIC;
    IF v_number = TRUNC(v_number) AND v_number BETWEEN 0 AND 240 THEN v_buffer := v_number::INTEGER; END IF;
  END IF;
  IF jsonb_typeof(v_appointments->'max_advance_booking_days') = 'number' THEN
    v_number := (v_appointments->>'max_advance_booking_days')::NUMERIC;
    IF v_number = TRUNC(v_number) AND v_number BETWEEN 1 AND 730 THEN v_max_days := v_number::INTEGER; END IF;
  END IF;
  IF jsonb_typeof(v_appointments->'min_advance_booking_minutes') = 'number' THEN
    v_number := (v_appointments->>'min_advance_booking_minutes')::NUMERIC;
    IF v_number = TRUNC(v_number) AND v_number BETWEEN 0 AND 10080 THEN v_min_minutes := v_number::INTEGER; END IF;
  END IF;
  IF jsonb_typeof(v_appointments->'cancellation_notice_minutes') = 'number' THEN
    v_number := (v_appointments->>'cancellation_notice_minutes')::NUMERIC;
    IF v_number = TRUNC(v_number) AND v_number BETWEEN 0 AND 43200 THEN v_cancel_minutes := v_number::INTEGER; END IF;
  END IF;

  v_profile_completed := CASE
    WHEN jsonb_typeof(v_configuration->'profile_completed') = 'boolean'
      THEN (v_configuration->>'profile_completed')::BOOLEAN
    ELSE v_agent_name <> v_default_name AND v_persona <> v_default_persona
  END;
  v_behavior_completed := CASE
    WHEN jsonb_typeof(v_configuration->'behavior_completed') = 'boolean'
      THEN (v_configuration->>'behavior_completed')::BOOLEAN
    ELSE FALSE
  END;
  v_business_completed := CASE
    WHEN jsonb_typeof(v_configuration->'business_info_completed') = 'boolean'
      THEN (v_configuration->>'business_info_completed')::BOOLEAN
    ELSE NULLIF(BTRIM(v_business->>'value_proposition'), '') IS NOT NULL
      AND NULLIF(BTRIM(v_business->>'address'), '') IS NOT NULL
  END;
  v_status := CASE
    WHEN v_configuration->>'status' = 'complete'
      AND v_profile_completed
      AND v_behavior_completed
    THEN 'complete'
    ELSE 'draft'
  END;

  v_extensions := v_extensions || (
    v_config - ARRAY[
      'schema_version','configuration','profile','behavior','capabilities',
      'business_info','operational_rules','security','sales_policy',
      'appointment_policy','extensions','tone','timezone','inventory_context'
    ]::TEXT[]
  );

  RETURN jsonb_build_object(
    'schema_version', 2,
    'configuration', jsonb_build_object(
      'status', v_status,
      'profile_completed', v_profile_completed,
      'behavior_completed', v_behavior_completed,
      'business_info_completed', v_business_completed,
      'configured_at', CASE WHEN v_status = 'complete' AND jsonb_typeof(v_configuration->'configured_at') = 'string'
        THEN v_configuration->'configured_at' ELSE 'null'::jsonb END,
      'configured_by', CASE WHEN v_status = 'complete' AND jsonb_typeof(v_configuration->'configured_by') = 'string'
        THEN v_configuration->'configured_by' ELSE 'null'::jsonb END
    ),
    'profile', jsonb_build_object(
      'agent_name', v_agent_name,
      'language', CASE WHEN COALESCE(v_profile->>'language', '') ~ '^[a-z]{2,3}(-[A-Z]{2})?$'
        THEN v_profile->>'language' ELSE 'es-BO' END,
      'tone', COALESCE(NULLIF(BTRIM(v_profile->>'tone'), ''), NULLIF(BTRIM(v_config->>'tone'), ''), 'Profesional, amable y claro'),
      'persona_description', v_persona
    ),
    'behavior', jsonb_build_object(
      'response_style', CASE WHEN v_behavior->>'response_style' IN ('concise','balanced','detailed')
        THEN v_behavior->>'response_style' ELSE 'concise' END,
      'use_emojis', CASE WHEN jsonb_typeof(v_behavior->'use_emojis') = 'boolean'
        THEN (v_behavior->>'use_emojis')::BOOLEAN ELSE FALSE END,
      'emoji_intensity', CASE WHEN jsonb_typeof(v_behavior->'emoji_intensity') = 'number'
          AND (v_behavior->>'emoji_intensity')::NUMERIC = TRUNC((v_behavior->>'emoji_intensity')::NUMERIC)
          AND (v_behavior->>'emoji_intensity')::NUMERIC BETWEEN 0 AND 3
        THEN (v_behavior->>'emoji_intensity')::INTEGER ELSE 0 END,
      'address_customer_as', CASE WHEN v_behavior->>'address_customer_as' IN ('tu','usted')
        THEN v_behavior->>'address_customer_as' ELSE 'tu' END,
      'ask_clarifying_questions', CASE WHEN jsonb_typeof(v_behavior->'ask_clarifying_questions') = 'boolean'
        THEN (v_behavior->>'ask_clarifying_questions')::BOOLEAN ELSE TRUE END,
      'confirm_before_actions', CASE WHEN jsonb_typeof(v_behavior->'confirm_before_actions') = 'boolean'
        THEN (v_behavior->>'confirm_before_actions')::BOOLEAN ELSE TRUE END,
      'never_invent_information', CASE WHEN jsonb_typeof(v_behavior->'never_invent_information') = 'boolean'
        THEN (v_behavior->>'never_invent_information')::BOOLEAN ELSE TRUE END,
      'fallback_message', COALESCE(NULLIF(BTRIM(v_behavior->>'fallback_message'), ''),
        'No tengo información suficiente para responder con seguridad. ¿Puedes darme más detalles?')
    ),
    'capabilities', jsonb_build_object(
      'knowledge', CASE WHEN jsonb_typeof(v_capabilities->'knowledge') = 'boolean' THEN (v_capabilities->>'knowledge')::BOOLEAN ELSE TRUE END,
      'appointments', CASE WHEN jsonb_typeof(v_capabilities->'appointments') = 'boolean' THEN (v_capabilities->>'appointments')::BOOLEAN ELSE TRUE END,
      'sales', CASE WHEN jsonb_typeof(v_capabilities->'sales') = 'boolean' THEN (v_capabilities->>'sales')::BOOLEAN ELSE TRUE END,
      'payments', CASE WHEN jsonb_typeof(v_capabilities->'payments') = 'boolean' THEN (v_capabilities->>'payments')::BOOLEAN ELSE FALSE END,
      'reporting', CASE WHEN jsonb_typeof(v_capabilities->'reporting') = 'boolean' THEN (v_capabilities->>'reporting')::BOOLEAN ELSE FALSE END
    ),
    'business_info', jsonb_build_object(
      'industry', v_vertical,
      'value_proposition', COALESCE(v_business->>'value_proposition', ''),
      'address', COALESCE(v_business->>'address', ''),
      'google_maps_link', COALESCE(v_business->>'google_maps_link', ''),
      'inventory_context', COALESCE(NULLIF(v_business->>'inventory_context', ''), v_config->>'inventory_context', '')
    ),
    'operational_rules', jsonb_build_object(
      'contact_phone', COALESCE(v_operational->>'contact_phone', ''),
      'opening_hours', CASE WHEN jsonb_typeof(v_operational->'opening_hours') = 'object' THEN v_operational->'opening_hours' ELSE '{}'::jsonb END,
      'human_handoff_enabled', CASE WHEN jsonb_typeof(v_operational->'human_handoff_enabled') = 'boolean' THEN (v_operational->>'human_handoff_enabled')::BOOLEAN ELSE TRUE END,
      'human_handoff_message', COALESCE(NULLIF(BTRIM(v_operational->>'human_handoff_message'), ''), 'Voy a derivar tu consulta con una persona del equipo.')
    ),
    'security', jsonb_build_object(
      'require_2fa_for_admin_actions', CASE WHEN jsonb_typeof(v_security->'require_2fa_for_admin_actions') = 'boolean' THEN (v_security->>'require_2fa_for_admin_actions')::BOOLEAN ELSE TRUE END,
      'protect_sensitive_data', CASE WHEN jsonb_typeof(v_security->'protect_sensitive_data') = 'boolean' THEN (v_security->>'protect_sensitive_data')::BOOLEAN ELSE TRUE END
    ),
    'sales_policy', jsonb_build_object(
      'accepted_payment_methods', CASE WHEN public.jsonb_is_string_array(v_sales->'accepted_payment_methods') THEN v_sales->'accepted_payment_methods' ELSE '[]'::jsonb END,
      'delivery_policy', COALESCE(NULLIF(v_sales->>'delivery_policy', ''), v_sales->>'delivery_cost', ''),
      'refund_policy', COALESCE(v_sales->>'refund_policy', ''),
      'stock_behavior', COALESCE(v_sales->>'stock_behavior', '')
    ),
    'appointment_policy', jsonb_build_object(
      'enabled', CASE WHEN jsonb_typeof(v_appointments->'enabled') = 'boolean' THEN (v_appointments->>'enabled')::BOOLEAN ELSE TRUE END,
      'service_name', COALESCE(NULLIF(BTRIM(v_appointments->>'service_name'), ''), 'Cita'),
      'cancellation_rule', COALESCE(v_appointments->>'cancellation_rule', ''),
      'slot_duration_minutes', v_slot,
      'buffer_between_appointments_minutes', v_buffer,
      'max_advance_booking_days', v_max_days,
      'min_advance_booking_minutes', v_min_minutes,
      'cancellation_notice_minutes', v_cancel_minutes,
      'reminders_minutes', CASE WHEN public.jsonb_is_positive_integer_array(v_appointments->'reminders_minutes')
        THEN v_appointments->'reminders_minutes' ELSE jsonb_build_array(1440,120) END
    ),
    'extensions', v_extensions
  );
END;
$$;

ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS chk_companies_agent_config_v1;
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS chk_companies_agent_config_v2;

UPDATE public.companies SET vertical = 'academy' WHERE name = 'Academia Educandome';
UPDATE public.companies SET vertical = 'salon' WHERE name = 'Ilana beauty service';

CREATE OR REPLACE FUNCTION public.trg_normalize_company_agent_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.config := public.normalize_company_agent_config_v2(NEW.name, NEW.vertical, NEW.config);
  RETURN NEW;
END;
$$;

UPDATE public.companies
   SET config = public.normalize_company_agent_config_v2(name, vertical, config),
       updated_at = NOW();

ALTER TABLE public.companies
  ADD CONSTRAINT chk_companies_agent_config_v2 CHECK (
    jsonb_typeof(config) = 'object'
    AND config->>'schema_version' = '2'
    AND config - ARRAY[
      'schema_version','configuration','profile','behavior','capabilities',
      'business_info','operational_rules','security','sales_policy',
      'appointment_policy','extensions'
    ]::TEXT[] = '{}'::jsonb
    AND config ?& ARRAY[
      'schema_version','configuration','profile','behavior','capabilities',
      'business_info','operational_rules','security','sales_policy',
      'appointment_policy','extensions'
    ]
    AND jsonb_typeof(config->'configuration') = 'object'
    AND config->'configuration'->>'status' IN ('draft','complete')
    AND jsonb_typeof(config->'configuration'->'profile_completed') = 'boolean'
    AND jsonb_typeof(config->'configuration'->'behavior_completed') = 'boolean'
    AND jsonb_typeof(config->'configuration'->'business_info_completed') = 'boolean'
    AND (config->'configuration'->>'status' = 'draft' OR (
      (config->'configuration'->>'profile_completed')::BOOLEAN
      AND (config->'configuration'->>'behavior_completed')::BOOLEAN
      AND NULLIF(BTRIM(config->'configuration'->>'configured_at'), '') IS NOT NULL
      AND NULLIF(BTRIM(config->'configuration'->>'configured_by'), '') IS NOT NULL
    ))
    AND jsonb_typeof(config->'profile') = 'object'
    AND NULLIF(BTRIM(config->'profile'->>'agent_name'), '') IS NOT NULL
    AND config->'profile'->>'language' ~ '^[a-z]{2,3}(-[A-Z]{2})?$'
    AND NULLIF(BTRIM(config->'profile'->>'tone'), '') IS NOT NULL
    AND NULLIF(BTRIM(config->'profile'->>'persona_description'), '') IS NOT NULL
    AND jsonb_typeof(config->'behavior') = 'object'
    AND config->'behavior'->>'response_style' IN ('concise','balanced','detailed')
    AND jsonb_typeof(config->'behavior'->'use_emojis') = 'boolean'
    AND jsonb_typeof(config->'behavior'->'emoji_intensity') = 'number'
    AND (config->'behavior'->>'emoji_intensity')::INTEGER BETWEEN 0 AND 3
    AND config->'behavior'->>'address_customer_as' IN ('tu','usted')
    AND jsonb_typeof(config->'behavior'->'ask_clarifying_questions') = 'boolean'
    AND jsonb_typeof(config->'behavior'->'confirm_before_actions') = 'boolean'
    AND jsonb_typeof(config->'behavior'->'never_invent_information') = 'boolean'
    AND NULLIF(BTRIM(config->'behavior'->>'fallback_message'), '') IS NOT NULL
    AND jsonb_typeof(config->'capabilities') = 'object'
    AND jsonb_typeof(config->'capabilities'->'knowledge') = 'boolean'
    AND jsonb_typeof(config->'capabilities'->'appointments') = 'boolean'
    AND jsonb_typeof(config->'capabilities'->'sales') = 'boolean'
    AND jsonb_typeof(config->'capabilities'->'payments') = 'boolean'
    AND jsonb_typeof(config->'capabilities'->'reporting') = 'boolean'
    AND jsonb_typeof(config->'business_info') = 'object'
    AND jsonb_typeof(config->'operational_rules') = 'object'
    AND jsonb_typeof(config->'operational_rules'->'opening_hours') = 'object'
    AND jsonb_typeof(config->'operational_rules'->'human_handoff_enabled') = 'boolean'
    AND jsonb_typeof(config->'security') = 'object'
    AND jsonb_typeof(config->'security'->'require_2fa_for_admin_actions') = 'boolean'
    AND jsonb_typeof(config->'security'->'protect_sensitive_data') = 'boolean'
    AND jsonb_typeof(config->'sales_policy') = 'object'
    AND public.jsonb_is_string_array(config->'sales_policy'->'accepted_payment_methods')
    AND jsonb_typeof(config->'appointment_policy') = 'object'
    AND jsonb_typeof(config->'appointment_policy'->'enabled') = 'boolean'
    AND (config->'appointment_policy'->>'slot_duration_minutes')::INTEGER BETWEEN 5 AND 480
    AND (config->'appointment_policy'->>'buffer_between_appointments_minutes')::INTEGER BETWEEN 0 AND 240
    AND (config->'appointment_policy'->>'max_advance_booking_days')::INTEGER BETWEEN 1 AND 730
    AND (config->'appointment_policy'->>'min_advance_booking_minutes')::INTEGER BETWEEN 0 AND 10080
    AND (config->'appointment_policy'->>'cancellation_notice_minutes')::INTEGER BETWEEN 0 AND 43200
    AND public.jsonb_is_positive_integer_array(config->'appointment_policy'->'reminders_minutes')
    AND jsonb_typeof(config->'extensions') = 'object'
  );

COMMENT ON COLUMN public.companies.config IS
  'Configuración versionada v2 del agente: onboarding, perfil, comportamiento, capacidades y políticas validadas.';

DROP VIEW IF EXISTS public.v_company_agent_config_health;

CREATE VIEW public.v_company_agent_config_health AS
SELECT
  id AS company_id,
  name AS company_name,
  vertical,
  (config->>'schema_version')::INTEGER AS schema_version,
  config->'configuration'->>'status' AS configuration_status,
  (config->'configuration'->>'profile_completed')::BOOLEAN AS profile_completed,
  (config->'configuration'->>'behavior_completed')::BOOLEAN AS behavior_completed,
  (config->'configuration'->>'business_info_completed')::BOOLEAN AS business_info_completed,
  config->'profile'->>'agent_name' AS agent_name,
  config->'profile'->>'language' AS language,
  config->'profile'->>'tone' AS tone,
  is_active,
  updated_at
FROM public.companies;

COMMIT;

SELECT * FROM public.v_company_agent_config_health ORDER BY company_name;
