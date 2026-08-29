BEGIN;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS chk_companies_agent_config_v2;

ALTER TABLE public.companies
  DISABLE TRIGGER normalize_company_agent_config_before_write;

UPDATE public.companies AS company
   SET config = snapshot.original_config,
       vertical = snapshot.original_vertical,
       updated_at = NOW()
  FROM public.company_config_migration_snapshots AS snapshot
 WHERE snapshot.company_id = company.id
   AND snapshot.schema_version = 2;

ALTER TABLE public.companies
  ENABLE TRIGGER normalize_company_agent_config_before_write;

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

ALTER TABLE public.companies
  ADD CONSTRAINT chk_companies_agent_config_v1 CHECK (
    jsonb_typeof(config) = 'object'
    AND config->>'schema_version' = '1'
    AND config ?& ARRAY[
      'profile','behavior','capabilities','business_info',
      'operational_rules','security','sales_policy','appointment_policy'
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
  'Configuración versionada v1 del agente.';

DROP VIEW IF EXISTS public.v_company_agent_config_health;

CREATE VIEW public.v_company_agent_config_health AS
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

DROP FUNCTION IF EXISTS public.normalize_company_agent_config_v2(TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.jsonb_is_positive_integer_array(JSONB);
DROP FUNCTION IF EXISTS public.jsonb_is_string_array(JSONB);

COMMIT;
