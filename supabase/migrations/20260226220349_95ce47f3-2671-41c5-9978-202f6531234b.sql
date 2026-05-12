
-- Add public_token and is_public columns to repertorios
ALTER TABLE public.repertorios
  ADD COLUMN public_token uuid UNIQUE DEFAULT NULL,
  ADD COLUMN is_public boolean NOT NULL DEFAULT false;

-- Create index for fast lookup by public_token
CREATE INDEX idx_repertorios_public_token ON public.repertorios (public_token) WHERE public_token IS NOT NULL;
