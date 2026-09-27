-- Recorte do schema public de produção (pg_dump de 27/09/2026, antes da
-- migração 20260927120000), só com o que os testes em PGlite precisam:
-- tipos, tabelas do núcleo (equipe, membros, cultos, escala, músicas,
-- disponibilidade, notificações) e as funções de permissão usadas pelas RLS.
-- Sem a FK profiles.user_id -> auth.users (o PGlite não tem o schema auth real).
-- Gerado a partir do dump; não edite à mão sem conferir com a produção.

CREATE TYPE public.lineup_status AS ENUM (
    'pending',
    'accepted',
    'declined'
);

CREATE TYPE public.team_role AS ENUM (
    'admin',
    'editor',
    'viewer'
);

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    phone text,
    notification_prefs jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    owner_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    join_code text,
    availability_mode text DEFAULT 'both'::text NOT NULL,
    CONSTRAINT teams_availability_mode_check CHECK ((availability_mode = ANY (ARRAY['available_only'::text, 'unavailable_only'::text, 'both'::text])))
);

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    role public.team_role DEFAULT 'viewer'::public.team_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    instruments text[] DEFAULT '{}'::text[],
    instrument_levels jsonb DEFAULT '{}'::jsonb NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.cultos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    created_by uuid,
    name text NOT NULL,
    date date NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    public_token text
);

CREATE TABLE public.culto_lineup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    culto_id uuid NOT NULL,
    team_member_id uuid NOT NULL,
    instrument text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.lineup_status DEFAULT 'pending'::public.lineup_status NOT NULL
);

CREATE TABLE public.songs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    artist text,
    cifra_text text,
    key_original text,
    key_current text,
    media_url text,
    cover_path text,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    audio_path text,
    segment_timestamps jsonb,
    lyrics_text text,
    tags text[] DEFAULT '{}'::text[],
    theme text,
    scroll_speed real,
    stems_status text DEFAULT 'idle'::text NOT NULL,
    stems_job_id text,
    stems_error text,
    bpm integer,
    duration_seconds integer,
    CONSTRAINT songs_stems_status_check CHECK ((stems_status = ANY (ARRAY['idle'::text, 'processing'::text, 'done'::text, 'error'::text])))
);

CREATE TABLE public.culto_songs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    culto_id uuid NOT NULL,
    song_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    notes_author_id uuid,
    key_override text
);

CREATE TABLE public.culto_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    culto_id uuid NOT NULL,
    title text NOT NULL,
    kind text DEFAULT 'moment'::text NOT NULL,
    duration_min integer DEFAULT 5 NOT NULL,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.culto_song_voices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    culto_song_id uuid NOT NULL,
    team_member_id uuid NOT NULL,
    voice integer DEFAULT 1 NOT NULL,
    voice_part text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT culto_song_voices_voice_check CHECK (((voice >= 1) AND (voice <= 8)))
);

CREATE TABLE public.member_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_member_id uuid NOT NULL,
    available_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    instruments text[] DEFAULT '{}'::text[] NOT NULL,
    reason text,
    CONSTRAINT member_availability_status_check CHECK ((status = ANY (ARRAY['available'::text, 'unavailable'::text])))
);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    read boolean DEFAULT false NOT NULL,
    link text,
    team_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sender_profile_id uuid
);

ALTER TABLE ONLY public.culto_blocks ADD CONSTRAINT culto_blocks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.culto_lineup ADD CONSTRAINT culto_lineup_culto_id_team_member_id_instrument_key UNIQUE (culto_id, team_member_id, instrument);
ALTER TABLE ONLY public.culto_lineup ADD CONSTRAINT culto_lineup_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.culto_song_voices ADD CONSTRAINT culto_song_voices_culto_song_id_team_member_id_key UNIQUE (culto_song_id, team_member_id);
ALTER TABLE ONLY public.culto_song_voices ADD CONSTRAINT culto_song_voices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.culto_songs ADD CONSTRAINT culto_songs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cultos ADD CONSTRAINT cultos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.member_availability ADD CONSTRAINT member_availability_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.member_availability ADD CONSTRAINT member_availability_team_member_id_available_date_key UNIQUE (team_member_id, available_date);
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
ALTER TABLE ONLY public.songs ADD CONSTRAINT songs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_members ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_members ADD CONSTRAINT team_members_team_id_profile_id_key UNIQUE (team_id, profile_id);
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_join_code_key UNIQUE (join_code);
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.culto_blocks ADD CONSTRAINT culto_blocks_culto_id_fkey FOREIGN KEY (culto_id) REFERENCES public.cultos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.culto_lineup ADD CONSTRAINT culto_lineup_culto_id_fkey FOREIGN KEY (culto_id) REFERENCES public.cultos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.culto_lineup ADD CONSTRAINT culto_lineup_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.culto_song_voices ADD CONSTRAINT culto_song_voices_culto_song_id_fkey FOREIGN KEY (culto_song_id) REFERENCES public.culto_songs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.culto_song_voices ADD CONSTRAINT culto_song_voices_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.culto_songs ADD CONSTRAINT culto_songs_culto_id_fkey FOREIGN KEY (culto_id) REFERENCES public.cultos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.culto_songs ADD CONSTRAINT culto_songs_notes_author_id_fkey FOREIGN KEY (notes_author_id) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.culto_songs ADD CONSTRAINT culto_songs_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.cultos ADD CONSTRAINT cultos_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.cultos ADD CONSTRAINT cultos_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.member_availability ADD CONSTRAINT member_availability_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_sender_profile_id_fkey FOREIGN KEY (sender_profile_id) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.songs ADD CONSTRAINT songs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.songs ADD CONSTRAINT songs_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_members ADD CONSTRAINT team_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_members ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.teams ADD CONSTRAINT teams_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE FUNCTION public.get_my_profile_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE FUNCTION public.has_team_role(_user_id uuid, _team_id uuid, _role public.team_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1)
      AND team_id = _team_id
      AND role = _role
  )
$$;

CREATE FUNCTION public.is_team_member(_user_id uuid, _team_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1)
      AND team_id = _team_id
  )
$$;

CREATE FUNCTION public.member_can(_user_id uuid, _team_id uuid, _resource text, _action text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role     team_role;
  v_perms    jsonb;
  v_override jsonb;
BEGIN
  SELECT tm.role, COALESCE(tm.permissions, '{}'::jsonb)
    INTO v_role, v_perms
  FROM public.team_members tm
  WHERE tm.team_id = _team_id
    AND tm.profile_id = (SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1)
  LIMIT 1;

  -- não é membro da equipe
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- líder = acesso total
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  -- exceção explícita do membro?
  v_override := v_perms -> _resource -> _action;
  IF v_override IS NOT NULL THEN
    RETURN (v_override #>> '{}')::boolean;
  END IF;

  -- defaults do preset (devem casar com defaultFor() no frontend)
  IF _action = 'ver' THEN
    RETURN true;                                  -- editor e viewer enxergam tudo
  ELSIF _action = 'editar' THEN
    IF v_role = 'editor' THEN
      RETURN (_resource <> 'membros');            -- editor edita conteúdo, não gerencia membros
    ELSE
      RETURN false;                               -- viewer não edita nada
    END IF;
  END IF;

  RETURN false;
END;
$$;

CREATE FUNCTION public.gen_team_code() RETURNS text
    LANGUAGE plpgsql
    AS $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result   text := '';
  i        int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

