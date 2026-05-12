
-- Add instruments array to team_members
ALTER TABLE public.team_members ADD COLUMN instruments TEXT[] DEFAULT '{}';

-- Create culto_lineup table for instrument/member assignments per culto
CREATE TABLE public.culto_lineup (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  culto_id UUID NOT NULL REFERENCES public.cultos(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  instrument TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(culto_id, team_member_id, instrument)
);

ALTER TABLE public.culto_lineup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view culto lineup"
ON public.culto_lineup FOR SELECT
USING (is_team_member(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_lineup.culto_id)));

CREATE POLICY "Editors can insert culto lineup"
ON public.culto_lineup FOR INSERT
WITH CHECK (can_edit_team(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_lineup.culto_id)));

CREATE POLICY "Editors can update culto lineup"
ON public.culto_lineup FOR UPDATE
USING (can_edit_team(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_lineup.culto_id)));

CREATE POLICY "Editors can delete culto lineup"
ON public.culto_lineup FOR DELETE
USING (can_edit_team(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_lineup.culto_id)));

-- Allow team members to view other profiles in the same team (needed for avatars)
CREATE POLICY "Team members can view teammate profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.profile_id = profiles.id
    AND tm2.profile_id = (SELECT id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  )
);

-- Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');
