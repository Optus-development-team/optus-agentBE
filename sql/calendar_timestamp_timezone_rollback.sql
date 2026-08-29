-- Rollback de calendar_timestamp_timezone_migration.sql.
-- Convierte los instantes nuevamente a la representación UTC legacy.

BEGIN;

DROP VIEW IF EXISTS public.v_appointments_sync_status;
DROP VIEW IF EXISTS public.v_company_sync_health;
DROP FUNCTION IF EXISTS public.get_appointments_needing_sync(uuid, integer);
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_no_staff_overlap;

CREATE OR REPLACE FUNCTION public._calendar_instant_to_local_time(
  p_value timestamptz,
  p_company_id uuid
)
RETURNS timestamp without time zone
LANGUAGE sql
STABLE
AS $$
  SELECT p_value AT TIME ZONE COALESCE(
    (SELECT NULLIF(TRIM(c.timezone), '') FROM public.companies c
      WHERE c.id = p_company_id),
    'UTC'
  )
$$;

ALTER TABLE public.appointments
  ALTER COLUMN scheduled_start TYPE timestamp without time zone
    USING public._calendar_instant_to_local_time(scheduled_start, company_id),
  ALTER COLUMN scheduled_end TYPE timestamp without time zone
    USING public._calendar_instant_to_local_time(scheduled_end, company_id);

DROP FUNCTION public._calendar_instant_to_local_time(timestamptz, uuid);

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_staff_overlap
  EXCLUDE USING gist (
    company_id WITH =,
    staff_id WITH =,
    tsrange(scheduled_start, scheduled_end, '[)') WITH &&
  )
  WHERE (
    staff_id IS NOT NULL
    AND status IN ('pending'::appointment_status, 'confirmed'::appointment_status)
  );

CREATE FUNCTION public.get_appointments_needing_sync(
  p_company_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  google_calendar_event_id text,
  scheduled_start timestamp without time zone,
  scheduled_end timestamp without time zone,
  sync_status text,
  last_synced_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.google_calendar_event_id, a.scheduled_start,
         a.scheduled_end, a.sync_status, a.last_synced_at
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.status NOT IN ('cancelled', 'no_show')
    AND (
      a.sync_status IN ('pending', 'error')
      OR a.db_updated_at > COALESCE(a.last_synced_at, '1970-01-01'::timestamptz)
    )
  ORDER BY CASE a.sync_status
             WHEN 'pending' THEN 1
             WHEN 'error' THEN 2
             ELSE 3
           END,
           a.db_updated_at DESC
  LIMIT p_limit;
END;
$$;

CREATE VIEW public.v_appointments_sync_status AS
SELECT a.id, a.company_id, a.customer_id, a.staff_id, a.title,
       a.scheduled_start, a.scheduled_end, a.status,
       a.google_calendar_event_id, a.google_calendar_link,
       a.sync_status, a.sync_error_message, a.last_synced_at,
       a.db_updated_at, a.google_updated_at,
       CASE
         WHEN a.sync_status IN ('pending', 'error') THEN true
         WHEN a.db_updated_at > COALESCE(a.last_synced_at, '1970-01-01'::timestamptz) THEN true
         ELSE false
       END AS needs_sync,
       EXTRACT(epoch FROM (now() - a.last_synced_at)) / 60 AS minutes_since_sync,
       cs.first_name AS staff_first_name, cs.last_name AS staff_last_name,
       cs.google_calendar_id AS staff_calendar_id,
       cs.google_calendar_name AS staff_calendar_name,
       cs.calendar_sync_enabled AS staff_sync_enabled,
       c.first_name AS customer_first_name, c.last_name AS customer_last_name,
       c.phone AS customer_phone
FROM public.appointments a
LEFT JOIN public.company_staff cs ON cs.id = a.staff_id
LEFT JOIN public.customers c ON c.id = a.customer_id;

CREATE VIEW public.v_company_sync_health AS
SELECT c.id AS company_id, c.name AS company_name,
       count(a.id) AS total_appointments,
       count(a.id) FILTER (WHERE a.sync_status = 'synced') AS synced_count,
       count(a.id) FILTER (WHERE a.sync_status = 'pending') AS pending_count,
       count(a.id) FILTER (WHERE a.sync_status = 'error') AS error_count,
       count(a.id) FILTER (WHERE a.sync_status = 'conflict') AS conflict_count,
       max(a.last_synced_at) AS last_sync_time,
       ci.sync_enabled, ci.webhook_configured, ci.webhook_expiration,
       ci.last_full_sync_at,
       CASE
         WHEN ci.sync_enabled = false THEN 'disabled'
         WHEN count(a.id) FILTER (WHERE a.sync_status = 'error') > 5 THEN 'critical'
         WHEN count(a.id) FILTER (WHERE a.sync_status = 'pending') > 10 THEN 'warning'
         WHEN ci.webhook_expiration < now() + interval '1 day' THEN 'warning'
         ELSE 'healthy'
       END AS sync_health_status
FROM public.companies c
LEFT JOIN public.appointments a
  ON a.company_id = c.id
 AND a.status NOT IN ('cancelled', 'no_show')
 AND a.scheduled_start >= now() - interval '30 days'
LEFT JOIN public.company_integrations ci
  ON ci.company_id = c.id AND ci.provider = 'GOOGLE_CALENDAR'
GROUP BY c.id, c.name, ci.sync_enabled, ci.webhook_configured,
         ci.webhook_expiration, ci.last_full_sync_at;

GRANT ALL ON FUNCTION public.get_appointments_needing_sync(uuid, integer)
  TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.v_appointments_sync_status
  TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.v_company_sync_health
  TO anon, authenticated, service_role;

COMMIT;
