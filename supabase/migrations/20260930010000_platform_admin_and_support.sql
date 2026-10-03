-- Platform administration is separate from team leadership. No client can
-- grant itself platform access, write billing records or impersonate support.
CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_admins TO authenticated;
CREATE POLICY "Read own platform access" ON public.platform_admins
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE FUNCTION public.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
$$;

CREATE FUNCTION public.platform_require_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador da plataforma.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  support_enabled boolean NOT NULL DEFAULT true,
  support_email text NOT NULL DEFAULT '' CHECK (length(support_email) <= 254 AND
    (support_email = '' OR support_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  announcement text NOT NULL DEFAULT '' CHECK (length(announcement) <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
INSERT INTO public.platform_settings(id) VALUES (true);

CREATE TABLE public.account_subscriptions (
  team_id uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'custom')),
  status text NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'trialing', 'active', 'past_due', 'canceled', 'expired')),
  provider text NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'app_store', 'google_play', 'stripe', 'abacatepay')),
  monthly_amount numeric(10,2) CHECK (monthly_amount >= 0),
  current_period_end timestamptz,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT subscription_plan_status CHECK ((plan = 'free' AND status = 'free') OR
    (plan <> 'free' AND status <> 'free'))
);

CREATE TABLE public.platform_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_audit_created_idx ON public.platform_audit_log(created_at DESC);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_settings, public.account_subscriptions, public.platform_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_settings, public.account_subscriptions, public.platform_audit_log TO authenticated;
CREATE POLICY "Platform settings read" ON public.platform_settings FOR SELECT TO authenticated USING ((SELECT public.is_platform_admin()));
CREATE POLICY "Platform subscriptions read" ON public.account_subscriptions FOR SELECT TO authenticated USING ((SELECT public.is_platform_admin()));
CREATE POLICY "Platform audit read" ON public.platform_audit_log FOR SELECT TO authenticated USING ((SELECT public.is_platform_admin()));

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  requester_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('bug', 'improvement')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 5 AND 160),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 20 AND 8000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'planned', 'in_progress', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  last_admin_response_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_requester_idx ON public.support_tickets(requester_profile_id, updated_at DESC);
CREATE INDEX support_tickets_queue_idx ON public.support_tickets(status, updated_at DESC);
CREATE INDEX support_tickets_team_idx ON public.support_tickets(team_id);
CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_staff boolean NOT NULL DEFAULT false,
  message text NOT NULL CHECK (length(btrim(message)) BETWEEN 2 AND 8000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_ticket_messages_thread_idx ON public.support_ticket_messages(ticket_id, created_at, id);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_tickets, public.support_ticket_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.support_tickets_ticket_number_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.support_tickets, public.support_ticket_messages TO authenticated;
CREATE POLICY "Read own tickets or platform queue" ON public.support_tickets FOR SELECT TO authenticated
  USING (requester_profile_id = (SELECT public.get_my_profile_id()) OR (SELECT public.is_platform_admin()));
CREATE POLICY "Read authorized ticket messages" ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id));

CREATE FUNCTION public.get_support_settings() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre para continuar.' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object('support_enabled', support_enabled,
    'support_email', support_email, 'announcement', announcement) FROM public.platform_settings WHERE id);
END;
$$;

