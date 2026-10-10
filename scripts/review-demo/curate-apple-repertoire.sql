-- Run only as an administrative SQL transaction after the demo already exists.
-- Keeps all accounts, songs, audio, stems, cultos and the Asafe group unchanged.
-- Only the three entries of the marked Apple demo's repertoire are curated.
begin;
do $$
declare v_team uuid; v_owner uuid; v_rep uuid; v_songs uuid[]; v_count integer;
begin
  select t.id,t.owner_id into strict v_team,v_owner
    from public.teams t join public.profiles p on p.id=t.owner_id join auth.users u on u.id=p.user_id
    where t.name='Igreja Demonstração (App Review)' and u.email='revisao@maislouvor.com'
      and u.raw_app_meta_data->'review_demo'='true'::jsonb for update of t;
  select array_agg(s.id order by expected.ord),count(*) into v_songs,v_count
    from (values ('Manhã de Graça','Equipe Demonstração',1),('Rio de Paz','Equipe Demonstração',2),
      ('Baby Bird (demo)','Admiral Bob',3)) as expected(title,artist,ord)
    join public.songs s on s.team_id=v_team and s.title=expected.title and s.artist=expected.artist
    where s.audio_path is not null and not s.moderation_blocked and not s.is_draft;
  if v_count<>3 or cardinality(v_songs)<>3 then raise exception 'Confira as três músicas da demonstração antes de continuar.'; end if;
  if not exists(select 1 from public.song_tracks where song_id=v_songs[3]) then
    raise exception 'As faixas licenciadas da demonstração precisam estar disponíveis.';
  end if;
  select count(*) into v_count from public.repertorios where team_id=v_team and name='Repertório da Demonstração';
  if v_count<>1 then raise exception 'Repertório da demonstração ausente ou duplicado.'; end if;
  select id into strict v_rep from public.repertorios where team_id=v_team and name='Repertório da Demonstração' for update;
  delete from public.repertorio_songs where repertorio_id=v_rep and not(song_id=any(v_songs));
  insert into public.repertorio_songs(repertorio_id,song_id,sort_order)
    select v_rep,id,ord-1 from unnest(v_songs) with ordinality x(id,ord)
    on conflict(repertorio_id,song_id) do update set sort_order=excluded.sort_order;
end $$;
commit;
