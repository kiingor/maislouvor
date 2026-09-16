-- ============================================================================
-- Sistema de permissões granulares por membro (+Louvor)
--
-- Modelo:
--   team_members.role        -> "grupo/preset" (admin | editor | viewer)
--   team_members.permissions -> jsonb com EXCEÇÕES ao preset, por recurso/ação
--                               ex.: {"repertorios":{"editar":false},"musicas":{"ver":false}}
--
-- A função member_can(uid, team, resource, action) resolve a permissão efetiva
-- (preset + exceção) e é usada nas policies de RLS. Espelha src/lib/permissions.ts.
--
-- Recursos: musicas | repertorios | cultos | chat | avisos | membros
-- Ações:    ver | editar
-- ============================================================================

-- 1) Coluna de exceções ---------------------------------------------------------
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Resolução de permissão efetiva --------------------------------------------
CREATE OR REPLACE FUNCTION public.member_can(
  _user_id uuid,
  _team_id uuid,
  _resource text,
  _action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role     team_role;
  v_perms    jsonb;
  v_override jsonb;
BEGIN
  SELECT tm.role, COALESCE(tm.permissions, '{}'::jsonb)
    INTO v_role, v_perms
  FROM public.team_members tm
  WHERE tm.team_id = _team_id
    AND tm.profile_id = (SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1)
  LIMIT 1;

  -- não é membro da equipe
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- líder = acesso total
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  -- exceção explícita do membro?
  v_override := v_perms -> _resource -> _action;
  IF v_override IS NOT NULL THEN
    RETURN (v_override #>> '{}')::boolean;
  END IF;

  -- defaults do preset (devem casar com defaultFor() no frontend)
  IF _action = 'ver' THEN
    RETURN true;                                  -- editor e viewer enxergam tudo
  ELSIF _action = 'editar' THEN
    IF v_role = 'editor' THEN
      RETURN (_resource <> 'membros');            -- editor edita conteúdo, não gerencia membros
    ELSE
      RETURN false;                               -- viewer não edita nada
    END IF;
  END IF;

  RETURN false;
END;
$function$;

-- 3) Policies de WRITE: can_edit_team -> member_can(..., 'editar') -------------

-- songs (recurso: musicas)
ALTER POLICY "Editors can create songs" ON public.songs
  WITH CHECK (member_can(auth.uid(), team_id, 'musicas', 'editar'));
ALTER POLICY "Editors can update songs" ON public.songs
  USING (member_can(auth.uid(), team_id, 'musicas', 'editar'));
ALTER POLICY "Editors can delete songs" ON public.songs
  USING (member_can(auth.uid(), team_id, 'musicas', 'editar'));

-- song_tracks (recurso: musicas, equipe via songs)
ALTER POLICY "Editors can insert song tracks" ON public.song_tracks
  WITH CHECK (member_can(auth.uid(), (SELECT songs.team_id FROM songs WHERE songs.id = song_tracks.song_id), 'musicas', 'editar'));
ALTER POLICY "Editors can update song tracks" ON public.song_tracks
  USING (member_can(auth.uid(), (SELECT songs.team_id FROM songs WHERE songs.id = song_tracks.song_id), 'musicas', 'editar'));
ALTER POLICY "Editors can delete song tracks" ON public.song_tracks
  USING (member_can(auth.uid(), (SELECT songs.team_id FROM songs WHERE songs.id = song_tracks.song_id), 'musicas', 'editar'));

-- repertorios (recurso: repertorios)
ALTER POLICY "Editors can create repertorios" ON public.repertorios
  WITH CHECK (member_can(auth.uid(), team_id, 'repertorios', 'editar'));
ALTER POLICY "Editors can update repertorios" ON public.repertorios
  USING (member_can(auth.uid(), team_id, 'repertorios', 'editar'));
ALTER POLICY "Editors can delete repertorios" ON public.repertorios
  USING (member_can(auth.uid(), team_id, 'repertorios', 'editar'));

-- repertorio_songs (recurso: repertorios, equipe via repertorios)
ALTER POLICY "Editors can add repertorio songs" ON public.repertorio_songs
  WITH CHECK (member_can(auth.uid(), (SELECT repertorios.team_id FROM repertorios WHERE repertorios.id = repertorio_songs.repertorio_id), 'repertorios', 'editar'));
ALTER POLICY "Editors can update repertorio songs" ON public.repertorio_songs
  USING (member_can(auth.uid(), (SELECT repertorios.team_id FROM repertorios WHERE repertorios.id = repertorio_songs.repertorio_id), 'repertorios', 'editar'));
ALTER POLICY "Editors can delete repertorio songs" ON public.repertorio_songs
  USING (member_can(auth.uid(), (SELECT repertorios.team_id FROM repertorios WHERE repertorios.id = repertorio_songs.repertorio_id), 'repertorios', 'editar'));

-- cultos (recurso: cultos)
ALTER POLICY "Editors can create cultos" ON public.cultos
  WITH CHECK (member_can(auth.uid(), team_id, 'cultos', 'editar'));
ALTER POLICY "Editors can update cultos" ON public.cultos
  USING (member_can(auth.uid(), team_id, 'cultos', 'editar'));
ALTER POLICY "Editors can delete cultos" ON public.cultos
  USING (member_can(auth.uid(), team_id, 'cultos', 'editar'));

-- culto_songs (recurso: cultos, equipe via cultos)
ALTER POLICY "Editors can add culto songs" ON public.culto_songs
  WITH CHECK (member_can(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_songs.culto_id), 'cultos', 'editar'));
