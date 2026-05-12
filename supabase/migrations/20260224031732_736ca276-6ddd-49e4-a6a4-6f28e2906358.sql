
-- Add tags (array) and theme to songs
ALTER TABLE public.songs ADD COLUMN tags TEXT[] DEFAULT '{}';
ALTER TABLE public.songs ADD COLUMN theme TEXT;

-- Index for tag filtering
CREATE INDEX idx_songs_tags ON public.songs USING GIN(tags);
