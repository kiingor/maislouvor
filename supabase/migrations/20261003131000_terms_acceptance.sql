-- Aceite dos Termos de Uso e da Política de Privacidade (App Store / Google Play / LGPD).
--
-- O perfil guarda quando (relógio do servidor) e quais versões a pessoa aceitou.
-- O app compara com as versões vigentes (src/lib/legal.ts) e, se estiverem
-- diferentes, pede um novo aceite antes de liberar /app e /admin (TermsGate).
-- Perfis existentes começam sem aceite e verão o pedido uma única vez.
--
-- Só a RPC accept_terms grava essas colunas. A política "Users can update own
-- profile" libera a linha inteira para o próprio dono; sem o gatilho abaixo,
-- um cliente poderia gravar uma data de aceite inventada.
--
-- O banco conhece as versões vigentes (legal_current_versions) e só aceita
-- essas: ninguém registra o aceite de uma versão que ainda não existe nem de
-- uma antiga. Para publicar uma versão nova dos documentos, crie uma migração
-- que redefina legal_current_versions() com a mesma data de TERMS_VERSION e
-- PRIVACY_VERSION (src/lib/legal.ts) e publique-a junto com o app.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS privacy_version text;

COMMENT ON COLUMN public.profiles.terms_accepted_at IS 'Quando o usuário aceitou os Termos/Política vigentes (gravado por accept_terms).';
COMMENT ON COLUMN public.profiles.terms_version IS 'Versão dos Termos de Uso aceita (ex.: 2026-10-03).';
COMMENT ON COLUMN public.profiles.privacy_version IS 'Versão da Política de Privacidade aceita (ex.: 2026-10-03).';

-- Clientes (anon/authenticated, via PostgREST) não alteram o aceite direto:
-- no INSERT as colunas ficam vazias e no UPDATE mantêm o valor anterior, sem
-- erro, para não quebrar quem salva o perfil inteiro. A RPC (SECURITY DEFINER,
-- roda como dono) e o backend (service_role) passam normalmente.
CREATE OR REPLACE FUNCTION public.profiles_guard_terms_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.terms_accepted_at := NULL;
      NEW.terms_version := NULL;
      NEW.privacy_version := NULL;
    ELSE
      NEW.terms_accepted_at := OLD.terms_accepted_at;
      NEW.terms_version := OLD.terms_version;
      NEW.privacy_version := OLD.privacy_version;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_guard_terms_acceptance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_guard_terms_acceptance ON public.profiles;
CREATE TRIGGER profiles_guard_terms_acceptance
  BEFORE INSERT OR UPDATE OF terms_accepted_at, terms_version, privacy_version ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_terms_acceptance();

-- Versões vigentes dos Termos de Uso e da Política de Privacidade. Pública
-- (não é segredo). STABLE, e não IMMUTABLE, para que uma migração futura que a
-- redefina valha na hora, sem planos em cache com a versão antiga.
CREATE OR REPLACE FUNCTION public.legal_current_versions()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object('terms', '2026-10-03', 'privacy', '2026-10-03')
$$;

REVOKE ALL ON FUNCTION public.legal_current_versions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.legal_current_versions() TO anon, authenticated, service_role;

-- Registra o aceite de quem chama, e só dele, das versões vigentes. Versão mal
-- formada: 22023. Versão que não é a vigente (app desatualizado ou chamada
-- forjada): 22023 com "outdated_version" na mensagem, que o app traduz.
CREATE OR REPLACE FUNCTION public.accept_terms(p_terms_version text, p_privacy_version text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_terms text := btrim(coalesce(p_terms_version, ''));
  v_privacy text := btrim(coalesce(p_privacy_version, ''));
  v_current jsonb := public.legal_current_versions();
  v_accepted_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para aceitar os termos.' USING ERRCODE = '42501';
  END IF;

  IF v_terms !~ '^[A-Za-z0-9._-]{1,32}$' OR v_privacy !~ '^[A-Za-z0-9._-]{1,32}$' THEN
    RAISE EXCEPTION 'Versão dos Termos de Uso ou da Política de Privacidade inválida.' USING ERRCODE = '22023';
  END IF;

  IF v_terms IS DISTINCT FROM v_current->>'terms' OR v_privacy IS DISTINCT FROM v_current->>'privacy' THEN
    RAISE EXCEPTION 'outdated_version: os Termos de Uso ou a Política de Privacidade mudaram. Atualize o app para ler a versão vigente.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET terms_accepted_at = now(),
         terms_version = v_terms,
         privacy_version = v_privacy
   WHERE user_id = v_uid
  RETURNING terms_accepted_at INTO v_accepted_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'terms_accepted_at', v_accepted_at,
    'terms_version', v_terms,
    'privacy_version', v_privacy
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_terms(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_terms(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
