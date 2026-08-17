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