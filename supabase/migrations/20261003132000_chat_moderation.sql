-- Moderação do chat da equipe (App Store 1.2 — conteúdo gerado por usuários;
-- Google Play — política de UGC com denúncia dentro do app).
--
--   1. Filtro de conteúdo ofensivo: trigger em messages mascara palavras de uma
--      lista (chat_blocked_terms), por palavra inteira e sem diferenciar acentos;
--      mensagens de texto têm no máximo 4.000 caracteres.
--   2. Denúncias (chat_reports): só pela RPC report_chat_message, com limite por
--      hora, cópia da mensagem no momento da denúncia e aviso à liderança e aos
--      administradores da plataforma — nunca a quem foi denunciado. Denúncias
--      sobre alguém da liderança ficam só com a plataforma.
--   3. Bloqueios (user_blocks): cada pessoa vê e mexe só nos próprios.
--   4. Apagar mensagens: o autor apaga as suas; a liderança (e a plataforma)
--      apaga qualquer uma da equipe, inclusive o anexo no Storage — menos o
--      anexo que é prova de denúncia em aberto.
--
--   5. Anexos: attachment_path é gravado pelo cliente, então o banco exige a
--      pasta da equipe da mensagem e um arquivo por mensagem — ninguém aponta
--      uma mensagem para o arquivo de outra pessoa (que a exclusão de conta ou
--      a moderação apagariam como se fosse dela).
--   6. Plataforma: aviso por push a cada denúncia nova (send-push) e suspensão
--      de contas (edge function platform-suspend-account), com transferência
--      da propriedade da equipe de quem foi suspenso.
--
-- Depende de 20260930010000_platform_admin_and_support.sql (is_platform_admin,
-- platform_admins, platform_audit_log), de 20261003120000 (guardas de líder e
-- dono, já em produção) e de 20261003130000 (gatilho que registra e avisa toda
-- troca de dono). Escritas só por RPC: nenhum cliente
-- grava direto nestas tabelas. As funções usadas pelas policies do Storage
-- ficam no schema private (fora da API do PostgREST): ninguém as chama como RPC
-- para descobrir se existe denúncia sobre um arquivo.
--
-- Idempotente. Cria policies em storage.objects e gatilhos em messages e
-- notifications (lock exclusivo rápido): com lock_timeout, se uma transação
-- longa segurar a tabela, a migração desiste em 3 s. Deu timeout? Rode de novo.

SET lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. Filtro de conteúdo
-- ---------------------------------------------------------------------------