ALTER POLICY "Editors can update culto songs" ON public.culto_songs
  USING (member_can(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_songs.culto_id), 'cultos', 'editar'));
ALTER POLICY "Editors can delete culto songs" ON public.culto_songs
  USING (member_can(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_songs.culto_id), 'cultos', 'editar'));

-- culto_blocks (recurso: cultos, equipe via cultos)
ALTER POLICY "Editors can add culto blocks" ON public.culto_blocks
  WITH CHECK (member_can(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_blocks.culto_id), 'cultos', 'editar'));
ALTER POLICY "Editors can update culto blocks" ON public.culto_blocks
  USING (member_can(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_blocks.culto_id), 'cultos', 'editar'));
ALTER POLICY "Editors can delete culto blocks" ON public.culto_blocks
  USING (member_can(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_blocks.culto_id), 'cultos', 'editar'));

-- culto_lineup (recurso: cultos). Mantém intacta "Members can update own lineup status".
ALTER POLICY "Editors can insert culto lineup" ON public.culto_lineup
  WITH CHECK (member_can(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_lineup.culto_id), 'cultos', 'editar'));
ALTER POLICY "Editors can update culto lineup" ON public.culto_lineup
  USING (member_can(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_lineup.culto_id), 'cultos', 'editar'));
ALTER POLICY "Editors can delete culto lineup" ON public.culto_lineup
  USING (member_can(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_lineup.culto_id), 'cultos', 'editar'));

-- channels (recurso: chat -> gerenciar canais)
ALTER POLICY "Editors can add channels" ON public.channels
  WITH CHECK (member_can(auth.uid(), team_id, 'chat', 'editar'));
ALTER POLICY "Editors can update channels" ON public.channels
  USING (member_can(auth.uid(), team_id, 'chat', 'editar'));
ALTER POLICY "Editors can delete channels" ON public.channels
  USING (member_can(auth.uid(), team_id, 'chat', 'editar'));

-- notifications (recurso: avisos -> enviar). team_id nulo = notificação de sistema/pessoal.
ALTER POLICY "Team editors can create notifications" ON public.notifications
  WITH CHECK ((team_id IS NULL) OR member_can(auth.uid(), team_id, 'avisos', 'editar'));

-- team_members (recurso: membros -> gerenciar). Admin continua podendo (member_can=true p/ admin).
ALTER POLICY "Admins can add team members" ON public.team_members
  WITH CHECK (member_can(auth.uid(), team_id, 'membros', 'editar'));
ALTER POLICY "Admins can update team members" ON public.team_members
  USING (member_can(auth.uid(), team_id, 'membros', 'editar'));
ALTER POLICY "Admins can remove team members" ON public.team_members
  USING (member_can(auth.uid(), team_id, 'membros', 'editar'));

-- 4) Policies de SELECT: is_team_member -> member_can(..., 'ver') --------------
--    Aplicado só onde não quebra dados embutidos (repertório, culto, chat).
--    songs/song_tracks/team_members/profiles continuam por is_team_member
--    (músicas aparecem embutidas em listas; o contexto depende de team_members).

ALTER POLICY "Members can view repertorios" ON public.repertorios
  USING (member_can(auth.uid(), team_id, 'repertorios', 'ver'));
ALTER POLICY "Members can view repertorio songs" ON public.repertorio_songs
  USING (member_can(auth.uid(), (SELECT repertorios.team_id FROM repertorios WHERE repertorios.id = repertorio_songs.repertorio_id), 'repertorios', 'ver'));

ALTER POLICY "Members can view cultos" ON public.cultos
  USING (member_can(auth.uid(), team_id, 'cultos', 'ver'));
ALTER POLICY "Members can view culto songs" ON public.culto_songs
  USING (member_can(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_songs.culto_id), 'cultos', 'ver'));
ALTER POLICY "Members can view culto blocks" ON public.culto_blocks
  USING (member_can(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_blocks.culto_id), 'cultos', 'ver'));
ALTER POLICY "Members can view culto lineup" ON public.culto_lineup
  USING (member_can(auth.uid(), (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_lineup.culto_id), 'cultos', 'ver'));

ALTER POLICY "Members can view channels" ON public.channels
  USING (member_can(auth.uid(), team_id, 'chat', 'ver'));
ALTER POLICY "Members can view team messages" ON public.messages
  USING (member_can(auth.uid(), team_id, 'chat', 'ver'));
ALTER POLICY "Members can send team messages" ON public.messages
  WITH CHECK (member_can(auth.uid(), team_id, 'chat', 'ver')
    AND sender_profile_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid() LIMIT 1));

-- recarrega o schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
