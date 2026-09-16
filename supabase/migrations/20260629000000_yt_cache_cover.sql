-- Guarda a capa (thumbnail do YouTube) no acervo, pra cache hits também receberem capa.
alter table public.yt_audio_cache add column if not exists cover_path text;
notify pgrst, 'reload schema';
