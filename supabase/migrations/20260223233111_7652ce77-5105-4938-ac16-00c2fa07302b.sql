
-- Extend songs table with new columns
ALTER TABLE public.songs
  ADD COLUMN artist text,
  ADD COLUMN cifra_text text,
  ADD COLUMN key_original text,
  ADD COLUMN key_current text,
  ADD COLUMN media_url text,
  ADD COLUMN cover_path text,
  ADD COLUMN created_by uuid REFERENCES public.profiles(id),
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now();

-- Attach updated_at trigger to songs
CREATE TRIGGER update_songs_updated_at
  BEFORE UPDATE ON public.songs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create covers storage bucket (private, signed URLs)
INSERT INTO storage.buckets (id, name, public) VALUES ('covers', 'covers', false);

-- Storage RLS: authenticated users can upload covers
CREATE POLICY "Authenticated users can upload covers"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'covers' AND auth.role() = 'authenticated');

-- Storage RLS: authenticated users can view covers
CREATE POLICY "Authenticated users can view covers"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'covers' AND auth.role() = 'authenticated');

-- Storage RLS: authenticated users can update their covers
CREATE POLICY "Authenticated users can update covers"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'covers' AND auth.role() = 'authenticated');

-- Storage RLS: authenticated users can delete their covers
CREATE POLICY "Authenticated users can delete covers"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'covers' AND auth.role() = 'authenticated');
