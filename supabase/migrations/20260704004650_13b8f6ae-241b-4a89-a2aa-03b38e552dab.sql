
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_email text;
CREATE INDEX IF NOT EXISTS clients_client_email_lower_idx ON public.clients (lower(client_email));

-- Backfill from existing jsonb data if present
UPDATE public.clients
  SET client_email = lower(nullif(trim(data->>'email'), ''))
  WHERE client_email IS NULL AND data ? 'email';

CREATE TABLE IF NOT EXISTS public.client_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  client_name text,
  advisor_user_id uuid NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.client_notifications TO authenticated;
GRANT ALL ON public.client_notifications TO service_role;
ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Advisors read own notifications" ON public.client_notifications;
CREATE POLICY "Advisors read own notifications" ON public.client_notifications
  FOR SELECT TO authenticated USING (auth.uid() = advisor_user_id);

DROP POLICY IF EXISTS "Advisors update own notifications" ON public.client_notifications;
CREATE POLICY "Advisors update own notifications" ON public.client_notifications
  FOR UPDATE TO authenticated USING (auth.uid() = advisor_user_id) WITH CHECK (auth.uid() = advisor_user_id);

DROP POLICY IF EXISTS "Advisors delete own notifications" ON public.client_notifications;
CREATE POLICY "Advisors delete own notifications" ON public.client_notifications
  FOR DELETE TO authenticated USING (auth.uid() = advisor_user_id);
