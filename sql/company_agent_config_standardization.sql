BEGIN;

CREATE TABLE IF NOT EXISTS public.company_config_migration_snapshots (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  original_config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, schema_version)
);

COMMENT ON TABLE public.company_config_migration_snapshots IS
  'Snapshot previo a cada migración versionada de companies.config';

INSERT INTO public.company_config_migration_snapshots (
  company_id,
  schema_version,
  original_config
)
SELECT id, 1, COALESCE(config, '{}'::jsonb)
  FROM public.companies
ON CONFLICT (company_id, schema_version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.normalize_company_agent_config(
  p_company_name TEXT,
  p_vertical TEXT,
  p_config JSONB
) RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_config JSONB := CASE
    WHEN jsonb_typeof(p_config) = 'object' THEN p_config
    ELSE '{}'::jsonb
  END;
  v_profile JSONB;
  v_behavior JSONB;
  v_business_info JSONB;
  v_operational JSONB;
  v_security JSONB;
  v_sales JSONB;
  v_appointments JSONB;
  v_capabilities JSONB;
  v_agent_name TEXT;
  v_language TEXT;
  v_tone TEXT;
  v_persona TEXT;
  v_result JSONB;
BEGIN
  v_profile := CASE WHEN jsonb_typeof(v_config->'profile') = 'object'
    THEN v_config->'profile' ELSE '{}'::jsonb END;
  v_behavior := CASE WHEN jsonb_typeof(v_config->'behavior') = 'object'
    THEN v_config->'behavior' ELSE '{}'::jsonb END;
  v_business_info := CASE WHEN jsonb_typeof(v_config->'business_info') = 'object'
    THEN v_config->'business_info' ELSE '{}'::jsonb END;
  v_operational := CASE WHEN jsonb_typeof(v_config->'operational_rules') = 'object'
    THEN v_config->'operational_rules' ELSE '{}'::jsonb END;
  v_security := CASE WHEN jsonb_typeof(v_config->'security') = 'object'
    THEN v_config->'security' ELSE '{}'::jsonb END;
  v_sales := CASE WHEN jsonb_typeof(v_config->'sales_policy') = 'object'
    THEN v_config->'sales_policy' ELSE '{}'::jsonb END;
  v_appointments := CASE WHEN jsonb_typeof(v_config->'appointment_policy') = 'object'
    THEN v_config->'appointment_policy' ELSE '{}'::jsonb END;
  v_capabilities := CASE WHEN jsonb_typeof(v_config->'capabilities') = 'object'
    THEN v_config->'capabilities' ELSE '{}'::jsonb END;

  v_agent_name := COALESCE(
    NULLIF(BTRIM(v_profile->>'agent_name'), ''),
    'Asistente de ' || COALESCE(NULLIF(BTRIM(p_company_name), ''), 'la empresa')
  );
  v_language := COALESCE(NULLIF(BTRIM(v_profile->>'language'), ''), 'es-BO');
  v_tone := COALESCE(
    NULLIF(BTRIM(v_profile->>'tone'), ''),
    NULLIF(BTRIM(v_config->>'tone'), ''),
    'Profesional, amable y claro'
  );
  v_persona := COALESCE(
    NULLIF(BTRIM(v_profile->>'persona_description'), ''),
    'Asistente de ' || COALESCE(NULLIF(BTRIM(p_company_name), ''), 'la empresa') ||
      '. Responde con información verificada y ayuda al cliente sin inventar datos.'
  );

  v_profile := v_profile || jsonb_build_object(
    'agent_name', v_agent_name,
    'language', v_language,
    'tone', v_tone,
    'persona_description', v_persona
  );

  v_behavior := jsonb_build_object(
    'response_style', 'concise',
    'use_emojis', FALSE,
    'emoji_intensity', 0,
    'address_customer_as', 'tu',
    'ask_clarifying_questions', TRUE,
    'confirm_before_actions', TRUE,
    'never_invent_information', TRUE,
    'fallback_message',
      'No tengo información suficiente para responder con seguridad. ¿Puedes darme más detalles?'
  ) || v_behavior;

  v_capabilities := jsonb_build_object(
    'knowledge', TRUE,
    'appointments', TRUE,
    'sales', TRUE,
    'payments', FALSE,
    'reporting', FALSE
  ) || v_capabilities;

  v_business_info := jsonb_build_object(
    'industry', COALESCE(NULLIF(BTRIM(p_vertical), ''), 'general'),
    'value_proposition', '',
    'address', '',
    'google_maps_link', '',
    'inventory_context', COALESCE(v_config->>'inventory_context', '')
  ) || v_business_info;

  v_operational := jsonb_build_object(
    'contact_phone', '',
    'opening_hours', '{}'::jsonb,
    'human_handoff_enabled', TRUE,
    'human_handoff_message',
      'Voy a derivar tu consulta con una persona del equipo.'
  ) || v_operational;

  v_security := jsonb_build_object(
    'require_2fa_for_admin_actions', TRUE,
    'protect_sensitive_data', TRUE
  ) || v_security;

  v_sales := jsonb_build_object(
    'accepted_payment_methods', '[]'::jsonb,
    'delivery_policy', '',
    'refund_policy', '',
    'stock_behavior', ''
  ) || v_sales;

  v_appointments := jsonb_build_object(
    'enabled', TRUE,
    'service_name', 'Cita',
    'cancellation_rule', '',
    'slot_duration_minutes', 30,
    'buffer_between_appointments_minutes', 0,
    'max_advance_booking_days', 30,
    'min_advance_booking_minutes', 60,
    'cancellation_notice_minutes', 120,
    'reminders_minutes', jsonb_build_array(1440, 120)
  ) || v_appointments;

  v_result := v_config - 'tone' - 'timezone' - 'inventory_context';
  RETURN v_result || jsonb_build_object(
    'schema_version', 1,
    'profile', v_profile,
    'behavior', v_behavior,
    'capabilities', v_capabilities,
    'business_info', v_business_info,
    'operational_rules', v_operational,
    'security', v_security,
    'sales_policy', v_sales,
    'appointment_policy', v_appointments
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_normalize_company_agent_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.config := public.normalize_company_agent_config(
    NEW.name,
    NEW.vertical,
    NEW.config
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_company_agent_config_before_write
  ON public.companies;

CREATE TRIGGER normalize_company_agent_config_before_write
BEFORE INSERT OR UPDATE OF name, vertical, config
ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.trg_normalize_company_agent_config();

UPDATE public.companies
   SET config = public.normalize_company_agent_config(name, vertical, config),
       updated_at = NOW();

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS chk_companies_agent_config_v1;

ALTER TABLE public.companies
  ADD CONSTRAINT chk_companies_agent_config_v1 CHECK (
    jsonb_typeof(config) = 'object'
    AND config->>'schema_version' = '1'
    AND config ?& ARRAY[
      'profile',
      'behavior',
      'capabilities',
      'business_info',
      'operational_rules',
      'security',
      'sales_policy',
      'appointment_policy'
    ]
    AND jsonb_typeof(config->'profile') = 'object'
    AND NULLIF(BTRIM(config->'profile'->>'agent_name'), '') IS NOT NULL
    AND NULLIF(BTRIM(config->'profile'->>'language'), '') IS NOT NULL
    AND NULLIF(BTRIM(config->'profile'->>'tone'), '') IS NOT NULL
    AND NULLIF(BTRIM(config->'profile'->>'persona_description'), '') IS NOT NULL
    AND jsonb_typeof(config->'behavior') = 'object'
    AND jsonb_typeof(config->'capabilities') = 'object'
    AND jsonb_typeof(config->'business_info') = 'object'
    AND jsonb_typeof(config->'operational_rules') = 'object'
    AND jsonb_typeof(config->'security') = 'object'
    AND jsonb_typeof(config->'sales_policy') = 'object'
    AND jsonb_typeof(config->'appointment_policy') = 'object'
  );

COMMENT ON COLUMN public.companies.config IS
  'Configuración versionada del agente. Estructura obligatoria normalizada por normalize_company_agent_config().';

CREATE OR REPLACE VIEW public.v_company_agent_config_health AS
SELECT
  id AS company_id,
  name AS company_name,
  vertical,
  (config->>'schema_version')::INTEGER AS schema_version,
  config->'profile'->>'agent_name' AS agent_name,
  config->'profile'->>'language' AS language,
  config->'profile'->>'tone' AS tone,
  is_active,
  updated_at
FROM public.companies;

COMMENT ON VIEW public.v_company_agent_config_health IS
  'Resumen auditable de la configuración estándar del agente por empresa';

COMMIT;

SELECT *
  FROM public.v_company_agent_config_health
 ORDER BY company_name;