CREATE FUNCTION public.create_support_ticket(p_title text, p_description text, p_category text, p_team_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile uuid; v_id uuid;
BEGIN
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_profile IS NULL THEN RAISE EXCEPTION 'Entre para enviar um ticket.' USING ERRCODE = '42501'; END IF;
  IF NOT (SELECT support_enabled FROM public.platform_settings WHERE id) THEN
    RAISE EXCEPTION 'Novos tickets estão temporariamente pausados.' USING ERRCODE = 'P0001';
  END IF;
  IF p_team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = p_team_id AND profile_id = v_profile) THEN
    RAISE EXCEPTION 'Escolha uma equipe da qual você participa.' USING ERRCODE = '42501';
  END IF;
  -- Serialize submissions per user so concurrent requests cannot bypass the limit.
  PERFORM pg_advisory_xact_lock(hashtextextended('support-create:' || v_profile::text, 0));
  IF (SELECT count(*) FROM public.support_tickets WHERE requester_profile_id = v_profile AND created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'Você enviou muitos tickets. Tente novamente em uma hora.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.support_tickets(requester_profile_id, team_id, category, title, description)
  VALUES (v_profile, p_team_id, p_category, btrim(p_title), btrim(p_description)) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.list_support_tickets(
  p_admin boolean DEFAULT false, p_search text DEFAULT '', p_status text DEFAULT '',
  p_category text DEFAULT '', p_priority text DEFAULT '', p_page integer DEFAULT 1, p_page_size integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile uuid; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre para continuar.' USING ERRCODE = '42501'; END IF;
  IF p_admin THEN PERFORM public.platform_require_admin(); END IF;
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = auth.uid();
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR length(p_search) > 200 THEN
    RAISE EXCEPTION 'Filtros inválidos.' USING ERRCODE = '22023';
  END IF;
  WITH filtered AS (
    SELECT t.*, p.full_name AS requester_name, team.name AS team_name,
      CASE WHEN p_admin THEN u.email ELSE NULL END AS requester_email,
      (SELECT count(*) FROM public.support_ticket_messages m WHERE m.ticket_id = t.id) AS message_count,
      COALESCE((SELECT NOT m.is_staff FROM public.support_ticket_messages m WHERE m.ticket_id = t.id
        ORDER BY m.created_at DESC, m.id DESC LIMIT 1), true) AS waiting_for_staff
    FROM public.support_tickets t JOIN public.profiles p ON p.id = t.requester_profile_id
    LEFT JOIN auth.users u ON u.id = p.user_id LEFT JOIN public.teams team ON team.id = t.team_id
    WHERE (p_admin OR t.requester_profile_id = v_profile)
      AND (p_status = '' OR (p_status = 'unresolved' AND t.status NOT IN ('resolved', 'closed')) OR t.status = p_status)
      AND (p_category = '' OR t.category = p_category) AND (p_priority = '' OR t.priority = p_priority)
      AND (p_search = '' OR strpos(lower(t.title || ' ' || t.ticket_number::text || ' ' || COALESCE(team.name, '') ||
        CASE WHEN p_admin THEN ' ' || COALESCE(p.full_name, '') || ' ' || COALESCE(u.email, '') ELSE '' END), lower(btrim(p_search))) > 0)
  ), paged AS (SELECT * FROM filtered ORDER BY updated_at DESC, id DESC LIMIT p_page_size OFFSET (p_page - 1) * p_page_size)
  SELECT jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered), 'page', p_page, 'page_size', p_page_size) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.get_support_ticket(p_ticket_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ticket public.support_tickets; v_admin boolean := public.is_platform_admin(); v_profile uuid;
BEGIN
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = auth.uid();
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id;
  IF v_ticket.id IS NULL OR auth.uid() IS NULL OR (NOT v_admin AND v_ticket.requester_profile_id IS DISTINCT FROM v_profile) THEN
    RAISE EXCEPTION 'Ticket não encontrado ou sem permissão de acesso.' USING ERRCODE = '42501';
  END IF;
  RETURN to_jsonb(v_ticket) || jsonb_build_object(
    'requester_name', (SELECT full_name FROM public.profiles WHERE id = v_ticket.requester_profile_id),
    'requester_email', CASE WHEN v_admin THEN (SELECT u.email FROM auth.users u JOIN public.profiles p ON p.user_id = u.id WHERE p.id = v_ticket.requester_profile_id) ELSE NULL END,
    'team_name', (SELECT name FROM public.teams WHERE id = v_ticket.team_id),
    'messages', COALESCE((SELECT jsonb_agg(to_jsonb(thread) ORDER BY thread.created_at, thread.id) FROM (
      SELECT m.id, m.message, m.is_staff, m.created_at,
        CASE WHEN m.is_staff THEN 'Equipe +Louvor' ELSE COALESCE(p.full_name, 'Usuário') END AS author_name
      FROM public.support_ticket_messages m LEFT JOIN public.profiles p ON p.id = m.author_profile_id
      WHERE m.ticket_id = v_ticket.id
    ) thread), '[]'::jsonb)
  );
END;
$$;

CREATE FUNCTION public.reply_support_ticket(p_ticket_id uuid, p_message text DEFAULT NULL, p_status text DEFAULT NULL, p_priority text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ticket public.support_tickets; v_profile uuid; v_admin boolean := public.is_platform_admin();
  v_status text; v_message text := nullif(btrim(p_message), ''); v_label text; v_notified boolean := false;
BEGIN
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = auth.uid();
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF v_ticket.id IS NULL OR v_profile IS NULL OR (NOT v_admin AND v_ticket.requester_profile_id IS DISTINCT FROM v_profile) THEN
    RAISE EXCEPTION 'Ticket não encontrado ou sem permissão de acesso.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_admin AND (p_status IS NOT NULL OR p_priority IS NOT NULL) THEN
    RAISE EXCEPTION 'Somente o suporte pode alterar status e prioridade.' USING ERRCODE = '42501';
  END IF;
  IF v_message IS NULL AND (NOT v_admin OR (p_status IS NULL AND p_priority IS NULL)) THEN
    RAISE EXCEPTION 'Escreva uma mensagem antes de enviar.' USING ERRCODE = '22023';
  END IF;
  IF v_message IS NOT NULL AND length(v_message) NOT BETWEEN 2 AND 8000 THEN
    RAISE EXCEPTION 'A mensagem deve ter entre 2 e 8.000 caracteres.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('support-reply:' || v_profile::text, 0));
  IF v_message IS NOT NULL AND (SELECT count(*) FROM public.support_ticket_messages WHERE author_profile_id = v_profile AND created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'Limite de mensagens atingido. Tente novamente em uma hora.' USING ERRCODE = 'P0001';
  END IF;
  v_status := CASE WHEN NOT v_admin AND v_ticket.status IN ('resolved', 'closed') THEN 'open' ELSE COALESCE(p_status, v_ticket.status) END;
  IF v_message IS NOT NULL THEN
    INSERT INTO public.support_ticket_messages(ticket_id, author_profile_id, is_staff, message)
    VALUES (v_ticket.id, v_profile, v_admin, v_message);
  END IF;
  UPDATE public.support_tickets SET status = v_status, priority = COALESCE(p_priority, priority), updated_at = now(),
    last_admin_response_at = CASE WHEN v_admin AND v_message IS NOT NULL THEN now() ELSE last_admin_response_at END
  WHERE id = v_ticket.id;
  IF v_admin THEN
    INSERT INTO public.platform_audit_log(actor_user_id, action, entity_id, details)
    VALUES (auth.uid(), CASE WHEN v_message IS NOT NULL THEN 'ticket_reply' ELSE 'ticket_update' END, v_ticket.id::text,
      jsonb_build_object('ticket_number', v_ticket.ticket_number, 'previous_status', v_ticket.status, 'status', v_status, 'priority', COALESCE(p_priority, v_ticket.priority)));
    IF v_message IS NOT NULL OR v_status <> v_ticket.status THEN
      v_label := CASE v_status WHEN 'open' THEN 'Aberto' WHEN 'in_review' THEN 'Em análise' WHEN 'planned' THEN 'Planejado'
        WHEN 'in_progress' THEN 'Em andamento' WHEN 'resolved' THEN 'Resolvido' ELSE 'Encerrado' END;
      -- Feedback and its notification commit together. No staff identity or
      -- membership in the requester's team is required to deliver feedback.
      INSERT INTO public.notifications(profile_id, type, title, body, link, team_id)
      VALUES (v_ticket.requester_profile_id, 'support_feedback',
        CASE WHEN v_message IS NOT NULL THEN 'Resposta ao ticket #' ELSE 'Atualização do ticket #' END || v_ticket.ticket_number,
        CASE WHEN v_message IS NOT NULL THEN left(v_message, 300) ELSE v_ticket.title || ': ' || v_label END,
        '/app/sugestoes/' || v_ticket.id, NULL);
      v_notified := true;
    END IF;
  END IF;
  RETURN public.get_support_ticket(v_ticket.id) || jsonb_build_object('notified', v_notified);
END;
$$;

CREATE FUNCTION public.admin_list_accounts(p_search text DEFAULT '', p_plan text DEFAULT '', p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.platform_require_admin();
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR length(p_search) > 200 THEN
    RAISE EXCEPTION 'Filtros inválidos.' USING ERRCODE = '22023';
  END IF;
  WITH filtered AS (
    SELECT t.id, t.name, t.created_at, t.owner_id, p.full_name AS owner_name, u.email AS owner_email,
      COALESCE(s.plan, 'free') AS plan, COALESCE(s.status, 'free') AS subscription_status,
      (SELECT count(*) FROM public.team_members m WHERE m.team_id = t.id) AS member_count,
      (SELECT count(*) FROM public.songs x WHERE x.team_id = t.id) AS song_count,
      (SELECT count(*) FROM public.repertorios x WHERE x.team_id = t.id) AS repertorio_count,
      (SELECT count(*) FROM public.cultos x WHERE x.team_id = t.id) AS culto_count,
      (SELECT max(mu.last_sign_in_at) FROM public.team_members m JOIN public.profiles mp ON mp.id = m.profile_id JOIN auth.users mu ON mu.id = mp.user_id WHERE m.team_id = t.id) AS last_activity_at
    FROM public.teams t JOIN public.profiles p ON p.id = t.owner_id JOIN auth.users u ON u.id = p.user_id
    LEFT JOIN public.account_subscriptions s ON s.team_id = t.id
    WHERE (p_plan = '' OR COALESCE(s.plan, 'free') = p_plan)
      AND (p_search = '' OR strpos(lower(t.name || ' ' || COALESCE(p.full_name, '') || ' ' || COALESCE(u.email, '')), lower(btrim(p_search))) > 0)
  ), paged AS (SELECT * FROM filtered ORDER BY created_at DESC, id DESC LIMIT p_page_size OFFSET (p_page - 1) * p_page_size)
  SELECT jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered), 'page', p_page, 'page_size', p_page_size) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.admin_list_members(p_search text DEFAULT '', p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.platform_require_admin();
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR length(p_search) > 200 THEN
    RAISE EXCEPTION 'Filtros inválidos.' USING ERRCODE = '22023';
  END IF;
  WITH filtered AS (
    SELECT u.id AS user_id, p.id AS profile_id, p.full_name, p.avatar_url, u.email, u.created_at, u.last_sign_in_at,
      (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'role', m.role, 'instruments', m.instruments)
        ORDER BY t.name, t.id) FROM public.team_members m JOIN public.teams t ON t.id = m.team_id WHERE m.profile_id = p.id), '[]'::jsonb) AS teams
    FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE p_search = '' OR strpos(lower(COALESCE(p.full_name, '') || ' ' || COALESCE(u.email, '')), lower(btrim(p_search))) > 0
  ), paged AS (SELECT * FROM filtered ORDER BY created_at DESC, user_id DESC LIMIT p_page_size OFFSET (p_page - 1) * p_page_size)
  SELECT jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered), 'page', p_page, 'page_size', p_page_size) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.admin_get_account(p_team_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.platform_require_admin();
  SELECT to_jsonb(t) || jsonb_build_object('owner_name', p.full_name, 'owner_email', u.email,
    'subscription', COALESCE((SELECT to_jsonb(s) FROM public.account_subscriptions s WHERE s.team_id = t.id),
      jsonb_build_object('team_id', t.id, 'plan', 'free', 'status', 'free', 'provider', 'manual', 'monthly_amount', NULL, 'current_period_end', NULL, 'notes', '')),
    'song_count', (SELECT count(*) FROM public.songs WHERE team_id = t.id),
    'repertorio_count', (SELECT count(*) FROM public.repertorios WHERE team_id = t.id),
    'culto_count', (SELECT count(*) FROM public.cultos WHERE team_id = t.id),
    'pending_invites', (SELECT count(*) FROM public.team_invites WHERE team_id = t.id AND NOT accepted),
    'members', COALESCE((SELECT jsonb_agg(to_jsonb(member) ORDER BY member.created_at) FROM (
      SELECT m.id, m.role, m.instruments, m.created_at, mp.full_name, mu.email, mu.last_sign_in_at,
        (mu.email_confirmed_at IS NOT NULL) AS email_confirmed
      FROM public.team_members m JOIN public.profiles mp ON mp.id = m.profile_id JOIN auth.users mu ON mu.id = mp.user_id WHERE m.team_id = t.id
    ) member), '[]'::jsonb),
    'recent_repertorios', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT id, name, created_at FROM public.repertorios WHERE team_id = t.id ORDER BY created_at DESC, id DESC LIMIT 5) r), '[]'::jsonb),
    'recent_cultos', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM (SELECT id, name, date, created_at FROM public.cultos WHERE team_id = t.id ORDER BY date DESC, id DESC LIMIT 5) c), '[]'::jsonb),
    'tickets', COALESCE((SELECT jsonb_agg(to_jsonb(ticket)) FROM (SELECT id, ticket_number, title, status, category, updated_at FROM public.support_tickets WHERE team_id = t.id ORDER BY updated_at DESC, id DESC LIMIT 10) ticket), '[]'::jsonb)
  ) INTO v_result FROM public.teams t JOIN public.profiles p ON p.id = t.owner_id JOIN auth.users u ON u.id = p.user_id WHERE t.id = p_team_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = 'P0002'; END IF;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.admin_get_overview(p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_since timestamptz;
BEGIN
  PERFORM public.platform_require_admin();
  IF p_days IS NULL OR p_days NOT IN (7, 30, 90) THEN RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023'; END IF;
  v_since := date_trunc('day', now()) - make_interval(days => p_days - 1);
  RETURN jsonb_build_object(
    'total_accounts', (SELECT count(*) FROM public.teams), 'total_users', (SELECT count(*) FROM auth.users),
    'total_memberships', (SELECT count(*) FROM public.team_members), 'total_songs', (SELECT count(*) FROM public.songs),
    'total_repertorios', (SELECT count(*) FROM public.repertorios), 'total_cultos', (SELECT count(*) FROM public.cultos),
    'new_accounts', (SELECT count(*) FROM public.teams WHERE created_at >= v_since),
    'new_users', (SELECT count(*) FROM auth.users WHERE created_at >= v_since),
    'active_accounts', (SELECT count(DISTINCT m.team_id) FROM public.team_members m JOIN public.profiles p ON p.id = m.profile_id JOIN auth.users u ON u.id = p.user_id WHERE u.last_sign_in_at >= v_since),
    'open_tickets', (SELECT count(*) FROM public.support_tickets WHERE status NOT IN ('resolved', 'closed')),
    'waiting_tickets', (SELECT count(*) FROM public.support_tickets t WHERE status NOT IN ('resolved', 'closed') AND COALESCE(
      (SELECT NOT m.is_staff FROM public.support_ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1), true)),
    'active_subscriptions', (SELECT count(*) FROM public.account_subscriptions WHERE status = 'active'),
    'growth', (SELECT jsonb_agg(jsonb_build_object('date', d.day::date,
      'accounts', (SELECT count(*) FROM public.teams WHERE created_at >= d.day AND created_at < d.day + interval '1 day'),
      'users', (SELECT count(*) FROM auth.users WHERE created_at >= d.day AND created_at < d.day + interval '1 day')) ORDER BY d.day)
      FROM generate_series(v_since, date_trunc('day', now()), interval '1 day') AS d(day)),
    'recent_accounts', public.admin_list_accounts('', '', 1, 5)->'items',
    'recent_tickets', public.list_support_tickets(true, '', 'unresolved', '', '', 1, 5)->'items'
  );
END;
$$;

CREATE FUNCTION public.admin_update_subscription(p_team_id uuid, p_plan text, p_status text, p_monthly_amount numeric DEFAULT NULL,
  p_current_period_end timestamptz DEFAULT NULL, p_notes text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_previous jsonb; v_result jsonb;
BEGIN
  PERFORM public.platform_require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id) THEN RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('subscription:' || p_team_id::text, 0));
  SELECT to_jsonb(s) INTO v_previous FROM public.account_subscriptions s WHERE team_id = p_team_id;
  -- Provider integration is deliberately server-only. This portal records
  -- manual subscriptions; it does not claim to process a charge or entitlements.
  IF COALESCE(v_previous->>'provider', 'manual') <> 'manual' THEN
    RAISE EXCEPTION 'Esta assinatura é sincronizada pelo provedor e não pode ser alterada manualmente.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.account_subscriptions(team_id, plan, status, monthly_amount, current_period_end, notes, updated_by)
  VALUES (p_team_id, p_plan, p_status, p_monthly_amount, p_current_period_end, btrim(p_notes), auth.uid())
  ON CONFLICT (team_id) DO UPDATE SET plan = EXCLUDED.plan, status = EXCLUDED.status, monthly_amount = EXCLUDED.monthly_amount,
    current_period_end = EXCLUDED.current_period_end, notes = EXCLUDED.notes, updated_at = now(), updated_by = auth.uid();
  SELECT to_jsonb(s) INTO v_result FROM public.account_subscriptions s WHERE team_id = p_team_id;
  INSERT INTO public.platform_audit_log(actor_user_id, action, entity_id, details)
  VALUES (auth.uid(), 'subscription_update', p_team_id::text, jsonb_build_object('previous', v_previous - 'notes', 'current', v_result - 'notes'));
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.admin_list_subscriptions(p_search text DEFAULT '', p_status text DEFAULT '', p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.platform_require_admin();
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR length(p_search) > 200 THEN
    RAISE EXCEPTION 'Filtros inválidos.' USING ERRCODE = '22023';
  END IF;
  WITH filtered AS (
    SELECT s.*, t.name AS team_name, u.email AS owner_email FROM public.account_subscriptions s
    JOIN public.teams t ON t.id = s.team_id JOIN public.profiles p ON p.id = t.owner_id JOIN auth.users u ON u.id = p.user_id
    WHERE (p_status = '' OR s.status = p_status) AND (p_search = '' OR strpos(lower(t.name || ' ' || COALESCE(u.email, '')), lower(btrim(p_search))) > 0)
  ), paged AS (SELECT * FROM filtered ORDER BY updated_at DESC, team_id DESC LIMIT p_page_size OFFSET (p_page - 1) * p_page_size)
  SELECT jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered), 'page', p_page, 'page_size', p_page_size,
    'summary', (SELECT jsonb_build_object('registered', count(*), 'active', count(*) FILTER (WHERE status = 'active'),
      'trialing', count(*) FILTER (WHERE status = 'trialing'), 'monthly_amount', COALESCE(sum(monthly_amount) FILTER (WHERE status = 'active'), 0)) FROM public.account_subscriptions)) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.admin_update_settings(p_support_enabled boolean, p_support_email text, p_announcement text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_previous jsonb; v_result jsonb;
BEGIN
  PERFORM public.platform_require_admin();
  SELECT to_jsonb(s) INTO v_previous FROM public.platform_settings s WHERE id FOR UPDATE;
  UPDATE public.platform_settings SET support_enabled = p_support_enabled, support_email = btrim(p_support_email),
    announcement = btrim(p_announcement), updated_at = now(), updated_by = auth.uid() WHERE id;
  SELECT to_jsonb(s) INTO v_result FROM public.platform_settings s WHERE id;
  INSERT INTO public.platform_audit_log(actor_user_id, action, entity_id, details)
  VALUES (auth.uid(), 'settings_update', 'platform', jsonb_build_object('support_enabled', p_support_enabled,
    'announcement_changed', (v_previous->>'announcement') IS DISTINCT FROM p_announcement));
  RETURN v_result;
END;
$$;

-- Explicit function grants also override Supabase installations that grant
-- execute to client roles through default privileges.
REVOKE ALL ON FUNCTION public.platform_require_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_platform_admin(), public.get_support_settings(),
  public.create_support_ticket(text, text, text, uuid), public.list_support_tickets(boolean, text, text, text, text, integer, integer),
  public.get_support_ticket(uuid), public.reply_support_ticket(uuid, text, text, text),
  public.admin_list_accounts(text, text, integer, integer), public.admin_list_members(text, integer, integer),
  public.admin_get_account(uuid), public.admin_get_overview(integer), public.admin_update_subscription(uuid, text, text, numeric, timestamptz, text),
  public.admin_list_subscriptions(text, text, integer, integer), public.admin_update_settings(boolean, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(), public.get_support_settings(),
  public.create_support_ticket(text, text, text, uuid), public.list_support_tickets(boolean, text, text, text, text, integer, integer),
  public.get_support_ticket(uuid), public.reply_support_ticket(uuid, text, text, text),
  public.admin_list_accounts(text, text, integer, integer), public.admin_list_members(text, integer, integer),
  public.admin_get_account(uuid), public.admin_get_overview(integer), public.admin_update_subscription(uuid, text, text, numeric, timestamptz, text),
  public.admin_list_subscriptions(text, text, integer, integer), public.admin_update_settings(boolean, text, text)
  TO authenticated;
GRANT ALL ON public.platform_admins, public.platform_settings, public.account_subscriptions,
  public.platform_audit_log, public.support_tickets, public.support_ticket_messages TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.support_tickets_ticket_number_seq TO service_role;
