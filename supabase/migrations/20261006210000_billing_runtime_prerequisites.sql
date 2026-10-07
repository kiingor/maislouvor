-- Narrow prerequisites for the billing/invite runtime on existing installations.
-- Legacy pending invitations retain their original validity (NULL expiry).
BEGIN;
ALTER TABLE public.team_invites ADD COLUMN IF NOT EXISTS expires_at timestamptz;
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


COMMIT;
