-- Security hardening based on the 2026-08-29 repository audit.
-- This migration intentionally does not delete legacy cross-team relations.
-- Invalid legacy rows become invisible through RLS and can still be removed by
-- an editor of their parent object.

-- ---------------------------------------------------------------------------
-- Pending invitations
-- ---------------------------------------------------------------------------

ALTER TABLE public.team_invites
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days');

CREATE INDEX IF NOT EXISTS idx_team_invites_pending_email
  ON public.team_invites (team_id, lower(email), expires_at)
  WHERE accepted = false;

-- Memberships are created only by the owner trigger or by accept-invite after
-- the recipient proves control of the invited e-mail. Admins may still manage
-- the role/instruments of an existing member, but cannot swap its identity.
DROP POLICY IF EXISTS "Admins can add team members" ON public.team_members;
DROP POLICY IF EXISTS "Admins can update team members" ON public.team_members;

CREATE POLICY "Admins can update team members"
ON public.team_members FOR UPDATE TO authenticated
USING (public.has_team_role(auth.uid(), team_id, 'admin'))
WITH CHECK (public.has_team_role(auth.uid(), team_id, 'admin'));

CREATE OR REPLACE FUNCTION public.prevent_team_member_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated'
     AND (NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id) THEN
    RAISE EXCEPTION 'team_id and profile_id are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_team_member_identity_change ON public.team_members;
CREATE TRIGGER prevent_team_member_identity_change
BEFORE UPDATE OF team_id, profile_id ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.prevent_team_member_identity_change();

