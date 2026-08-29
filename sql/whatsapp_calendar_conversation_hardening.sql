BEGIN;

CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_message_receipts (
  message_id text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL,
  sender_phone text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_receipts_expiration
  ON public.whatsapp_inbound_message_receipts (expires_at);

COMMENT ON TABLE public.whatsapp_inbound_message_receipts IS
  'Evita reprocesar mensajes cuando Meta reintenta un webhook de WhatsApp.';

COMMIT;
