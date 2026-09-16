-- Acervo global de áudios baixados do YouTube, keyed pelo ID do vídeo.
-- Quando qualquer conta importa um vídeo que já foi baixado antes, o backend
-- só copia o arquivo arquivado (cópia server-side no storage) em vez de baixar
-- de novo. Acessado APENAS pelo backend (service_role); RLS sem políticas =
-- nenhum cliente lê direto.
create table if not exists public.yt_audio_cache (
  youtube_id text primary key,
  storage_path text not null,          -- ex.: _ytcache/<youtube_id>.mp3 (bucket "audio")
  duration_seconds integer,
  created_at timestamptz not null default now()
);

alter table public.yt_audio_cache enable row level security;

grant select, insert, update, delete on public.yt_audio_cache to service_role;

notify pgrst, 'reload schema';
