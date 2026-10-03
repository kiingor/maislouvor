-- Additive registration/catalog release. Existing songs remain published.
ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS recording_source_url text;
ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS audio_revision uuid;
ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS draft_repertorio_ids uuid[] NOT NULL DEFAULT '{}';

-- A replacement recording/cut must not keep stems from the previous version.
CREATE OR REPLACE FUNCTION public.invalidate_song_audio_tracks()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.audio_path IS DISTINCT FROM OLD.audio_path OR NEW.audio_revision IS DISTINCT FROM OLD.audio_revision THEN
    DELETE FROM public.song_tracks WHERE song_id=NEW.id;
    NEW.stems_status := 'idle'; NEW.stems_error := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS invalidate_song_audio_tracks ON public.songs;
CREATE TRIGGER invalidate_song_audio_tracks BEFORE UPDATE OF audio_path,audio_revision ON public.songs
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_song_audio_tracks();

CREATE OR REPLACE FUNCTION public.song_catalog_normalize(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT translate(lower(coalesce(value, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
$$;
CREATE OR REPLACE FUNCTION public.song_catalog_text(title text, artist text, tags text[])
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT public.song_catalog_normalize(coalesce(title,'') || ' ' || coalesce(artist,'') || ' ' || coalesce(array_to_string(tags,' '),''));
$$;
CREATE OR REPLACE FUNCTION public.song_registration_complete(title text, artist text, key_name text, theme text, audio_path text, cifra text, draft boolean)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT NOT coalesce(draft, false) AND nullif(btrim(title,E' \t\n\r'),'') IS NOT NULL
    AND nullif(btrim(artist,E' \t\n\r'),'') IS NOT NULL AND nullif(btrim(key_name,E' \t\n\r'),'') IS NOT NULL
    AND nullif(btrim(theme,E' \t\n\r'),'') IS NOT NULL AND nullif(btrim(audio_path,E' \t\n\r'),'') IS NOT NULL
    AND nullif(btrim(cifra,E' \t\n\r'),'') IS NOT NULL;
$$;

CREATE INDEX IF NOT EXISTS songs_catalog_text_idx ON public.songs USING gin
  (to_tsvector('simple'::regconfig, public.song_catalog_text(title, artist, tags)));
CREATE INDEX IF NOT EXISTS songs_catalog_title_idx ON public.songs(team_id, title, id) WHERE NOT is_draft;
CREATE INDEX IF NOT EXISTS songs_catalog_artist_idx ON public.songs(team_id, artist, id) WHERE NOT is_draft;
CREATE INDEX IF NOT EXISTS songs_catalog_theme_idx ON public.songs(team_id, theme, id) WHERE NOT is_draft;
CREATE INDEX IF NOT EXISTS songs_drafts_idx ON public.songs(team_id, created_by, created_at DESC) WHERE is_draft;

CREATE OR REPLACE FUNCTION public.search_song_catalog(
  p_team_id uuid, p_repertorio_id uuid DEFAULT NULL, p_query text DEFAULT '',
  p_theme text DEFAULT '', p_key text DEFAULT '', p_artist text DEFAULT '',
  p_sort text DEFAULT 'title', p_page integer DEFAULT 1, p_page_size integer DEFAULT 12,
  p_selected_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_query tsquery; v_result jsonb; v_size integer; v_page integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.member_can(auth.uid(),p_team_id,'musicas','ver') THEN
    RAISE EXCEPTION 'Sem acesso à biblioteca desta equipe.' USING ERRCODE='42501';
  END IF;
  IF p_repertorio_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.repertorios WHERE id=p_repertorio_id AND team_id=p_team_id) THEN
    RAISE EXCEPTION 'Repertório indisponível.' USING ERRCODE='42501';
  END IF;
  IF coalesce(cardinality(p_selected_ids),0)>100 THEN RAISE EXCEPTION 'Selecione até 100 músicas por vez.'; END IF;
  v_size := CASE WHEN p_page_size IN (6,12,24) THEN p_page_size ELSE 12 END;
  v_page := greatest(1,least(coalesce(p_page,1),100000));
  SELECT string_agg(quote_literal(word)||':*',' & ')::tsquery INTO v_query
    FROM regexp_split_to_table(public.song_catalog_normalize(left(p_query,200)), '[^a-z0-9]+') word WHERE word<>'';
  WITH matching AS MATERIALIZED (
    SELECT s.id,s.title,s.artist,coalesce(nullif(s.key_current,''),s.key_original) AS key_current,s.theme,s.tags,s.cover_path,s.created_at
    FROM public.songs s WHERE s.team_id=p_team_id
      AND public.song_registration_complete(s.title,s.artist,coalesce(nullif(btrim(s.key_current,E' \t\n\r'),''),s.key_original),s.theme,s.audio_path,s.cifra_text,s.is_draft)
      AND (s.recording_source_url IS NULL OR s.recording_source_url=btrim(s.media_url,E' \t\n\r'))
      AND (v_query IS NULL OR to_tsvector('simple'::regconfig,public.song_catalog_text(s.title,s.artist,s.tags)) @@ v_query)
      AND (coalesce(p_theme,'')='' OR s.theme=p_theme)
      AND (coalesce(p_key,'')='' OR coalesce(nullif(s.key_current,''),s.key_original)=p_key)
      AND (coalesce(p_artist,'')='' OR s.artist=p_artist)
      AND (p_selected_ids IS NULL OR s.id=ANY(p_selected_ids))
  ), page_rows AS (
    SELECT m.*, EXISTS(SELECT 1 FROM public.repertorio_songs r WHERE r.repertorio_id=p_repertorio_id AND r.song_id=m.id) AS already_added
    FROM matching m
    ORDER BY CASE WHEN p_sort='recent' THEN m.created_at END DESC,
      CASE WHEN p_sort='artist' THEN m.artist END ASC, m.title ASC, m.id ASC
    LIMIT v_size OFFSET (v_page-1)*v_size
  ) SELECT jsonb_build_object('songs',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM page_rows p),'[]'::jsonb),
    'total',(SELECT count(*) FROM matching),'page',v_page,'page_size',v_size) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.song_catalog_facets(p_team_id uuid,p_kind text,p_query text DEFAULT '')
RETURNS TABLE(value text) LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.member_can(auth.uid(),p_team_id,'musicas','ver') THEN
    RAISE EXCEPTION 'Sem acesso à biblioteca desta equipe.' USING ERRCODE='42501';
  END IF;
  IF p_kind NOT IN ('artist','theme') THEN RAISE EXCEPTION 'Filtro inválido.'; END IF;
  RETURN QUERY SELECT DISTINCT CASE WHEN p_kind='artist' THEN s.artist ELSE s.theme END AS value
    FROM public.songs s WHERE s.team_id=p_team_id
      AND public.song_registration_complete(s.title,s.artist,coalesce(nullif(btrim(s.key_current,E' \t\n\r'),''),s.key_original),s.theme,s.audio_path,s.cifra_text,s.is_draft)
      AND (s.recording_source_url IS NULL OR s.recording_source_url=btrim(s.media_url,E' \t\n\r'))
      AND public.song_catalog_normalize(CASE WHEN p_kind='artist' THEN s.artist ELSE s.theme END)
        LIKE '%'||replace(replace(replace(public.song_catalog_normalize(left(p_query,120)),'\','\\'),'%','\%'),'_','\_')||'%'
    ORDER BY value LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_complete_songs_to_repertorio(p_repertorio_id uuid,p_song_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_team uuid; v_ids uuid[]; v_order integer; v_count integer;
BEGIN
  SELECT team_id INTO v_team FROM public.repertorios WHERE id=p_repertorio_id FOR UPDATE;
  IF auth.uid() IS NULL OR v_team IS NULL OR NOT public.member_can(auth.uid(),v_team,'repertorios','editar') THEN
    RAISE EXCEPTION 'Sem permissão para adicionar músicas neste repertório.' USING ERRCODE='42501';
  END IF;
  SELECT array_agg(id ORDER BY first_position) INTO v_ids FROM (
    SELECT id,min(position) first_position FROM unnest(p_song_ids) WITH ORDINALITY AS selected(id,position) GROUP BY id
  ) unique_ids;
  IF coalesce(cardinality(v_ids),0)=0 THEN RETURN 0; END IF;
  IF cardinality(v_ids)>100 THEN RAISE EXCEPTION 'Selecione até 100 músicas por vez.'; END IF;
  IF (SELECT count(*) FROM public.songs s WHERE s.id=ANY(v_ids) AND s.team_id=v_team
    AND public.song_registration_complete(s.title,s.artist,coalesce(nullif(btrim(s.key_current,E' \t\n\r'),''),s.key_original),s.theme,s.audio_path,s.cifra_text,s.is_draft)
    AND (s.recording_source_url IS NULL OR s.recording_source_url=btrim(s.media_url,E' \t\n\r')))<>cardinality(v_ids) THEN
    RAISE EXCEPTION 'Uma das músicas está incompleta ou indisponível. Atualize a busca.' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(max(sort_order),-1)+1 INTO v_order FROM public.repertorio_songs WHERE repertorio_id=p_repertorio_id;
  INSERT INTO public.repertorio_songs(repertorio_id,song_id,sort_order)
    SELECT p_repertorio_id,id,v_order+position-1 FROM unnest(v_ids) WITH ORDINALITY AS selected(id,position)
    ON CONFLICT(repertorio_id,song_id) DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_song_registration(p_song_id uuid,p_repertorio_ids uuid[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_song public.songs%ROWTYPE; rep uuid;
BEGIN
  SELECT * INTO v_song FROM public.songs WHERE id=p_song_id FOR UPDATE;
  IF auth.uid() IS NULL OR v_song.id IS NULL OR NOT public.member_can(auth.uid(),v_song.team_id,'musicas','editar') THEN
    RAISE EXCEPTION 'Sem permissão para cadastrar esta música.' USING ERRCODE='42501';
  END IF;
  IF NOT public.song_registration_complete(v_song.title,v_song.artist,coalesce(nullif(btrim(v_song.key_current,E' \t\n\r'),''),v_song.key_original),v_song.theme,v_song.audio_path,v_song.cifra_text,false)
    OR nullif(btrim(v_song.key_original,E' \t\n\r'),'') IS NULL THEN
    RAISE EXCEPTION 'Preencha nome, artista, tom original, tema, cifra e áudio antes de cadastrar.' USING ERRCODE='23514';
  END IF;
  IF v_song.recording_source_url IS NOT NULL AND v_song.recording_source_url IS DISTINCT FROM btrim(v_song.media_url,E' \t\n\r') THEN
    RAISE EXCEPTION 'O link mudou. Importe o áudio desta versão novamente.' USING ERRCODE='23514';
  END IF;
  IF v_song.stems_status='processing' OR EXISTS(SELECT 1 FROM public.yt_import_jobs WHERE song_id=p_song_id AND status IN ('queued','processing'))
    OR EXISTS(SELECT 1 FROM public.song_audio_attachments WHERE song_id=p_song_id AND status<>'ready') THEN
    RAISE EXCEPTION 'Conclua ou remova as importações pendentes antes de cadastrar.' USING ERRCODE='23514';
  END IF;
  IF coalesce(cardinality(p_repertorio_ids),0)>100 THEN RAISE EXCEPTION 'Escolha até 100 repertórios.'; END IF;
  UPDATE public.songs SET is_draft=false,draft_repertorio_ids='{}' WHERE id=p_song_id;
  FOREACH rep IN ARRAY coalesce(p_repertorio_ids,'{}'::uuid[]) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.repertorios WHERE id=rep AND team_id=v_song.team_id) THEN
      RAISE EXCEPTION 'Repertório indisponível.' USING ERRCODE='42501';
    END IF;
    PERFORM public.add_complete_songs_to_repertorio(rep,ARRAY[p_song_id]);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.search_song_catalog(uuid,uuid,text,text,text,text,text,integer,integer,uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.song_catalog_facets(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.add_complete_songs_to_repertorio(uuid,uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.publish_song_registration(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_song_catalog(uuid,uuid,text,text,text,text,text,integer,integer,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.song_catalog_facets(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_complete_songs_to_repertorio(uuid,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_song_registration(uuid,uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
