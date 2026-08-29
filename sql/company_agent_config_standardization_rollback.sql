BEGIN;

DROP VIEW IF EXISTS public.v_company_agent_config_health;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS chk_companies_agent_config_v1;

DROP TRIGGER IF EXISTS normalize_company_agent_config_before_write
  ON public.companies;

UPDATE public.companies AS company
   SET config = snapshot.original_config,
       updated_at = NOW()
  FROM public.company_config_migration_snapshots AS snapshot
 WHERE snapshot.company_id = company.id
   AND snapshot.schema_version = 1;

DROP FUNCTION IF EXISTS public.trg_normalize_company_agent_config();
DROP FUNCTION IF EXISTS public.normalize_company_agent_config(TEXT, TEXT, JSONB);

DROP TABLE IF EXISTS public.company_config_migration_snapshots;

COMMIT;
