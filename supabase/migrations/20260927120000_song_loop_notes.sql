-- Optional rehearsal notes per loop. Nullable, no default rewrite: existing
-- loops, their order (sort_order), times and repeat counts are untouched.
-- Row policies already cover the new column: whoever can read a loop reads its
-- notes (own loops; public loops for the team and for recipients of a shared
-- song); only the owner can change them.
ALTER TABLE public.song_loop_points
  ADD COLUMN IF NOT EXISTS notes text
  CONSTRAINT song_loop_points_notes_check
    CHECK (notes IS NULL OR (notes ~ '\S' AND char_length(notes) <= 1000));
