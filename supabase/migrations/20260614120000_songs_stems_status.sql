-- Track the state of the AI stem-separation (Demucs) for each song.
ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS stems_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS stems_job_id text,
  ADD COLUMN IF NOT EXISTS stems_error text;

ALTER TABLE public.songs
  DROP CONSTRAINT IF EXISTS songs_stems_status_check;
ALTER TABLE public.songs
  ADD CONSTRAINT songs_stems_status_check
  CHECK (stems_status IN ('idle', 'processing', 'done', 'error'));
