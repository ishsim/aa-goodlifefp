-- Plan images (uploaded diagrams/benefit illustrations attached to a recommended plan) were
-- previously embedded as base64 inside the clients.data JSON blob, so every edit to any field
-- on a client re-wrote every image on that client back to the database. Moving them to Storage
-- means editing a client's other fields no longer touches the image bytes at all.

INSERT INTO storage.buckets (id, name, public)
VALUES ('plan-images', 'plan-images', false)
ON CONFLICT (id) DO NOTHING;

-- Objects are stored under "{auth.uid()}/...", mirroring the clients table's per-advisor
-- isolation (auth.uid() = user_id) — each advisor can only reach their own uploads.
DROP POLICY IF EXISTS "Advisors read own plan images" ON storage.objects;
CREATE POLICY "Advisors read own plan images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'plan-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Advisors upload own plan images" ON storage.objects;
CREATE POLICY "Advisors upload own plan images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'plan-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Advisors update own plan images" ON storage.objects;
CREATE POLICY "Advisors update own plan images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'plan-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'plan-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Advisors delete own plan images" ON storage.objects;
CREATE POLICY "Advisors delete own plan images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'plan-images' AND (storage.foldername(name))[1] = auth.uid()::text);