-- Lista conservadora: só palavras que quase sempre são xingamento ou ofensa.
-- Termos ambíguos (veado, macaco, bicha, piranha, rola, pica, arrombado,
-- crioulo, retardado — "efeito retardado"...) ficam de fora para não mascarar
-- frases comuns. Para ampliar:
--   INSERT INTO public.chat_blocked_terms(term) VALUES ('novotermo');
-- O termo é gravado sem acento e em minúsculas; vale para mensagens novas.
CREATE TABLE IF NOT EXISTS public.chat_blocked_terms (
  term text PRIMARY KEY CHECK (term ~ '^[a-z0-9]{2,40}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_blocked_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_blocked_terms FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.chat_blocked_terms TO service_role;

INSERT INTO public.chat_blocked_terms(term) VALUES
  -- palavrões e insultos
  ('porra'), ('caralho'), ('krl'), ('crl'), ('merda'), ('bosta'), ('puta'), ('puto'),
  ('putaria'), ('putinha'), ('pqp'), ('foda'), ('foder'), ('fuder'), ('fodase'),
  ('fodido'), ('fudido'), ('fdp'), ('filhodaputa'), ('buceta'), ('boceta'), ('xoxota'),
  ('xereca'), ('piroca'), ('punheta'), ('cu'), ('cuzao'), ('vsf'), ('vtnc'), ('tnc'),
  ('desgracado'), ('desgracada'), ('vagabunda'), ('vagabundo'), ('vadia'), ('babaca'),
  ('otario'), ('otaria'), ('corno'),
  -- ofensas contra grupos (homofobia, transfobia, capacitismo)
  ('viado'), ('viadinho'), ('viadao'), ('boiola'), ('baitola'), ('bichona'), ('traveco'),
  ('sapatao'), ('mongoloide')
ON CONFLICT (term) DO NOTHING;

-- Minúsculas sem acento, caractere por caractere (translate: não depende do
-- locale do banco).
CREATE OR REPLACE FUNCTION public.chat_fold_text(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT translate(p_text,
    'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
    'abcdefghijklmnopqrstuvwxyzaaaaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuuccnnyyy')
$$;

-- Chave de comparação de uma palavra: sem acentos (inclusive os combinantes,
-- U+0300–U+036F, de quem digita "o" + "´" separados), números usados como letras
-- (p0rra) viram letras e letras repetidas (porrrraaa) contam uma vez só.
CREATE OR REPLACE FUNCTION public.chat_term_key(p_word text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = '' AS $$
  SELECT regexp_replace(
    translate(public.chat_fold_text(regexp_replace(p_word, '[\u0300-\u036f]', '', 'g')), '013457', 'oieast'),
    '(.)\1+', '\1', 'g')
$$;

-- Troca por asteriscos cada palavra inteira da lista (ou o plural com "s").
-- Palavras que só contêm um termo (computador, disputa, cuidado) ficam intactas.
-- Palavra = letras e números (com os acentos que chat_fold_text conhece) e acentos
-- combinantes; o resto separa. Uma passada só pelo texto (regexp_matches +
-- string_agg): concatenar token a token deixava mensagens longas quadráticas.
CREATE OR REPLACE FUNCTION public.chat_mask_text(p_text text) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  c_word constant text := 'A-Za-z0-9ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ\u0300-\u036f';
  v_terms text[];
BEGIN
  IF p_text IS NULL OR p_text = '' THEN RETURN p_text; END IF;
  SELECT coalesce(array_agg(DISTINCT public.chat_term_key(term)), '{}') INTO v_terms FROM public.chat_blocked_terms;
  IF cardinality(v_terms) = 0 THEN RETURN p_text; END IF;
  RETURN coalesce((
    SELECT string_agg(CASE
        WHEN t.key = ANY (v_terms) OR (t.key ~ '.s$' AND left(t.key, -1) = ANY (v_terms))
          THEN repeat('*', length(regexp_replace(t.token, '[\u0300-\u036f]', '', 'g')))
        ELSE t.token END, '' ORDER BY t.n)
    FROM (
      -- (m.g)[2] só vem preenchido quando o pedaço é uma palavra.
      SELECT m.n, (m.g)[1] AS token, public.chat_term_key((m.g)[2]) AS key
      FROM regexp_matches(p_text, '(([' || c_word || ']+)|[^' || c_word || ']+)', 'g') WITH ORDINALITY AS m(g, n)
    ) t
  ), p_text);
END;
$$;

-- Teto de tamanho (o compositor do app limita igual): sem ele, um texto gigante
-- prende o banco no filtro e no Realtime de todos.
CREATE OR REPLACE FUNCTION public.chat_filter_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.content IS NOT NULL THEN
    IF length(NEW.content) > 4000 THEN
      RAISE EXCEPTION 'A mensagem pode ter até 4.000 caracteres.' USING ERRCODE = '22001';
    END IF;
    NEW.content := public.chat_mask_text(NEW.content);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_filter_message ON public.messages;
CREATE TRIGGER chat_filter_message BEFORE INSERT OR UPDATE OF content ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_filter_message();

-- Avisos escritos por alguém ("Enviar aviso ao time" e os demais com remetente)
-- passam pelo mesmo filtro. Os do sistema (sem remetente) não precisam.
CREATE OR REPLACE FUNCTION public.notifications_filter_text() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.sender_profile_id IS NOT NULL THEN
    NEW.title := public.chat_mask_text(NEW.title);
    NEW.body := public.chat_mask_text(NEW.body);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_filter_text ON public.notifications;
CREATE TRIGGER notifications_filter_text BEFORE INSERT OR UPDATE OF title, body ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_filter_text();

-- ---------------------------------------------------------------------------
-- 2. Denúncias
-- ---------------------------------------------------------------------------

-- As referências a perfis usam SET NULL: excluir a conta de quem denunciou ou
-- de quem foi denunciado não apaga o registro nem trava a exclusão. A cópia da
-- mensagem (message_*) sobrevive à mensagem apagada.
CREATE TABLE IF NOT EXISTS public.chat_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  reported_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reporter_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN ('ofensivo', 'assedio', 'odio', 'sexual', 'spam', 'direitos_autorais', 'outro')),
  details text CHECK (details IS NULL OR length(details) <= 500),
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_analise', 'resolvida', 'descartada')),
  -- Denúncia sobre alguém da liderança (ou o responsável pela equipe) no momento
  -- da denúncia: só a plataforma vê e decide, para líderes não julgarem uns aos outros.
  platform_only boolean NOT NULL DEFAULT false,
  message_type text NOT NULL DEFAULT 'text',
  message_content text,
  message_attachment_path text,
  message_created_at timestamptz,
  -- Quem apagou a mensagem depois da denúncia (papel, não a pessoa).
  message_deleted_at timestamptz,
  message_deleted_role text CHECK (message_deleted_role IS NULL OR message_deleted_role IN ('autor', 'lideranca', 'plataforma', 'sistema')),
  member_removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_note text CHECK (resolution_note IS NULL OR length(resolution_note) <= 1000)
);
CREATE INDEX IF NOT EXISTS chat_reports_team_status_idx ON public.chat_reports(team_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_reports_queue_idx ON public.chat_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_reports_reporter_idx ON public.chat_reports(reporter_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_reports_reported_idx ON public.chat_reports(reported_profile_id);
CREATE INDEX IF NOT EXISTS chat_reports_resolved_by_idx ON public.chat_reports(resolved_by);
CREATE INDEX IF NOT EXISTS chat_reports_message_idx ON public.chat_reports(message_id);
CREATE INDEX IF NOT EXISTS chat_reports_attachment_idx ON public.chat_reports(message_attachment_path)
  WHERE message_attachment_path IS NOT NULL;
-- Uma denúncia por pessoa e mensagem.
CREATE UNIQUE INDEX IF NOT EXISTS chat_reports_once_idx ON public.chat_reports(reporter_profile_id, message_id)
  WHERE message_id IS NOT NULL AND reporter_profile_id IS NOT NULL;
-- Quando o push para os administradores da plataforma saiu (uma vez por denúncia).
ALTER TABLE public.chat_reports ADD COLUMN IF NOT EXISTS platform_alerted_at timestamptz;

ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_reports FROM PUBLIC, anon, authenticated;
-- Leitura direta só das colunas sem decisão interna: anotação, quem resolveu,
-- remoção do autor e a cópia da mensagem ficam para list_chat_reports (moderadores).
-- O app lê tudo pelas RPCs; isto é para quem denunciou acompanhar o status.
GRANT SELECT (id, team_id, message_id, reason, details, status, created_at, resolved_at)
  ON public.chat_reports TO authenticated;
GRANT ALL ON public.chat_reports TO service_role;

-- Quem denunciou vê as próprias denúncias; a liderança vê as da equipe, menos
-- as que são sobre alguém da liderança (essas ficam com a plataforma); a
-- plataforma vê todas.
DROP POLICY IF EXISTS "Chat reports: reporter, team leaders and platform" ON public.chat_reports;
CREATE POLICY "Chat reports: reporter, team leaders and platform" ON public.chat_reports
  FOR SELECT TO authenticated USING (
    reporter_profile_id = (SELECT public.get_my_profile_id())
    OR (SELECT public.is_platform_admin())
    OR (NOT platform_only AND public.has_team_role((SELECT auth.uid()), team_id, 'admin')
        AND reported_profile_id IS DISTINCT FROM (SELECT public.get_my_profile_id()))
  );

-- Mesma regra da policy, para as RPCs de leitura e moderação.
DROP FUNCTION IF EXISTS public.chat_can_moderate(uuid, uuid);
CREATE OR REPLACE FUNCTION public.chat_can_moderate(p_team_id uuid, p_reported_profile_id uuid, p_platform_only boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_platform_admin()
    OR (NOT coalesce(p_platform_only, true) AND public.has_team_role(auth.uid(), p_team_id, 'admin')
        AND p_reported_profile_id IS DISTINCT FROM public.get_my_profile_id())
  )
$$;

CREATE OR REPLACE FUNCTION public.chat_report_reason_label(p_reason text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_reason
    WHEN 'ofensivo' THEN 'Ofensivo ou desrespeitoso'
    WHEN 'assedio' THEN 'Assédio ou intimidação'
    WHEN 'odio' THEN 'Discurso de ódio ou discriminação'
    WHEN 'sexual' THEN 'Conteúdo sexual'
    WHEN 'spam' THEN 'Spam ou golpe'
    WHEN 'direitos_autorais' THEN 'Direitos autorais'
    ELSE 'Outro motivo' END
$$;

CREATE OR REPLACE FUNCTION public.report_chat_message(p_message_id uuid, p_reason text, p_details text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile uuid := public.get_my_profile_id();
  v_msg public.messages;
  v_details text := nullif(btrim(p_details), '');
  v_id uuid;
  v_team_name text;
  v_body text;
  v_platform_only boolean;
  v_team_admins uuid[];
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION 'Entre para denunciar uma mensagem.' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('ofensivo', 'assedio', 'odio', 'sexual', 'spam', 'direitos_autorais', 'outro') THEN
    RAISE EXCEPTION 'Escolha o motivo da denúncia.' USING ERRCODE = '22023';
  END IF;
  IF length(v_details) > 500 THEN
    RAISE EXCEPTION 'Os detalhes podem ter até 500 caracteres.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_msg FROM public.messages WHERE id = p_message_id;
  -- Mesma visibilidade do chat: só quem enxerga a mensagem pode denunciá-la.
  IF v_msg.id IS NULL OR NOT public.member_can(auth.uid(), v_msg.team_id, 'chat', 'ver') THEN
    RAISE EXCEPTION 'Mensagem não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF v_msg.sender_profile_id = v_profile THEN
    RAISE EXCEPTION 'Você não pode denunciar a sua própria mensagem.' USING ERRCODE = '22023';
  END IF;

  -- Serializa as denúncias da pessoa: pedidos simultâneos não furam o limite.
  PERFORM pg_advisory_xact_lock(hashtextextended('chat-report:' || v_profile::text, 0));
  SELECT id INTO v_id FROM public.chat_reports WHERE reporter_profile_id = v_profile AND message_id = v_msg.id;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_id, 'already_reported', true, 'notify_profile_ids', '[]'::jsonb);
  END IF;
  IF (SELECT count(*) FROM public.chat_reports
      WHERE reporter_profile_id = v_profile AND created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'Você enviou muitas denúncias em pouco tempo. Tente novamente em uma hora.' USING ERRCODE = 'P0001';
  END IF;

  SELECT name, owner_id = v_msg.sender_profile_id INTO v_team_name, v_platform_only
  FROM public.teams WHERE id = v_msg.team_id;
  v_platform_only := coalesce(v_platform_only, false) OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = v_msg.team_id AND tm.profile_id = v_msg.sender_profile_id AND tm.role = 'admin');

  INSERT INTO public.chat_reports(team_id, message_id, reported_profile_id, reporter_profile_id, reason, details,
    platform_only, message_type, message_content, message_attachment_path, message_created_at)
  VALUES (v_msg.team_id, v_msg.id, v_msg.sender_profile_id, v_profile, p_reason, v_details,
    v_platform_only, coalesce(v_msg.message_type, 'text'), v_msg.content, v_msg.attachment_path, v_msg.created_at)
  RETURNING id INTO v_id;

  -- Avisos: administradores da plataforma (fila /admin/denuncias) e liderança da
  -- equipe (exceto quando a denúncia é sobre a liderança). Quem foi denunciado
  -- nunca recebe; quem denunciou também não. O nome da equipe vai no texto: um
  -- líder de duas equipes sabe de qual se trata.
  v_body := coalesce(v_team_name, 'Equipe') || ' · ' || public.chat_report_reason_label(p_reason) || '. Analise em até 24 horas.';
  INSERT INTO public.notifications(profile_id, type, title, body, link, team_id)
  SELECT DISTINCT p.id, 'chat_report', 'Nova denúncia no chat', v_body, '/admin/denuncias', NULL::uuid
  FROM public.platform_admins pa JOIN public.profiles p ON p.user_id = pa.user_id
  WHERE p.id <> v_msg.sender_profile_id AND p.id <> v_profile;

  SELECT coalesce(array_agg(tm.profile_id), '{}') INTO v_team_admins
  FROM public.team_members tm
  WHERE NOT v_platform_only AND tm.team_id = v_msg.team_id AND tm.role = 'admin'
    AND tm.profile_id <> v_msg.sender_profile_id AND tm.profile_id <> v_profile;

  -- ?equipe=: o app troca para a equipe certa antes de abrir a aba Membros.
  INSERT INTO public.notifications(profile_id, type, title, body, link, team_id)
  SELECT a, 'chat_report', 'Nova denúncia no chat', v_body,
    '/app/settings?aba=membros&equipe=' || v_msg.team_id::text, v_msg.team_id
  FROM unnest(v_team_admins) AS a
  -- Quem também é administrador da plataforma já recebeu o aviso acima.
  WHERE NOT EXISTS (SELECT 1 FROM public.platform_admins pa JOIN public.profiles p ON p.user_id = pa.user_id WHERE p.id = a);

  -- notify_profile_ids: liderança da equipe, para o push (send-push só entrega a
  -- membros). A plataforma recebe o push pelo send-push com chat_report_id
  -- (chat_report_platform_push_targets), sem o app saber quem administra.
  RETURN jsonb_build_object('id', v_id, 'already_reported', false, 'notify_profile_ids', to_jsonb(v_team_admins),
    'team_name', v_team_name);
END;
$$;

-- Push da denúncia para os administradores da plataforma (prazo de 24 horas,
-- inclusive as denúncias sobre a liderança, que nenhum líder vê). Quem chama é o
-- send-push (service_role), com o usuário do JWT de quem denunciou: só a própria
-- denúncia, recém-criada, e uma vez só. Devolve os perfis que recebem o push.
CREATE OR REPLACE FUNCTION public.chat_report_platform_push_targets(p_report_id uuid, p_user_id uuid)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_report public.chat_reports; v_targets uuid[];
BEGIN
  SELECT r.* INTO v_report FROM public.chat_reports r
  JOIN public.profiles p ON p.id = r.reporter_profile_id
  WHERE r.id = p_report_id AND p.user_id = p_user_id
    AND r.platform_alerted_at IS NULL AND r.created_at > now() - interval '15 minutes'
  FOR UPDATE OF r;
  IF v_report.id IS NULL THEN RETURN '{}'; END IF;
  UPDATE public.chat_reports SET platform_alerted_at = now() WHERE id = v_report.id;
  SELECT coalesce(array_agg(DISTINCT p.id), '{}') INTO v_targets
  FROM public.platform_admins pa JOIN public.profiles p ON p.user_id = pa.user_id
  WHERE p.id IS DISTINCT FROM v_report.reported_profile_id AND p.id IS DISTINCT FROM v_report.reporter_profile_id;
  RETURN v_targets;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_chat_reports(
  p_team_id uuid DEFAULT NULL, p_status text DEFAULT 'pendentes', p_search text DEFAULT '',
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_platform boolean := public.is_platform_admin();
  v_profile uuid := public.get_my_profile_id();
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre para continuar.' USING ERRCODE = '42501'; END IF;
  -- Sem equipe = fila de todas as equipes: só a plataforma.
  IF p_team_id IS NULL AND NOT v_platform THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador da plataforma.' USING ERRCODE = '42501';
  END IF;
  IF p_team_id IS NOT NULL AND NOT v_platform AND NOT public.has_team_role(auth.uid(), p_team_id, 'admin') THEN
    RAISE EXCEPTION 'Somente a liderança da equipe pode ver as denúncias.' USING ERRCODE = '42501';
  END IF;
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
     OR length(v_search) > 200 OR coalesce(p_status, '') NOT IN ('', 'pendentes', 'aberta', 'em_analise', 'resolvida', 'descartada') THEN
    RAISE EXCEPTION 'Filtros inválidos.' USING ERRCODE = '22023';
  END IF;
  WITH visible AS (
    SELECT r.* FROM public.chat_reports r
    WHERE (p_team_id IS NULL OR r.team_id = p_team_id)
      AND (v_platform OR (NOT r.platform_only AND r.reported_profile_id IS DISTINCT FROM v_profile))
  ), filtered AS (
    SELECT r.id, r.team_id, team.name AS team_name, r.message_id, (r.message_id IS NOT NULL) AS message_exists,
      r.message_type, r.message_content, r.message_attachment_path, r.message_created_at,
      r.message_deleted_at, r.message_deleted_role, r.member_removed_at,
      r.reason, r.details, r.status, r.platform_only, r.created_at, r.updated_at, r.resolved_at, r.resolution_note,
      r.reporter_profile_id, reporter.full_name AS reporter_name,
      r.reported_profile_id, reported.full_name AS reported_name, reported.avatar_url AS reported_avatar_url,
      EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = r.team_id AND tm.profile_id = r.reported_profile_id) AS reported_is_member,
      (team.owner_id = r.reported_profile_id) AS reported_is_owner,
      -- Líder hoje: só a liderança da equipe o remove (a plataforma suspende).
      EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = r.team_id AND tm.profile_id = r.reported_profile_id
              AND tm.role = 'admin') AS reported_is_leader,
      -- Conta suspensa pela plataforma (só a plataforma vê).
      (v_platform AND EXISTS (SELECT 1 FROM public.platform_account_suspensions s
                              WHERE s.profile_id = r.reported_profile_id)) AS reported_suspended,
      resolver.full_name AS resolved_by_name,
      (r.status IN ('aberta', 'em_analise') AND r.created_at < now() - interval '24 hours') AS overdue
    FROM visible r
    JOIN public.teams team ON team.id = r.team_id
    LEFT JOIN public.profiles reporter ON reporter.id = r.reporter_profile_id
    LEFT JOIN public.profiles reported ON reported.id = r.reported_profile_id
    LEFT JOIN public.profiles resolver ON resolver.id = r.resolved_by
    WHERE (coalesce(p_status, '') = '' OR (p_status = 'pendentes' AND r.status IN ('aberta', 'em_analise')) OR r.status = p_status)
      AND (v_search = '' OR strpos(lower(team.name || ' ' || coalesce(reporter.full_name, '') || ' ' ||
        coalesce(reported.full_name, '') || ' ' || coalesce(r.message_content, '')), v_search) > 0)
  ), paged AS (
    SELECT * FROM filtered ORDER BY (status IN ('aberta', 'em_analise')) DESC, created_at DESC, id DESC
    LIMIT p_page_size OFFSET (p_page - 1) * p_page_size
  )
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY (paged.status IN ('aberta', 'em_analise')) DESC,
      paged.created_at DESC, paged.id DESC) FROM paged), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered), 'page', p_page, 'page_size', p_page_size,
    'pending_total', (SELECT count(*) FROM visible WHERE status IN ('aberta', 'em_analise')),
    'overdue_total', (SELECT count(*) FROM visible WHERE status IN ('aberta', 'em_analise') AND created_at < now() - interval '24 hours')
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Em análise / resolver (com nota e, opcionalmente, removendo o autor da equipe)
-- / descartar. Devolve attachment_to_remove quando o anexo de uma mensagem já
-- apagada não é mais prova de nenhuma denúncia em aberto: o app apaga o arquivo.
CREATE OR REPLACE FUNCTION public.moderate_chat_report(
  p_report_id uuid, p_status text, p_note text DEFAULT NULL, p_remove_member boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_report public.chat_reports;
  v_profile uuid := public.get_my_profile_id();
  v_platform boolean := public.is_platform_admin();
  v_note text := nullif(btrim(p_note), '');
  v_previous text;
  v_removed boolean := false;
  v_cleanup text;
  v_closing boolean;
BEGIN
  SELECT * INTO v_report FROM public.chat_reports WHERE id = p_report_id FOR UPDATE;
  IF v_report.id IS NULL OR v_profile IS NULL
     OR NOT public.chat_can_moderate(v_report.team_id, v_report.reported_profile_id, v_report.platform_only) THEN
    RAISE EXCEPTION 'Denúncia não encontrada ou sem permissão de acesso.' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('em_analise', 'resolvida', 'descartada') THEN
    RAISE EXCEPTION 'Escolha uma ação válida para a denúncia.' USING ERRCODE = '22023';
  END IF;
  IF length(v_note) > 1000 THEN
    RAISE EXCEPTION 'A anotação pode ter até 1.000 caracteres.' USING ERRCODE = '22023';
  END IF;
  v_previous := v_report.status;
  v_closing := p_status IN ('resolvida', 'descartada');

  IF coalesce(p_remove_member, false) THEN
    IF p_status <> 'resolvida' THEN
      RAISE EXCEPTION 'Remova o autor da equipe ao resolver a denúncia.' USING ERRCODE = '22023';
    ELSIF v_report.reported_profile_id IS NULL THEN
      RAISE EXCEPTION 'A conta de quem enviou a mensagem não existe mais.' USING ERRCODE = '22023';
    ELSIF v_report.reported_profile_id = v_profile THEN
      RAISE EXCEPTION 'Você não pode remover a si mesmo por aqui.' USING ERRCODE = '22023';
    ELSIF EXISTS (SELECT 1 FROM public.teams WHERE id = v_report.team_id AND owner_id = v_report.reported_profile_id) THEN
      RAISE EXCEPTION 'Quem enviou a mensagem é o responsável pela equipe e não pode ser removido por aqui.' USING ERRCODE = '22023';
    -- guard_team_member_privileges (20261003120000): só um líder da própria equipe
    -- remove outro líder. A plataforma (sem ser líder ali) afasta pela suspensão.
    ELSIF EXISTS (SELECT 1 FROM public.team_members WHERE team_id = v_report.team_id
                    AND profile_id = v_report.reported_profile_id AND role = 'admin')
          AND NOT public.has_team_role(auth.uid(), v_report.team_id, 'admin') THEN
      RAISE EXCEPTION 'Quem enviou a mensagem é líder da equipe, e só outro líder da equipe pode removê-lo. Para afastar a pessoa, suspenda a conta.'
        USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.team_members WHERE team_id = v_report.team_id AND profile_id = v_report.reported_profile_id;
    v_removed := FOUND;
  END IF;

  UPDATE public.chat_reports SET
    status = p_status,
    updated_at = now(),
    resolved_at = CASE WHEN v_closing THEN now() ELSE NULL END,
    resolved_by = CASE WHEN v_closing THEN v_profile ELSE NULL END,
    resolution_note = coalesce(v_note, resolution_note),
    member_removed_at = CASE WHEN v_removed THEN now() ELSE member_removed_at END
  WHERE id = v_report.id
  RETURNING * INTO v_report;

  -- Só arquivo da pasta da própria equipe (o caminho veio da mensagem, gravada pelo cliente).
  IF v_closing AND v_report.message_id IS NULL AND v_report.message_attachment_path IS NOT NULL
     AND starts_with(v_report.message_attachment_path, v_report.team_id::text || '/')
     AND NOT EXISTS (SELECT 1 FROM public.chat_reports r WHERE r.message_attachment_path = v_report.message_attachment_path
                       AND r.status IN ('aberta', 'em_analise'))
     AND NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.attachment_path = v_report.message_attachment_path) THEN
    v_cleanup := v_report.message_attachment_path;
  END IF;

  -- Retorno a quem denunciou, uma vez, sem detalhes da decisão.
  IF v_closing AND v_previous NOT IN ('resolvida', 'descartada') AND v_report.reporter_profile_id IS NOT NULL THEN
    INSERT INTO public.notifications(profile_id, type, title, body, link, team_id)
    VALUES (v_report.reporter_profile_id, 'chat_report_update', 'Sua denúncia foi analisada',
      'Obrigado por ajudar a manter o chat da equipe seguro.', '/app/chat', v_report.team_id);
  END IF;

  IF v_platform AND NOT public.has_team_role(auth.uid(), v_report.team_id, 'admin') THEN
    INSERT INTO public.platform_audit_log(actor_user_id, action, entity_id, details)
    VALUES (auth.uid(), 'chat_report_update', v_report.id::text, jsonb_build_object(
      'team_id', v_report.team_id, 'previous_status', v_previous, 'status', p_status, 'member_removed', v_removed));
  END IF;

  RETURN to_jsonb(v_report) || jsonb_build_object('attachment_to_remove', v_cleanup, 'member_removed', v_removed);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Bloqueios
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_profile_id, blocked_profile_id),
  CONSTRAINT user_blocks_not_self CHECK (blocker_profile_id <> blocked_profile_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks(blocked_profile_id);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;
DROP POLICY IF EXISTS "Blocks: only the blocker" ON public.user_blocks;
CREATE POLICY "Blocks: only the blocker" ON public.user_blocks
  FOR SELECT TO authenticated USING (blocker_profile_id = (SELECT public.get_my_profile_id()));

CREATE OR REPLACE FUNCTION public.block_user(p_profile_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile uuid := public.get_my_profile_id();
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN RAISE EXCEPTION 'Entre para continuar.' USING ERRCODE = '42501'; END IF;
  IF p_profile_id IS NULL OR p_profile_id = v_profile THEN
    RAISE EXCEPTION 'Você não pode bloquear a si mesmo.' USING ERRCODE = '22023';
  END IF;
  -- Só quem a pessoa encontra no chat: alguém de uma equipe em comum.
  IF NOT EXISTS (SELECT 1 FROM public.team_members a JOIN public.team_members b ON b.team_id = a.team_id
                 WHERE a.profile_id = v_profile AND b.profile_id = p_profile_id) THEN
    RAISE EXCEPTION 'Só é possível bloquear pessoas das suas equipes.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.user_blocks(blocker_profile_id, blocked_profile_id) VALUES (v_profile, p_profile_id)
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('blocked', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_user(p_profile_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile uuid := public.get_my_profile_id();
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN RAISE EXCEPTION 'Entre para continuar.' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.user_blocks WHERE blocker_profile_id = v_profile AND blocked_profile_id = p_profile_id;
  RETURN jsonb_build_object('unblocked', FOUND);
END;
$$;

-- Com nome e foto mesmo de quem já saiu das equipes em comum (para poder desbloquear).
CREATE OR REPLACE FUNCTION public.list_blocked_users() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile uuid := public.get_my_profile_id();
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN RAISE EXCEPTION 'Entre para continuar.' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('profile_id', b.blocked_profile_id, 'full_name', p.full_name,
      'avatar_url', p.avatar_url, 'created_at', b.created_at) ORDER BY b.created_at DESC)
    FROM public.user_blocks b JOIN public.profiles p ON p.id = b.blocked_profile_id
    WHERE b.blocker_profile_id = v_profile
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Apagar mensagens e anexos
-- ---------------------------------------------------------------------------

-- Registra na denúncia que a mensagem foi apagada (e por qual papel), venha a
-- exclusão da RPC, da policy antiga do autor ou de uma cascata.
CREATE OR REPLACE FUNCTION public.chat_track_reported_message_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile uuid := public.get_my_profile_id();
BEGIN
  UPDATE public.chat_reports SET
    message_deleted_at = now(),
    message_deleted_role = CASE
      WHEN v_profile IS NOT NULL AND v_profile = OLD.sender_profile_id THEN 'autor'
      WHEN public.has_team_role(auth.uid(), OLD.team_id, 'admin') THEN 'lideranca'
      WHEN public.is_platform_admin() THEN 'plataforma'
      ELSE 'sistema' END,
    updated_at = now()
  WHERE message_id = OLD.id AND message_deleted_at IS NULL;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS chat_track_reported_message_delete ON public.messages;
CREATE TRIGGER chat_track_reported_message_delete BEFORE DELETE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_track_reported_message_delete();

-- Anexo = arquivo na pasta da equipe da mensagem (chat/<team_id>/<arquivo>),
-- usado por uma mensagem só. attachment_path vem do cliente: sem esta checagem,
-- qualquer membro gravaria uma mensagem apontando para o arquivo de um colega
-- (ou de outra equipe), e esse arquivo seria apagado como se fosse dele — ao
-- excluir a conta, ao apagar a mensagem — ou ficaria preso como "prova".
CREATE INDEX IF NOT EXISTS messages_attachment_path_idx ON public.messages(attachment_path)
  WHERE attachment_path IS NOT NULL;

CREATE OR REPLACE FUNCTION public.chat_guard_attachment_path() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.attachment_path IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.attachment_path IS NOT DISTINCT FROM OLD.attachment_path
         AND NEW.team_id IS NOT DISTINCT FROM OLD.team_id) THEN
    RETURN NEW;
  END IF;
  IF NOT starts_with(NEW.attachment_path, NEW.team_id::text || '/') OR length(NEW.attachment_path) > 1024 THEN
    RAISE EXCEPTION 'O anexo precisa estar na pasta da equipe da mensagem.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.messages m WHERE m.attachment_path = NEW.attachment_path AND m.id <> NEW.id) THEN
    RAISE EXCEPTION 'Este anexo já pertence a outra mensagem.' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_guard_attachment_path ON public.messages;
CREATE TRIGGER chat_guard_attachment_path BEFORE INSERT OR UPDATE OF attachment_path, team_id ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_guard_attachment_path();

-- Funções das policies do Storage, no schema private: o PostgREST só expõe
-- public (e storage/graphql_public), então ninguém as chama como RPC — por
-- exemplo, para descobrir se existe denúncia sobre um arquivo. As policies
-- rodam como o usuário: authenticated precisa de USAGE e EXECUTE.
-- Versões anteriores deste arquivo as criavam em public: as policies que
-- dependem delas saem antes (e voltam logo abaixo).
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

DROP POLICY IF EXISTS "Team leaders can delete chat media" ON storage.objects;
DROP POLICY IF EXISTS "Platform admins can view reported chat media" ON storage.objects;
DROP POLICY IF EXISTS "Platform admins can delete reported chat media" ON storage.objects;
DROP POLICY IF EXISTS "Chat media under open report cannot be deleted" ON storage.objects;
DROP POLICY IF EXISTS "Chat media under open report cannot be changed" ON storage.objects;
DROP FUNCTION IF EXISTS public.chat_media_team_id(text);
DROP FUNCTION IF EXISTS public.chat_media_is_reported(text);
DROP FUNCTION IF EXISTS public.chat_media_has_open_report(text);

-- Pasta do anexo = id da equipe (chat/<team_id>/<arquivo>). Nulo se não for um uuid,
-- em vez de derrubar a consulta com erro de conversão.
CREATE OR REPLACE FUNCTION private.chat_media_team_id(p_name text) RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT CASE WHEN split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(p_name, '/', 1)::uuid END
$$;

-- A plataforma só enxerga anexos que viraram prova de alguma denúncia (da
-- equipe dona da pasta: caminho de outra equipe numa mensagem não conta).
CREATE OR REPLACE FUNCTION private.chat_media_is_reported(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_platform_admin() AND EXISTS (
    SELECT 1 FROM public.chat_reports r
    WHERE r.message_attachment_path = p_name AND split_part(p_name, '/', 1) = r.team_id::text
  )
$$;

-- Anexo que é prova de denúncia em aberto (aberta ou em análise).
CREATE OR REPLACE FUNCTION private.chat_media_has_open_report(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_reports r
    WHERE r.message_attachment_path = p_name AND r.status IN ('aberta', 'em_analise')
      AND split_part(p_name, '/', 1) = r.team_id::text
  )
$$;

REVOKE ALL ON FUNCTION private.chat_media_team_id(text), private.chat_media_is_reported(text),
  private.chat_media_has_open_report(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.chat_media_team_id(text), private.chat_media_is_reported(text),
  private.chat_media_has_open_report(text) TO authenticated, service_role;

-- O autor apaga as suas; a liderança apaga qualquer uma da equipe; a plataforma
-- apaga qualquer uma. O arquivo fica no Storage (keep_attachment) quando é prova
-- de denúncia em aberto (sai quando a moderação fechar), quando outra mensagem
-- ainda aponta para ele ou quando não está na pasta da equipe da mensagem.
-- Quem é denunciado nunca fica sabendo: para quem apaga a própria mensagem, o
-- arquivo que fica volta sem caminho (o app não tenta apagá-lo), igual a uma
-- mensagem sem anexo; keep_attachment só vai para a moderação.
CREATE OR REPLACE FUNCTION public.delete_chat_message(p_message_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile uuid := public.get_my_profile_id();
  v_msg public.messages;
  v_leader boolean;
  v_moderating boolean;
  v_keep boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN RAISE EXCEPTION 'Entre para continuar.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_msg FROM public.messages WHERE id = p_message_id FOR UPDATE;
  v_leader := v_msg.id IS NOT NULL AND public.has_team_role(auth.uid(), v_msg.team_id, 'admin');
  IF v_msg.id IS NULL OR NOT (v_msg.sender_profile_id = v_profile OR v_leader OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Mensagem não encontrada ou sem permissão para apagar.' USING ERRCODE = '42501';
  END IF;
  -- Apagando a mensagem de outra pessoa, como liderança ou plataforma.
  v_moderating := v_msg.sender_profile_id <> v_profile;
  DELETE FROM public.messages WHERE id = v_msg.id;
  IF v_msg.attachment_path IS NOT NULL THEN
    v_keep := NOT starts_with(v_msg.attachment_path, v_msg.team_id::text || '/')
      OR EXISTS (SELECT 1 FROM public.messages m WHERE m.attachment_path = v_msg.attachment_path)
      OR private.chat_media_has_open_report(v_msg.attachment_path);
  END IF;
  IF v_moderating AND NOT v_leader THEN
    INSERT INTO public.platform_audit_log(actor_user_id, action, entity_id, details)
    VALUES (auth.uid(), 'chat_message_delete', v_msg.id::text, jsonb_build_object('team_id', v_msg.team_id));
  END IF;
  RETURN jsonb_build_object('deleted', true,
    'attachment_path', CASE WHEN v_keep AND NOT v_moderating THEN NULL ELSE v_msg.attachment_path END,
    'keep_attachment', v_keep AND v_moderating);
END;
$$;

-- Storage: o autor já apaga os próprios arquivos ("Authenticated can delete own
-- chat media"). Agora a liderança apaga os da pasta da equipe e a plataforma vê e
-- apaga os anexos denunciados.
CREATE POLICY "Team leaders can delete chat media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat' AND public.has_team_role(auth.uid(), private.chat_media_team_id(name), 'admin'));
CREATE POLICY "Platform admins can view reported chat media" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat' AND private.chat_media_is_reported(name));
CREATE POLICY "Platform admins can delete reported chat media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat' AND private.chat_media_is_reported(name));
-- Prova não some: enquanto a denúncia estiver em aberto, ninguém apaga nem move
-- o anexo direto pelo Storage — nem o autor, nem a liderança, nem a plataforma.
-- RESTRICTIVE: vale por cima das policies acima (e das antigas do autor).
CREATE POLICY "Chat media under open report cannot be deleted" ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id IS DISTINCT FROM 'chat' OR NOT private.chat_media_has_open_report(name));
CREATE POLICY "Chat media under open report cannot be changed" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id IS DISTINCT FROM 'chat' OR NOT private.chat_media_has_open_report(name));

-- ---------------------------------------------------------------------------
-- 5. Suspensão de contas pela plataforma
-- ---------------------------------------------------------------------------

-- Os Termos preveem suspender a conta de quem abusa (App Store 1.2: remover o
-- conteúdo e afastar quem o publicou), inclusive o dono de uma equipe, que a
-- moderação não remove. Quem suspende é a edge function platform-suspend-account:
-- confere que quem chama administra a plataforma, bane o usuário no GoTrue (não
-- entra nem renova a sessão) e grava aqui. Reativar desfaz o banimento e apaga a
-- linha; o histórico fica em platform_audit_log. A propriedade das equipes de
-- quem foi suspenso passa para outro membro com platform_transfer_team_ownership,
-- pela mesma edge function. Quem era dono continua líder da equipe: só a
-- liderança da equipe o remove (guard_team_member_privileges, 20261003120000).
CREATE TABLE IF NOT EXISTS public.platform_account_suspensions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  report_id uuid REFERENCES public.chat_reports(id) ON DELETE SET NULL,
  suspended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  suspended_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_account_suspensions_profile_idx ON public.platform_account_suspensions(profile_id);
CREATE INDEX IF NOT EXISTS platform_account_suspensions_report_idx ON public.platform_account_suspensions(report_id);
CREATE INDEX IF NOT EXISTS platform_account_suspensions_by_idx ON public.platform_account_suspensions(suspended_by);
ALTER TABLE public.platform_account_suspensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_account_suspensions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_account_suspensions TO service_role;

-- Quem a plataforma pode suspender: uma conta que existe, que não é a de quem
-- pede nem a de outro administrador da plataforma. p_actor_user_id vem do JWT
-- (a edge function) e é conferido de novo aqui. Devolve as equipes de que a
-- pessoa é dona, para transferir a propriedade depois.
CREATE OR REPLACE FUNCTION public.platform_account_suspension_target(p_actor_user_id uuid, p_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid; v_name text;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = p_actor_user_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador da plataforma.' USING ERRCODE = '42501';
  END IF;
  SELECT user_id, full_name INTO v_user, v_name FROM public.profiles WHERE id = p_profile_id;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = 'P0002';
  ELSIF v_user = p_actor_user_id THEN
    RAISE EXCEPTION 'Você não pode suspender a própria conta.' USING ERRCODE = '22023';
  ELSIF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'Contas de administradores da plataforma não são suspensas por aqui.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('user_id', v_user, 'profile_id', p_profile_id, 'full_name', v_name,
    'suspended', EXISTS (SELECT 1 FROM public.platform_account_suspensions WHERE user_id = v_user),
    'owned_teams', coalesce((
      SELECT jsonb_agg(jsonb_build_object('team_id', t.id, 'team_name', t.name, 'other_members',
          (SELECT count(*) FROM public.team_members m WHERE m.team_id = t.id AND m.profile_id <> p_profile_id))
        ORDER BY lower(t.name), t.id)
      FROM public.teams t WHERE t.owner_id = p_profile_id), '[]'::jsonb));
END;
$$;

-- Grava a suspensão (ou a reativação) depois que o GoTrue confirmou o banimento.
-- Ao suspender, encerra também as sessões guardadas quando o banco permite (o
-- token de acesso já emitido vale até expirar, no máximo uma hora).
CREATE OR REPLACE FUNCTION public.platform_record_account_suspension(
  p_actor_user_id uuid, p_profile_id uuid, p_suspended boolean, p_reason text DEFAULT NULL, p_report_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_target jsonb := public.platform_account_suspension_target(p_actor_user_id, p_profile_id);
  v_user uuid := (v_target->>'user_id')::uuid;
  v_reason text := nullif(btrim(p_reason), '');
  v_sessions boolean := false;
BEGIN
  IF p_suspended IS NULL THEN RAISE EXCEPTION 'Escolha suspender ou reativar.' USING ERRCODE = '22023'; END IF;
  IF length(v_reason) > 500 THEN RAISE EXCEPTION 'O motivo pode ter até 500 caracteres.' USING ERRCODE = '22023'; END IF;
  IF p_suspended THEN
    INSERT INTO public.platform_account_suspensions(user_id, profile_id, reason, report_id, suspended_by)
    VALUES (v_user, p_profile_id, v_reason, (SELECT r.id FROM public.chat_reports r WHERE r.id = p_report_id), p_actor_user_id)
    ON CONFLICT (user_id) DO UPDATE SET reason = coalesce(EXCLUDED.reason, platform_account_suspensions.reason),
      report_id = coalesce(EXCLUDED.report_id, platform_account_suspensions.report_id);
    BEGIN
      EXECUTE 'DELETE FROM auth.sessions WHERE user_id = $1' USING v_user;
      EXECUTE 'DELETE FROM auth.refresh_tokens WHERE user_id = $1' USING v_user::text;
      v_sessions := true;
    EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_column THEN
      RAISE WARNING 'Sessões do usuário % não encerradas pelo banco: %', v_user, SQLERRM;
    END;
  ELSE
    DELETE FROM public.platform_account_suspensions WHERE user_id = v_user;
  END IF;
  INSERT INTO public.platform_audit_log(actor_user_id, action, entity_id, details)
  VALUES (p_actor_user_id, CASE WHEN p_suspended THEN 'account_suspend' ELSE 'account_reactivate' END, v_user::text,
    jsonb_build_object('profile_id', p_profile_id, 'report_id', p_report_id, 'sessions_revoked', v_sessions));
  RETURN jsonb_build_object('suspended', p_suspended, 'sessions_revoked', v_sessions, 'owned_teams', v_target->'owned_teams');
END;
$$;

-- A plataforma passa a propriedade de uma equipe para outro membro (ex.: o dono
-- foi suspenso). O novo dono vira líder, como em transfer_team_ownership.
-- Só a edge function platform-suspend-account (service_role) chama, com o
-- usuário do JWT em p_actor_user_id, conferido de novo aqui: com o JWT de quem
-- administra a plataforma (sem ser líder da equipe), os guardas de 20261003120000
-- recusariam a promoção a líder e a troca de teams.owner_id. O registro no log e
-- o aviso ao novo dono vêm do gatilho teams_owner_change_effects (20261003130000),
-- com a origem e quem agiu nas configurações locais da transação.
-- Assinatura antiga (p_team_id, p_new_owner_member_id), nunca publicada: sai.
DROP FUNCTION IF EXISTS public.platform_transfer_team_ownership(uuid, uuid);
CREATE OR REPLACE FUNCTION public.platform_transfer_team_ownership(
  p_actor_user_id uuid, p_team_id uuid, p_new_owner_member_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_team public.teams; v_member public.team_members;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = p_actor_user_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador da plataforma.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF v_team.id IS NULL THEN RAISE EXCEPTION 'Equipe não encontrada.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_member FROM public.team_members WHERE id = p_new_owner_member_id AND team_id = p_team_id FOR UPDATE;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'A pessoa escolhida não faz parte desta equipe.' USING ERRCODE = '22023';
  ELSIF v_member.profile_id = v_team.owner_id THEN
    RAISE EXCEPTION 'Essa pessoa já é a dona da equipe.' USING ERRCODE = '22023';
  ELSIF EXISTS (SELECT 1 FROM public.platform_account_suspensions s WHERE s.profile_id = v_member.profile_id) THEN
    RAISE EXCEPTION 'Essa conta está suspensa. Escolha outra pessoa.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.ownership_change_source', 'platform', true);
  PERFORM set_config('app.ownership_change_actor', p_actor_user_id::text, true);
  UPDATE public.team_members SET role = 'admin', permissions = '{}'::jsonb WHERE id = v_member.id;
  UPDATE public.teams SET owner_id = v_member.profile_id WHERE id = p_team_id;
  PERFORM set_config('app.ownership_change_source', '', true);
  PERFORM set_config('app.ownership_change_actor', '', true);

  RETURN jsonb_build_object('team_id', p_team_id, 'owner_profile_id', v_member.profile_id);
END;
$$;

-- Situação das contas dos membros de uma equipe (tela da conta no painel).
CREATE OR REPLACE FUNCTION public.platform_team_member_suspensions(p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.platform_require_admin();
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('member_id', m.id, 'profile_id', m.profile_id,
        'suspended', s.user_id IS NOT NULL, 'suspended_at', s.suspended_at, 'reason', s.reason) ORDER BY m.created_at, m.id)
    FROM public.team_members m LEFT JOIN public.platform_account_suspensions s ON s.profile_id = m.profile_id
    WHERE m.team_id = p_team_id), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissões das funções (os default privileges do Supabase dão EXECUTE a todos)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.chat_fold_text(text), public.chat_term_key(text), public.chat_mask_text(text),
  public.chat_filter_message(), public.notifications_filter_text(), public.chat_track_reported_message_delete(),
  public.chat_guard_attachment_path(),
  public.chat_can_moderate(uuid, uuid, boolean), public.chat_report_reason_label(text),
  public.report_chat_message(uuid, text, text), public.list_chat_reports(uuid, text, text, integer, integer),
  public.moderate_chat_report(uuid, text, text, boolean), public.delete_chat_message(uuid),
  public.chat_report_platform_push_targets(uuid, uuid),
  public.block_user(uuid), public.unblock_user(uuid), public.list_blocked_users(),
  public.platform_account_suspension_target(uuid, uuid),
  public.platform_record_account_suspension(uuid, uuid, boolean, text, uuid),
  public.platform_transfer_team_ownership(uuid, uuid, uuid), public.platform_team_member_suspensions(uuid)
  FROM PUBLIC, anon, authenticated;
-- (As funções das policies do Storage estão no schema private, com as permissões acima.)
GRANT EXECUTE ON FUNCTION
  public.report_chat_message(uuid, text, text), public.list_chat_reports(uuid, text, text, integer, integer),
  public.moderate_chat_report(uuid, text, text, boolean), public.delete_chat_message(uuid),
  public.block_user(uuid), public.unblock_user(uuid), public.list_blocked_users(),
  public.platform_team_member_suspensions(uuid)
  TO authenticated;
-- Só a edge function (service_role) chama estas: send-push e platform-suspend-account.
GRANT EXECUTE ON FUNCTION
  public.chat_fold_text(text), public.chat_term_key(text), public.chat_mask_text(text),
  public.chat_report_platform_push_targets(uuid, uuid),
  public.platform_account_suspension_target(uuid, uuid),
  public.platform_record_account_suspension(uuid, uuid, boolean, text, uuid),
  public.platform_transfer_team_ownership(uuid, uuid, uuid)
  TO service_role;

RESET lock_timeout;

NOTIFY pgrst, 'reload schema';
