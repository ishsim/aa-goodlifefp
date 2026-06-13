ALTER TABLE public.clients ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS clients_user_id_idx ON public.clients(user_id);

DROP POLICY IF EXISTS "Public read clients" ON public.clients;
DROP POLICY IF EXISTS "Public insert clients" ON public.clients;
DROP POLICY IF EXISTS "Public update clients" ON public.clients;
DROP POLICY IF EXISTS "Public delete clients" ON public.clients;

REVOKE ALL ON public.clients FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

CREATE POLICY "Users select own clients" ON public.clients
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own clients" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own clients" ON public.clients
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own clients" ON public.clients
  FOR DELETE TO authenticated USING (auth.uid() = user_id);