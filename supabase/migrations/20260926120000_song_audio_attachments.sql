-- Additional recordings have their own queue and files. The existing YouTube
-- queue, main audio, stems, timestamps and rehearsal loops are untouched.
CREATE TABLE public.song_audio_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  audio_path text,
  youtube_url text CHECK (
    youtube_url IS NULL OR youtube_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
  ),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'queued', 'processing', 'error')),
  error text,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'ready' AND audio_path IS NOT NULL)
    OR (status <> 'ready' AND youtube_url IS NOT NULL AND audio_path IS NULL)
  )
);
CREATE INDEX song_audio_attachments_song_idx ON public.song_audio_attachments(song_id, created_at);
CREATE INDEX song_audio_attachments_queue_idx ON public.song_audio_attachments(created_at) WHERE status = 'queued';

-- A recording can only reference its own file, never the mix or a stem.
CREATE FUNCTION public.check_song_audio_attachment_path()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE song_team uuid;
BEGIN
  IF NEW.audio_path IS NOT NULL THEN
    SELECT team_id INTO song_team FROM public.songs WHERE id = NEW.song_id;
    IF song_team IS NULL OR NEW.audio_path !~ (
      '^' || song_team::text || '/' || NEW.song_id::text || '/additional/' || NEW.id::text
      || '\.(mp3|m4a|wav|ogg|flac|aac|webm|mp4|opus)$'
    ) THEN
      RAISE EXCEPTION 'Invalid additional audio path' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_song_audio_attachment_path
BEFORE INSERT OR UPDATE ON public.song_audio_attachments
FOR EACH ROW EXECUTE FUNCTION public.check_song_audio_attachment_path();

ALTER TABLE public.song_audio_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.song_audio_attachments FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.song_audio_attachments TO authenticated;
GRANT INSERT (id, song_id, title, audio_path) ON public.song_audio_attachments TO authenticated;
GRANT UPDATE (title) ON public.song_audio_attachments TO authenticated;
GRANT ALL ON public.song_audio_attachments TO service_role;

-- Reading follows the parent song's RLS, including explicit read shares.
CREATE POLICY "Readers can view additional audio"
ON public.song_audio_attachments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.songs s WHERE s.id = song_id));
CREATE POLICY "Editors can add additional audio"
ON public.song_audio_attachments FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.songs s WHERE s.id = song_id
    AND public.member_can(auth.uid(), s.team_id, 'musicas', 'editar')
));
CREATE POLICY "Editors can rename additional audio"
ON public.song_audio_attachments FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.songs s WHERE s.id = song_id
    AND public.member_can(auth.uid(), s.team_id, 'musicas', 'editar')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.songs s WHERE s.id = song_id
    AND public.member_can(auth.uid(), s.team_id, 'musicas', 'editar')
));
CREATE POLICY "Editors can remove additional audio"
ON public.song_audio_attachments FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.songs s WHERE s.id = song_id
    AND public.member_can(auth.uid(), s.team_id, 'musicas', 'editar')
));

CREATE POLICY "Song readers can play additional audio files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'audio' AND EXISTS (
  SELECT 1 FROM public.song_audio_attachments a WHERE a.audio_path = name
));

-- Only the new worker claims these rows. An older worker cannot claim them and
-- accidentally overwrite songs.audio_path via the original yt_import_jobs.
CREATE FUNCTION public.claim_song_audio_import()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE item public.song_audio_attachments; song_team uuid;
BEGIN
  UPDATE public.song_audio_attachments
    SET status = 'error', error = 'Importação interrompida. Tente novamente.'
    WHERE status = 'processing' AND claimed_at < now() - interval '15 minutes';
  SELECT * INTO item FROM public.song_audio_attachments
    WHERE status = 'queued' ORDER BY created_at, id
    FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.song_audio_attachments SET status = 'processing', claimed_at = now(), error = NULL
    WHERE id = item.id;
  SELECT team_id INTO song_team FROM public.songs WHERE id = item.song_id;
  RETURN jsonb_build_object('id', item.id, 'attachment_id', item.id,
    'song_id', item.song_id, 'team_id', song_team, 'url', item.youtube_url);
END;
$$;

CREATE FUNCTION public.complete_song_audio_import(p_id uuid, p_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.song_audio_attachments SET audio_path = p_path, status = 'ready', error = NULL
    WHERE id = p_id AND status = 'processing';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_song_audio_import() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_song_audio_import(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_song_audio_import() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_song_audio_import(uuid, text) TO service_role;
