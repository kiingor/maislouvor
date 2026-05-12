
-- Add audio columns to songs table
ALTER TABLE public.songs ADD COLUMN audio_path text;
ALTER TABLE public.songs ADD COLUMN segment_timestamps jsonb;

-- Create audio storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', false);

-- Storage policies for audio bucket (same pattern as covers)
CREATE POLICY "Team members can view audio"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio' AND public.is_team_member(auth.uid(), (storage.foldername(name))[1]::uuid));

CREATE POLICY "Editors can upload audio"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'audio' AND public.can_edit_team(auth.uid(), (storage.foldername(name))[1]::uuid));

CREATE POLICY "Editors can update audio"
ON storage.objects FOR UPDATE
USING (bucket_id = 'audio' AND public.can_edit_team(auth.uid(), (storage.foldername(name))[1]::uuid));

CREATE POLICY "Editors can delete audio"
ON storage.objects FOR DELETE
USING (bucket_id = 'audio' AND public.can_edit_team(auth.uid(), (storage.foldername(name))[1]::uuid));
