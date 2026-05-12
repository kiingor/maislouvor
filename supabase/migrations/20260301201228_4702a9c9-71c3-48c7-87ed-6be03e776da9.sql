
-- Create song_loop_points table
CREATE TABLE public.song_loop_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Loop',
  start_time real NOT NULL,
  end_time real NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  repeat_count integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.song_loop_points ENABLE ROW LEVEL SECURITY;

-- SELECT: owner OR public loops from same team members
CREATE POLICY "Users can view own loops"
ON public.song_loop_points
FOR SELECT
USING (profile_id = get_my_profile_id());

CREATE POLICY "Users can view public team loops"
ON public.song_loop_points
FOR SELECT
USING (
  is_public = true
  AND is_team_member(auth.uid(), (SELECT team_id FROM public.songs WHERE id = song_loop_points.song_id))
);

-- INSERT: only own
CREATE POLICY "Users can create own loops"
ON public.song_loop_points
FOR INSERT
WITH CHECK (profile_id = get_my_profile_id());

-- UPDATE: only own
CREATE POLICY "Users can update own loops"
ON public.song_loop_points
FOR UPDATE
USING (profile_id = get_my_profile_id());

-- DELETE: only own
CREATE POLICY "Users can delete own loops"
ON public.song_loop_points
FOR DELETE
USING (profile_id = get_my_profile_id());
