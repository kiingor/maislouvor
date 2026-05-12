
-- 1. Role enum
CREATE TYPE public.team_role AS ENUM ('admin', 'editor', 'viewer');

-- 2. Teams table
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- 3. Team members table
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.team_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, profile_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- 4. Team invites table
CREATE TABLE public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.team_role NOT NULL DEFAULT 'viewer',
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  accepted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- 5. Repertorios table
CREATE TABLE public.repertorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.repertorios ENABLE ROW LEVEL SECURITY;

-- 6. Songs stub table
CREATE TABLE public.songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

-- 7. Repertorio songs join table
CREATE TABLE public.repertorio_songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repertorio_id uuid NOT NULL REFERENCES public.repertorios(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(repertorio_id, song_id)
);
ALTER TABLE public.repertorio_songs ENABLE ROW LEVEL SECURITY;

-- =====================
-- Security Definer Functions
-- =====================

CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1)
      AND team_id = _team_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_team_role(_user_id uuid, _team_id uuid, _role public.team_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1)
      AND team_id = _team_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1)
      AND team_id = _team_id
      AND role IN ('admin', 'editor')
  )
$$;

-- =====================
-- Trigger: auto-add owner as admin on team creation
-- =====================

CREATE OR REPLACE FUNCTION public.handle_new_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.team_members (team_id, profile_id, role)
  VALUES (NEW.id, NEW.owner_id, 'admin');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_team_created
  AFTER INSERT ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_team();

-- Trigger: updated_at on repertorios
CREATE TRIGGER update_repertorios_updated_at
  BEFORE UPDATE ON public.repertorios
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- RLS Policies: teams
-- =====================

CREATE POLICY "Members can view their teams"
  ON public.teams FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), id));

CREATE POLICY "Authenticated users can create teams"
  ON public.teams FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "Admins can update teams"
  ON public.teams FOR UPDATE TO authenticated
  USING (public.has_team_role(auth.uid(), id, 'admin'));

CREATE POLICY "Admins can delete teams"
  ON public.teams FOR DELETE TO authenticated
  USING (public.has_team_role(auth.uid(), id, 'admin'));

-- =====================
-- RLS Policies: team_members
-- =====================

CREATE POLICY "Members can view team members"
  ON public.team_members FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Admins can add team members"
  ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (public.has_team_role(auth.uid(), team_id, 'admin'));

CREATE POLICY "Admins can update team members"
  ON public.team_members FOR UPDATE TO authenticated
  USING (public.has_team_role(auth.uid(), team_id, 'admin'));

CREATE POLICY "Admins can remove team members"
  ON public.team_members FOR DELETE TO authenticated
  USING (public.has_team_role(auth.uid(), team_id, 'admin'));

-- =====================
-- RLS Policies: team_invites
-- =====================

CREATE POLICY "Admins can view invites"
  ON public.team_invites FOR SELECT TO authenticated
  USING (public.has_team_role(auth.uid(), team_id, 'admin'));

CREATE POLICY "Admins can create invites"
  ON public.team_invites FOR INSERT TO authenticated
  WITH CHECK (public.has_team_role(auth.uid(), team_id, 'admin'));

CREATE POLICY "Admins can update invites"
  ON public.team_invites FOR UPDATE TO authenticated
  USING (public.has_team_role(auth.uid(), team_id, 'admin'));

CREATE POLICY "Admins can delete invites"
  ON public.team_invites FOR DELETE TO authenticated
  USING (public.has_team_role(auth.uid(), team_id, 'admin'));

-- =====================
-- RLS Policies: repertorios
-- =====================

CREATE POLICY "Members can view repertorios"
  ON public.repertorios FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Editors can create repertorios"
  ON public.repertorios FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_team(auth.uid(), team_id));

CREATE POLICY "Editors can update repertorios"
  ON public.repertorios FOR UPDATE TO authenticated
  USING (public.can_edit_team(auth.uid(), team_id));

CREATE POLICY "Editors can delete repertorios"
  ON public.repertorios FOR DELETE TO authenticated
  USING (public.can_edit_team(auth.uid(), team_id));

-- =====================
-- RLS Policies: songs
-- =====================

CREATE POLICY "Members can view songs"
  ON public.songs FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Editors can create songs"
  ON public.songs FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_team(auth.uid(), team_id));

CREATE POLICY "Editors can update songs"
  ON public.songs FOR UPDATE TO authenticated
  USING (public.can_edit_team(auth.uid(), team_id));

CREATE POLICY "Editors can delete songs"
  ON public.songs FOR DELETE TO authenticated
  USING (public.can_edit_team(auth.uid(), team_id));

-- =====================
-- RLS Policies: repertorio_songs
-- =====================

CREATE POLICY "Members can view repertorio songs"
  ON public.repertorio_songs FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), (SELECT team_id FROM public.repertorios WHERE id = repertorio_id)));

CREATE POLICY "Editors can add repertorio songs"
  ON public.repertorio_songs FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_team(auth.uid(), (SELECT team_id FROM public.repertorios WHERE id = repertorio_id)));

CREATE POLICY "Editors can update repertorio songs"
  ON public.repertorio_songs FOR UPDATE TO authenticated
  USING (public.can_edit_team(auth.uid(), (SELECT team_id FROM public.repertorios WHERE id = repertorio_id)));

CREATE POLICY "Editors can delete repertorio songs"
  ON public.repertorio_songs FOR DELETE TO authenticated
  USING (public.can_edit_team(auth.uid(), (SELECT team_id FROM public.repertorios WHERE id = repertorio_id)));
