
-- Create cultos table
CREATE TABLE public.cultos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create culto_songs junction table
CREATE TABLE public.culto_songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  culto_id UUID NOT NULL REFERENCES public.cultos(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cultos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.culto_songs ENABLE ROW LEVEL SECURITY;

-- RLS for cultos
CREATE POLICY "Members can view cultos" ON public.cultos
  FOR SELECT USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Editors can create cultos" ON public.cultos
  FOR INSERT WITH CHECK (can_edit_team(auth.uid(), team_id));

CREATE POLICY "Editors can update cultos" ON public.cultos
  FOR UPDATE USING (can_edit_team(auth.uid(), team_id));

CREATE POLICY "Editors can delete cultos" ON public.cultos
  FOR DELETE USING (can_edit_team(auth.uid(), team_id));

-- RLS for culto_songs
CREATE POLICY "Members can view culto songs" ON public.culto_songs
  FOR SELECT USING (is_team_member(auth.uid(), (SELECT team_id FROM cultos WHERE id = culto_songs.culto_id)));

CREATE POLICY "Editors can add culto songs" ON public.culto_songs
  FOR INSERT WITH CHECK (can_edit_team(auth.uid(), (SELECT team_id FROM cultos WHERE id = culto_songs.culto_id)));

CREATE POLICY "Editors can update culto songs" ON public.culto_songs
  FOR UPDATE USING (can_edit_team(auth.uid(), (SELECT team_id FROM cultos WHERE id = culto_songs.culto_id)));

CREATE POLICY "Editors can delete culto songs" ON public.culto_songs
  FOR DELETE USING (can_edit_team(auth.uid(), (SELECT team_id FROM cultos WHERE id = culto_songs.culto_id)));

-- Trigger for updated_at on cultos
CREATE TRIGGER update_cultos_updated_at
  BEFORE UPDATE ON public.cultos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_cultos_team_id ON public.cultos(team_id);
CREATE INDEX idx_cultos_date ON public.cultos(date);
CREATE INDEX idx_culto_songs_culto_id ON public.culto_songs(culto_id);
CREATE INDEX idx_culto_songs_song_id ON public.culto_songs(song_id);
