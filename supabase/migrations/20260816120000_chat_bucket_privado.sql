-- Fecha o bucket 'chat'.
--
-- Problema: 20260614140000_chat_channels.sql criou o bucket com public = true e a
-- policy de SELECT como `using (bucket_id = 'chat')`, sem restringir a role. Isso
-- vale para `anon` — e a chave anônima está embutida no APK e no bundle web. Na
-- prática, qualquer pessoa conseguia listar as pastas por equipe e baixar os
-- áudios e fotos do chat sem nenhuma credencial (verificado em 16/08/2026).
--
-- ATENÇÃO — aplicar JUNTO com a mudança em src/components/ChatMessageBubble.tsx
-- (getPublicUrl -> createSignedUrl). Aplicar só este SQL quebra a exibição de
-- imagens e áudios do chat, porque as URLs públicas param de responder.
--
-- Convenção de caminho: chat/<team_id>/<arquivo>, então o primeiro segmento da
-- pasta é o id da equipe.

begin;

-- 1. O bucket deixa de servir objetos sem autenticação.
update storage.buckets set public = false where id = 'chat';

-- 2. Leitura: só membros da equipe dona da pasta.
drop policy if exists "Anyone can view chat media" on storage.objects;
drop policy if exists "Team members can view chat media" on storage.objects;
create policy "Team members can view chat media" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat'
    and public.is_team_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- 3. Envio: idem — antes qualquer usuário autenticado podia gravar na pasta de
--    qualquer equipe.
drop policy if exists "Authenticated can upload chat media" on storage.objects;
drop policy if exists "Team members can upload chat media" on storage.objects;
create policy "Team members can upload chat media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat'
    and public.is_team_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- 4. Exclusão continua restrita ao dono do arquivo (mantido como estava).

commit;

-- Depois de aplicar, recarregue o schema do PostgREST:
--   NOTIFY pgrst, 'reload schema';