-- RLS is not enough for service-role callers. Reject every membership insert
-- except the team's initial owner and the atomic invite-acceptance function
-- below. This also makes the migration safe if an older create-invite function
-- remains deployed for a few seconds during rollout.
CREATE OR REPLACE FUNCTION public.guard_team_member_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite_id uuid;
BEGIN
  IF NEW.role = 'admin'
     AND EXISTS (
       SELECT 1
       FROM public.teams t
       WHERE t.id = NEW.team_id
         AND t.owner_id = NEW.profile_id
     ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    _invite_id := NULLIF(current_setting('app.accept_team_invite_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    _invite_id := NULL;
  END;

  IF _invite_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.team_invites ti
       WHERE ti.id = _invite_id
         AND ti.team_id = NEW.team_id
         AND ti.role = NEW.role
         AND ti.accepted = false
         AND ti.expires_at > now()
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'team membership requires an accepted invitation'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_team_member_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS guard_team_member_insert ON public.team_members;
CREATE TRIGGER guard_team_member_insert
BEFORE INSERT ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.guard_team_member_insert();

CREATE OR REPLACE FUNCTION public.accept_team_invite(
  _invite_id uuid,
  _profile_id uuid,
  _email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite public.team_invites%ROWTYPE;
BEGIN
  SELECT *
  INTO _invite
  FROM public.team_invites ti
  WHERE ti.id = _invite_id
  FOR UPDATE;

  IF NOT FOUND
     OR _invite.accepted
     OR _invite.expires_at <= now() THEN
    RAISE EXCEPTION 'invite is invalid, expired, or already accepted'
      USING ERRCODE = '22023';
  END IF;

  IF lower(btrim(_invite.email)) IS DISTINCT FROM lower(btrim(_email)) THEN
    RAISE EXCEPTION 'invite e-mail does not match authenticated user'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.accept_team_invite_id', _invite.id::text, true);

  INSERT INTO public.team_members (team_id, profile_id, role)
  VALUES (_invite.team_id, _profile_id, _invite.role)
  ON CONFLICT (team_id, profile_id) DO NOTHING;

  UPDATE public.team_invites
  SET accepted = true
  WHERE id = _invite.id;

  PERFORM set_config('app.accept_team_invite_id', '', true);
  RETURN _invite.team_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_team_invite(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Storage isolation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.storage_top_level_uuid(_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public, storage
AS $$
  SELECT CASE
    WHEN (storage.foldername(_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN ((storage.foldername(_name))[1])::uuid
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.storage_top_level_uuid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_top_level_uuid(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete covers" ON storage.objects;

CREATE POLICY "Team members can view covers"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'covers'
  AND public.is_team_member(auth.uid(), public.storage_top_level_uuid(name))
);

CREATE POLICY "Editors can upload covers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'covers'
  AND public.can_edit_team(auth.uid(), public.storage_top_level_uuid(name))
);

CREATE POLICY "Editors can update covers"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'covers'
  AND public.can_edit_team(auth.uid(), public.storage_top_level_uuid(name))
)
WITH CHECK (
  bucket_id = 'covers'
  AND public.can_edit_team(auth.uid(), public.storage_top_level_uuid(name))
);

CREATE POLICY "Editors can delete covers"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'covers'
  AND public.can_edit_team(auth.uid(), public.storage_top_level_uuid(name))
);

DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- Cross-team relation integrity: repertorio_songs
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Members can view repertorio songs" ON public.repertorio_songs;
DROP POLICY IF EXISTS "Editors can add repertorio songs" ON public.repertorio_songs;
DROP POLICY IF EXISTS "Editors can update repertorio songs" ON public.repertorio_songs;
DROP POLICY IF EXISTS "Editors can delete repertorio songs" ON public.repertorio_songs;

CREATE POLICY "Members can view repertorio songs"
ON public.repertorio_songs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.repertorios r
    JOIN public.songs s ON s.id = repertorio_songs.song_id
    WHERE r.id = repertorio_songs.repertorio_id
      AND r.team_id = s.team_id
      AND public.is_team_member(auth.uid(), r.team_id)
  )
);

CREATE POLICY "Editors can add repertorio songs"
ON public.repertorio_songs FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.repertorios r
    JOIN public.songs s ON s.id = repertorio_songs.song_id
    WHERE r.id = repertorio_songs.repertorio_id
      AND r.team_id = s.team_id
      AND public.can_edit_team(auth.uid(), r.team_id)
  )
);

CREATE POLICY "Editors can update repertorio songs"
ON public.repertorio_songs FOR UPDATE TO authenticated
USING (
  public.can_edit_team(
    auth.uid(),
    (SELECT r.team_id FROM public.repertorios r WHERE r.id = repertorio_songs.repertorio_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.repertorios r
    JOIN public.songs s ON s.id = repertorio_songs.song_id
    WHERE r.id = repertorio_songs.repertorio_id
      AND r.team_id = s.team_id
      AND public.can_edit_team(auth.uid(), r.team_id)
  )
);

CREATE POLICY "Editors can delete repertorio songs"
ON public.repertorio_songs FOR DELETE TO authenticated
USING (
  public.can_edit_team(
    auth.uid(),
    (SELECT r.team_id FROM public.repertorios r WHERE r.id = repertorio_songs.repertorio_id)
  )
);

CREATE OR REPLACE FUNCTION public.enforce_repertorio_song_same_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _repertorio_team uuid;
  _song_team uuid;
BEGIN
  SELECT team_id INTO _repertorio_team FROM public.repertorios WHERE id = NEW.repertorio_id;
  SELECT team_id INTO _song_team FROM public.songs WHERE id = NEW.song_id;

  IF _repertorio_team IS NULL OR _song_team IS NULL OR _repertorio_team IS DISTINCT FROM _song_team THEN
    RAISE EXCEPTION 'repertorio and song must belong to the same team' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_repertorio_song_same_team ON public.repertorio_songs;
CREATE TRIGGER enforce_repertorio_song_same_team
BEFORE INSERT OR UPDATE OF repertorio_id, song_id ON public.repertorio_songs
FOR EACH ROW EXECUTE FUNCTION public.enforce_repertorio_song_same_team();

-- ---------------------------------------------------------------------------
-- Cross-team relation integrity: culto_songs
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Members can view culto songs" ON public.culto_songs;
DROP POLICY IF EXISTS "Editors can add culto songs" ON public.culto_songs;
DROP POLICY IF EXISTS "Editors can update culto songs" ON public.culto_songs;
DROP POLICY IF EXISTS "Editors can delete culto songs" ON public.culto_songs;

CREATE POLICY "Members can view culto songs"
ON public.culto_songs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.cultos c
    JOIN public.songs s ON s.id = culto_songs.song_id
    WHERE c.id = culto_songs.culto_id
      AND c.team_id = s.team_id
      AND public.is_team_member(auth.uid(), c.team_id)
  )
);

CREATE POLICY "Editors can add culto songs"
ON public.culto_songs FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.cultos c
    JOIN public.songs s ON s.id = culto_songs.song_id
    WHERE c.id = culto_songs.culto_id
      AND c.team_id = s.team_id
      AND public.can_edit_team(auth.uid(), c.team_id)
  )
);

