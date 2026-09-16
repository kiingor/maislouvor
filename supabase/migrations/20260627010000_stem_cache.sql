-- Acervo global de stems (faixas separadas pelo Demucs), keyed pelo HASH do áudio.
-- Se o MESMO áudio (bytes idênticos — vídeo do YouTube reaproveitado OU upload igual)
-- já foi separado com o mesmo modelo, o worker só COPIA as faixas em vez de rodar o
-- Demucs de novo (economiza GPU/IA). Hash do conteúdo (não o ID do vídeo) garante que
-- nunca sirva stems errados. Acessado só pelo backend (service_role).
create table if not exists public.stem_cache (
  audio_sha256 text not null,
  model        text not null,
  stems        jsonb not null,        -- [{"key":"vocals","label":"Vocais"}, ...] na ordem
  created_at   timestamptz not null default now(),
  primary key (audio_sha256, model)
);

alter table public.stem_cache enable row level security;

grant select, insert, update, delete on public.stem_cache to service_role;

notify pgrst, 'reload schema';
