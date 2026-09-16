-- Remove o trigger que notificava em massa. Salvar a escala apaga+reinsere TODAS
-- as linhas de culto_lineup, então este trigger (AFTER INSERT) re-notificava TODO
-- mundo a cada save (spam) e ainda duplicava a notificação criada no client.
-- Agora a notificação (in-app + push) vem só do client, escopada aos NOVOS membros.
drop trigger if exists on_lineup_added on public.culto_lineup;
