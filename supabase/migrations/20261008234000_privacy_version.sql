CREATE OR REPLACE FUNCTION public.legal_current_versions()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('terms', '2026-10-07', 'privacy', '2026-10-08')
$$;
NOTIFY pgrst, 'reload schema';
