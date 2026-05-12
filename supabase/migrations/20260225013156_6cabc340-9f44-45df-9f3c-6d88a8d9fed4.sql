
-- Create song_tracks table for multitrack audio
CREATE TABLE public.song_tracks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  track_name TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.song_tracks ENABLE ROW LEVEL SECURITY;

-- Members can view tracks (via song's team_id)
CREATE POLICY "Members can view song tracks"
ON public.song_tracks FOR SELECT
USING (is_team_member(auth.uid(), (SELECT team_id FROM public.songs WHERE id = song_tracks.song_id)));

-- Editors can insert tracks
CREATE POLICY "Editors can insert song tracks"
ON public.song_tracks FOR INSERT
WITH CHECK (can_edit_team(auth.uid(), (SELECT team_id FROM public.songs WHERE id = song_tracks.song_id)));

-- Editors can update tracks
CREATE POLICY "Editors can update song tracks"
ON public.song_tracks FOR UPDATE
USING (can_edit_team(auth.uid(), (SELECT team_id FROM public.songs WHERE id = song_tracks.song_id)));

-- Editors can delete tracks
CREATE POLICY "Editors can delete song tracks"
ON public.song_tracks FOR DELETE
USING (can_edit_team(auth.uid(), (SELECT team_id FROM public.songs WHERE id = song_tracks.song_id)));
