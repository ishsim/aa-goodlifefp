-- The plan-images RLS policies were applied in 20260817123748 but the bucket itself was
-- not created, so every upload fails with NoSuchBucket and the app falls back to
-- embedding images as base64 in the client record — the pattern that drove disk IO to
-- 100%. This creates the missing bucket; the policies from that migration then apply.
INSERT INTO storage.buckets (id, name, public)
VALUES ('plan-images', 'plan-images', false)
ON CONFLICT (id) DO NOTHING;