CREATE POLICY "Editors can update culto songs"
ON public.culto_songs FOR UPDATE TO authenticated
USING (
  public.can_edit_team(
    auth.uid(),
    (SELECT c.team_id FROM public.cultos c WHERE c.id = culto_songs.culto_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.cultos c
    JOIN public.songs s ON s.id = culto_songs.song_id
    WHERE c.id = culto_songs.culto_id
      AND c.team_id = s.team_id
      AND public.can_edit_team(auth.uid(), c.team_id)
  )
);

CREATE POLICY "Editors can delete culto songs"
ON public.culto_songs FOR DELETE TO authenticated
USING (
  public.can_edit_team(
    auth.uid(),
    (SELECT c.team_id FROM public.cultos c WHERE c.id = culto_songs.culto_id)
  )
);

CREATE OR REPLACE FUNCTION public.enforce_culto_song_same_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _culto_team uuid;
  _song_team uuid;
BEGIN
  SELECT team_id INTO _culto_team FROM public.cultos WHERE id = NEW.culto_id;
  SELECT team_id INTO _song_team FROM public.songs WHERE id = NEW.song_id;

  IF _culto_team IS NULL OR _song_team IS NULL OR _culto_team IS DISTINCT FROM _song_team THEN
    RAISE EXCEPTION 'culto and song must belong to the same team' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_culto_song_same_team ON public.culto_songs;
CREATE TRIGGER enforce_culto_song_same_team
BEFORE INSERT OR UPDATE OF culto_id, song_id ON public.culto_songs
FOR EACH ROW EXECUTE FUNCTION public.enforce_culto_song_same_team();

-- ---------------------------------------------------------------------------
-- Cross-team relation integrity and narrow member status update: culto_lineup
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Members can view culto lineup" ON public.culto_lineup;
DROP POLICY IF EXISTS "Editors can insert culto lineup" ON public.culto_lineup;
DROP POLICY IF EXISTS "Editors can update culto lineup" ON public.culto_lineup;
DROP POLICY IF EXISTS "Editors can delete culto lineup" ON public.culto_lineup;
DROP POLICY IF EXISTS "Members can update own lineup status" ON public.culto_lineup;

CREATE POLICY "Members can view culto lineup"
ON public.culto_lineup FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.cultos c
    JOIN public.team_members tm ON tm.id = culto_lineup.team_member_id
    WHERE c.id = culto_lineup.culto_id
      AND c.team_id = tm.team_id
      AND public.is_team_member(auth.uid(), c.team_id)
  )
);

CREATE POLICY "Editors can insert culto lineup"
ON public.culto_lineup FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.cultos c
    JOIN public.team_members tm ON tm.id = culto_lineup.team_member_id
    WHERE c.id = culto_lineup.culto_id
      AND c.team_id = tm.team_id
      AND public.can_edit_team(auth.uid(), c.team_id)
  )
);

