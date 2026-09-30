-- Run only with a trusted database connection (never through the browser).
-- psql -v admin_email='owner@example.com' -v ON_ERROR_STOP=1 -f platform-owner.sql
BEGIN;
SELECT set_config('platform.setup_email', :'admin_email', true);
DO $$
DECLARE v_user uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users
  WHERE lower(email) = lower(current_setting('platform.setup_email')) AND email_confirmed_at IS NOT NULL;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'A conta informada não existe ou ainda não confirmou o e-mail.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id <> v_user) THEN
    RAISE EXCEPTION 'Já existe outro administrador. Revise os acessos antes de continuar.';
  END IF;
  INSERT INTO public.platform_admins(user_id) VALUES (v_user) ON CONFLICT DO NOTHING;
END;
$$;
COMMIT;
