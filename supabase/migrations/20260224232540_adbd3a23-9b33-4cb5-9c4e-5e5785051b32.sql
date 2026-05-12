ALTER TABLE public.culto_songs 
  ADD COLUMN notes_author_id uuid REFERENCES public.profiles(id);