CREATE POLICY "Editors can update culto lineup"
ON public.culto_lineup FOR UPDATE TO authenticated
USING (
  public.can_edit_team(
    auth.uid(),
    (SELECT c.team_id FROM public.cultos c WHERE c.id = culto_lineup.culto_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.cultos c
    JOIN public.team_members tm ON tm.id = culto_lineup.team_member_id
    WHERE c.id = culto_lineup.culto_id
      AND c.team_id = tm.team_id
      AND public.can_edit_team(auth.uid(), c.team_id)
  )
);

CREATE POLICY "Editors can delete culto lineup"
ON public.culto_lineup FOR DELETE TO authenticated
USING (
  public.can_edit_team(
    auth.uid(),
    (SELECT c.team_id FROM public.cultos c WHERE c.id = culto_lineup.culto_id)
  )
);

CREATE OR REPLACE FUNCTION public.enforce_culto_lineup_same_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _culto_team uuid;
  _member_team uuid;
BEGIN
  SELECT team_id INTO _culto_team FROM public.cultos WHERE id = NEW.culto_id;
  SELECT team_id INTO _member_team FROM public.team_members WHERE id = NEW.team_member_id;

  IF _culto_team IS NULL OR _member_team IS NULL OR _culto_team IS DISTINCT FROM _member_team THEN
    RAISE EXCEPTION 'culto and team member must belong to the same team' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_culto_lineup_same_team ON public.culto_lineup;
CREATE TRIGGER enforce_culto_lineup_same_team
BEFORE INSERT OR UPDATE OF culto_id, team_member_id ON public.culto_lineup
FOR EACH ROW EXECUTE FUNCTION public.enforce_culto_lineup_same_team();

CREATE OR REPLACE FUNCTION public.set_own_lineup_status(
  _lineup_id uuid,
  _status public.lineup_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.culto_lineup cl
  SET status = _status
  FROM public.team_members tm
  JOIN public.profiles p ON p.id = tm.profile_id
  CROSS JOIN public.cultos c
  WHERE cl.id = _lineup_id
    AND tm.id = cl.team_member_id
    AND c.id = cl.culto_id
    AND p.user_id = auth.uid()
    AND c.team_id = tm.team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lineup not found or not owned by caller' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_own_lineup_status(uuid, public.lineup_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_own_lineup_status(uuid, public.lineup_status) TO authenticated;

-- ---------------------------------------------------------------------------
-- song_loop_points must reference a song in one of the profile's teams
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own loops" ON public.song_loop_points;
DROP POLICY IF EXISTS "Users can create own loops" ON public.song_loop_points;
DROP POLICY IF EXISTS "Users can update own loops" ON public.song_loop_points;

CREATE POLICY "Users can view own loops"
ON public.song_loop_points FOR SELECT TO authenticated
USING (
  profile_id = public.get_my_profile_id()
  AND public.is_team_member(
    auth.uid(),
    (SELECT s.team_id FROM public.songs s WHERE s.id = song_loop_points.song_id)
  )
);

CREATE POLICY "Users can create own loops"
ON public.song_loop_points FOR INSERT TO authenticated
WITH CHECK (
  profile_id = public.get_my_profile_id()
  AND public.is_team_member(
    auth.uid(),
    (SELECT s.team_id FROM public.songs s WHERE s.id = song_loop_points.song_id)
  )
);

CREATE POLICY "Users can update own loops"
ON public.song_loop_points FOR UPDATE TO authenticated
USING (
  profile_id = public.get_my_profile_id()
  AND public.is_team_member(
    auth.uid(),
    (SELECT s.team_id FROM public.songs s WHERE s.id = song_loop_points.song_id)
  )
)
WITH CHECK (
  profile_id = public.get_my_profile_id()
  AND public.is_team_member(
    auth.uid(),
    (SELECT s.team_id FROM public.songs s WHERE s.id = song_loop_points.song_id)
  )
);

CREATE OR REPLACE FUNCTION public.enforce_loop_profile_song_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.songs s
    JOIN public.team_members tm ON tm.team_id = s.team_id
    WHERE s.id = NEW.song_id
      AND tm.profile_id = NEW.profile_id
  ) THEN
    RAISE EXCEPTION 'loop owner must be a member of the song team' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_loop_profile_song_team ON public.song_loop_points;
CREATE TRIGGER enforce_loop_profile_song_team
BEFORE INSERT OR UPDATE OF song_id, profile_id ON public.song_loop_points
FOR EACH ROW EXECUTE FUNCTION public.enforce_loop_profile_song_team();

-- ---------------------------------------------------------------------------
-- Notification sender/recipient isolation
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Team editors can create notifications" ON public.notifications;

CREATE POLICY "Team editors can create notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (
  team_id IS NOT NULL
  AND public.can_edit_team(auth.uid(), team_id)
  AND sender_profile_id = public.get_my_profile_id()
  AND EXISTS (
    SELECT 1
    FROM public.team_members target
    WHERE target.team_id = notifications.team_id
      AND target.profile_id = notifications.profile_id
  )
  AND (link IS NULL OR link ~ '^/app(?:/|$)')
);

-- ---------------------------------------------------------------------------
-- Server-side, atomic rate limits for privileged Edge Functions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  rate_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.edge_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.edge_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_edge_rate_limit(
  _rate_key text,
  _limit integer,
  _window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := clock_timestamp();
  _allowed boolean;
BEGIN
  IF _rate_key IS NULL OR length(_rate_key) < 3 OR length(_rate_key) > 300
     OR _limit < 1 OR _limit > 1000
     OR _window_seconds < 1 OR _window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid rate limit parameters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.edge_rate_limits (rate_key, window_started_at, request_count, updated_at)
  VALUES (_rate_key, _now, 1, _now)
  ON CONFLICT (rate_key) DO UPDATE
  SET
    window_started_at = CASE
      WHEN edge_rate_limits.window_started_at <= _now - make_interval(secs => _window_seconds)
        THEN _now
      ELSE edge_rate_limits.window_started_at
    END,
    request_count = CASE
      WHEN edge_rate_limits.window_started_at <= _now - make_interval(secs => _window_seconds)
        THEN 1
      ELSE edge_rate_limits.request_count + 1
    END,
    updated_at = _now
  RETURNING request_count <= _limit INTO _allowed;

  RETURN _allowed;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_edge_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_edge_rate_limit(text, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- New media URLs must use HTTPS and an explicitly supported provider.
-- NOT VALID keeps legacy rows available for manual review; application code
-- treats every legacy value that fails the same allowlist as inert.
-- ---------------------------------------------------------------------------

ALTER TABLE public.songs
  DROP CONSTRAINT IF EXISTS songs_media_url_allowed_check;

ALTER TABLE public.songs
  ADD CONSTRAINT songs_media_url_allowed_check
  CHECK (
    media_url IS NULL
    OR (
      char_length(media_url) <= 2048
      AND media_url ~* '^https://([a-z0-9-]+\.)*(youtube\.com|youtu\.be|spotify\.com|music\.apple\.com|deezer\.com|soundcloud\.com|vimeo\.com)(:[0-9]{1,5})?(/|$)'
    )
  ) NOT VALID;
